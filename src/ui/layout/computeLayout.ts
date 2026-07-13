/**
 * Topology layout — deterministic 2D positions for nodes
 * and edges.
 *
 * The engine's `Topology` does not carry 2D positions;
 * they are a presentation concern. The layout module is
 * a pure function from `TopologyData` to a `TopologyLayout`
 * of `{ nodeId → { x, y } }` and `{ edgeId → { from, to } }`
 * paths.
 *
 * The layout is **deterministic**: same topology data
 * always produces the same layout. The renderer reads
 * the layout from the store (which caches it per
 * topology) and never recomputes it inside React render
 * paths.
 *
 * ## Algorithm
 *
 * Milestone 1 uses a simple BFS-based layered layout:
 *
 * 1. Find a **root** node — the first section node in
 *    insertion order. (Future sections may expose an
 *    explicit entry point via metadata.)
 * 2. Run a BFS from the root over the topology's
 *    `edges` (treating them as undirected for the
 *    purposes of layering).
 * 3. The BFS depth of each node becomes its x
 *    coordinate (scaled by `LEVEL_WIDTH`).
 * 4. Within a layer, nodes are stacked along y
 *    according to insertion order (scaled by
 *    `ROW_HEIGHT`).
 *
 * The layout is intentionally simple; later sections may
 * replace it with a proper Sugiyama-style layered
 * algorithm. The renderer treats the layout as opaque
 * — it never assumes a particular algorithm — so
 * improvements are backward-compatible.
 */

import type {
  NodeId,
  EdgeId,
  SignalId,
  PlatformId,
} from '@/types/ids';
import type { TopologyData } from '@/engine/topology';
import type { Edge, TopologyNode } from '@/types/topology';

const LEVEL_WIDTH = 100;
const ROW_HEIGHT = 60;
const ORIGIN_X = 40;
const ORIGIN_Y = 40;

export interface NodePosition {
  readonly x: number;
  readonly y: number;
}

export interface EdgeLayout {
  readonly from: NodePosition;
  readonly to: NodePosition;
  /**
   * If the edge has a `signalId`, the signal glyph is
   * drawn at the `to` end of the edge. The renderer
   * reads this rather than inferring it.
   */
  readonly signalId: SignalId | null;
}

export interface TopologyLayout {
  readonly nodes: ReadonlyMap<NodeId, NodePosition>;
  readonly edges: ReadonlyMap<EdgeId, EdgeLayout>;
  readonly width: number;
  readonly height: number;
}

export const computeLayout = (topology: TopologyData): TopologyLayout => {
  const explicit = tryExplicitLayout(topology);
  if (explicit) return explicit;

  const nodeIds: NodeId[] = [];
  for (const n of topology.nodes) nodeIds.push(n.id);

  const layer = new Map<NodeId, number>();
  const parentEdge = new Map<NodeId, EdgeId | null>();
  const nodesById = new Map<NodeId, TopologyNode>();
  for (const n of topology.nodes) nodesById.set(n.id, n);

  // BFS from the first node.
  const root: NodeId | null = nodeIds[0] ?? null;
  if (root) {
    const queue: NodeId[] = [root];
    layer.set(root, 0);
    parentEdge.set(root, null);
    const adjacency = buildAdjacency(topology.edges);
    while (queue.length > 0) {
      const current = queue.shift() as NodeId;
      const currentLayer = layer.get(current) ?? 0;
      const neighbours = adjacency.get(current) ?? [];
      for (const { nodeId, edgeId } of neighbours) {
        if (layer.has(nodeId)) continue;
        layer.set(nodeId, currentLayer + 1);
        parentEdge.set(nodeId, edgeId);
        queue.push(nodeId);
      }
    }
  }
  // Any node not reached by the BFS (disconnected graph)
  // gets the next available layer so the layout is still
  // a finite function.
  let extraLayer = 0;
  for (const id of nodeIds) {
    if (!layer.has(id)) {
      const offset = layer.size > 0 ? Math.max(...Array.from(layer.values())) : 0;
      layer.set(id, offset + 1 + extraLayer);
      extraLayer += 1;
    }
  }

  // Group nodes by layer.
  const byLayer = new Map<number, NodeId[]>();
  for (const id of nodeIds) {
    const lvl = layer.get(id) ?? 0;
    const list = byLayer.get(lvl) ?? [];
    list.push(id);
    byLayer.set(lvl, list);
  }

  const nodes = new Map<NodeId, NodePosition>();
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [lvl, ids] of byLayer) {
    const sorted = sortLayer(ids, nodeIds);
    const total = sorted.length;
    for (let i = 0; i < total; i++) {
      const id = sorted[i] as NodeId;
      const y = ORIGIN_Y + (i - (total - 1) / 2) * ROW_HEIGHT;
      const x = ORIGIN_X + lvl * LEVEL_WIDTH;
      nodes.set(id, { x, y });
      if (y > maxY) maxY = y;
      if (y < minY) minY = y;
    }
  }

  // A layer with an odd node count centres around ORIGIN_Y, which
  // can push nodes above y = 0 (e.g. a 3-way switch whose branches
  // straddle the middle row). Left alone, those nodes render above
  // the top of the SVG viewBox and get clipped — the "stray edge"
  // that trails off the top of the canvas. Shift the whole layout
  // down so the smallest y lands at ORIGIN_Y; every node stays on
  // canvas and relative spacing is unchanged.
  if (nodes.size > 0 && minY < ORIGIN_Y) {
    const shift = ORIGIN_Y - minY;
    for (const [id, pos] of nodes) {
      nodes.set(id, { x: pos.x, y: pos.y + shift });
    }
    maxY += shift;
    minY += shift;
  }

  const edges = new Map<EdgeId, EdgeLayout>();
  for (const e of topology.edges) {
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (!from || !to) continue;
    edges.set(e.id, {
      from,
      to,
      signalId: e.signalId ?? null,
    });
  }

  const maxLayer = layer.size > 0 ? Math.max(...Array.from(layer.values())) : 0;
  const width = ORIGIN_X * 2 + (maxLayer + 1) * LEVEL_WIDTH;
  const height = maxY + ORIGIN_Y + ROW_HEIGHT;

  return { nodes, edges, width, height };
};

/**
 * Build an undirected adjacency list from the edges. For
 * the purposes of layering, the graph is treated as
 * undirected so switches and bidirectional edges are
 * handled uniformly.
 */
/**
 * Infrastructure authors can hand-place a node by setting
 * `metadata.position = { x, y }` (the engine treats
 * `metadata` as an opaque bag, see {@link TopologyNode}).
 *
 * If **every** node in the topology carries a valid
 * position, that hand-authored layout is used verbatim
 * (normalised so nothing sits off-canvas). This is how a
 * real yard/station diagram — parallel roads, a throat
 * that actually looks like a throat — gets built, as
 * opposed to the BFS layering below, which only ever
 * produces a readable diagram by coincidence.
 *
 * If even one node is missing a position, we don't mix
 * hand-placed and auto-placed nodes in the same diagram
 * (that produces worse results than pure auto-layout) —
 * we fall back to the BFS layout for the whole topology.
 */
const tryExplicitLayout = (topology: TopologyData): TopologyLayout | null => {
  const nodes = new Map<NodeId, NodePosition>();
  for (const n of topology.nodes) {
    const pos = readExplicitPosition(n);
    if (!pos) return null;
    nodes.set(n.id, pos);
  }
  if (nodes.size === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of nodes.values()) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const shiftX = minX < ORIGIN_X ? ORIGIN_X - minX : 0;
  const shiftY = minY < ORIGIN_Y ? ORIGIN_Y - minY : 0;
  if (shiftX !== 0 || shiftY !== 0) {
    for (const [id, p] of nodes) {
      nodes.set(id, { x: p.x + shiftX, y: p.y + shiftY });
    }
  }

  const edges = new Map<EdgeId, EdgeLayout>();
  for (const e of topology.edges) {
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (!from || !to) continue;
    edges.set(e.id, { from, to, signalId: e.signalId ?? null });
  }

  return {
    nodes,
    edges,
    width: maxX + shiftX + ORIGIN_X,
    height: maxY + shiftY + ORIGIN_Y,
  };
};

const readExplicitPosition = (node: TopologyNode): NodePosition | null => {
  const metadata = (node as { metadata?: Readonly<Record<string, unknown>> }).metadata;
  const pos = metadata?.position;
  if (
    typeof pos === 'object' &&
    pos !== null &&
    typeof (pos as { x?: unknown }).x === 'number' &&
    typeof (pos as { y?: unknown }).y === 'number'
  ) {
    return { x: (pos as { x: number }).x, y: (pos as { y: number }).y };
  }
  return null;
};

const buildAdjacency = (
  edges: readonly Edge[],
): Map<NodeId, { nodeId: NodeId; edgeId: EdgeId }[]> => {
  const adj = new Map<NodeId, { nodeId: NodeId; edgeId: EdgeId }[]>();
  for (const e of edges) {
    pushAdjacency(adj, e.from, e.to, e.id);
    if (e.bidirectional) {
      pushAdjacency(adj, e.to, e.from, e.id);
    }
  }
  return adj;
};

const pushAdjacency = (
  adj: Map<NodeId, { nodeId: NodeId; edgeId: EdgeId }[]>,
  from: NodeId,
  to: NodeId,
  edgeId: EdgeId,
): void => {
  const list = adj.get(from) ?? [];
  list.push({ nodeId: to, edgeId });
  adj.set(from, list);
};

/**
 * Sort a layer for stable y placement. Sections come
 * before switches (sections are "platforms" / "track
 * blocks" while switches are "junctions"); the rest of
 * the tiebreak is by insertion order.
 */
const sortLayer = (ids: NodeId[], original: NodeId[]): NodeId[] => {
  const indexOf = new Map<NodeId, number>();
  for (let i = 0; i < original.length; i++) {
    indexOf.set(original[i] as NodeId, i);
  }
  return [...ids].sort((a, b) => {
    const aNode = (a as unknown as { kind?: string });
    const bNode = (b as unknown as { kind?: string });
    if (aNode.kind !== bNode.kind) {
      // sections before switches
      if (aNode.kind === 'section') return -1;
      if (bNode.kind === 'section') return 1;
    }
    return (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0);
  });
};

/**
 * Re-export for convenience. The renderer reads the
 * layout from the store and uses these types.
 */
export type { TopologyData };

/**
 * Helper: the platform id of a given section, if the
 * section is part of a platform. The renderer uses this
 * to decide whether to overlay a platform glyph.
 *
 * This is a pure function over the platform catalogue
 * and the section id; the renderer should not look up
 * platforms from the engine at render time.
 */
export const findPlatformAtSection = (
  platforms: ReadonlyMap<PlatformId, { readonly sectionIds: readonly NodeId[] }>,
  sectionId: NodeId,
): PlatformId | null => {
  for (const [pid, platform] of platforms) {
    if (platform.sectionIds.includes(sectionId)) return pid;
  }
  return null;
};

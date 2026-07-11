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
  let maxY = 0;
  for (const [lvl, ids] of byLayer) {
    const sorted = sortLayer(ids, nodeIds);
    const total = sorted.length;
    for (let i = 0; i < total; i++) {
      const id = sorted[i] as NodeId;
      const y = ORIGIN_Y + (i - (total - 1) / 2) * ROW_HEIGHT;
      const x = ORIGIN_X + lvl * LEVEL_WIDTH;
      nodes.set(id, { x, y });
      if (y > maxY) maxY = y;
    }
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

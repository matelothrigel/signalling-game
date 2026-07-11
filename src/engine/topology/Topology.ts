/**
 * Topology — the immutable infrastructure graph.
 *
 * The `Topology` is the single source of truth for the
 * **infrastructure** of the simulation: nodes (sections and
 * switches), edges, and the engine-agnostic metadata attached to
 * each. After construction the topology is **frozen** — it has
 * no mutating methods. Runtime state (occupancy, reservations,
 * switch positions, signal aspects) lives in the simulation
 * state, not here.
 *
 * Immutability guarantees:
 *
 *   - All fields are `readonly` and use `ReadonlyMap`.
 *   - `Object.freeze(this)` is called in the constructor.
 *   - No method mutates the internal state.
 *
 * Construction:
 *
 *   - Pass `{ nodes, edges }` to the constructor.
 *   - Duplicate node or edge IDs throw.
 *   - Edges referencing unknown nodes throw.
 *   - Switch legMap must be well-formed (every leg must appear
 *     in at least one legMap entry).
 *
 * Serialization:
 *
 *   - `serialize()` returns a `Versioned<TopologyData>` envelope.
 *   - `Topology.fromJSON(data)` parses and validates a raw
 *     JSON value (typically loaded from an infrastructure file)
 *     and returns a `Result<Topology, EngineError>`. The
 *     engine migrator runs first; this method only parses a
 *     value already at `CURRENT_VERSION`.
 *
 * The metadata field on nodes and edges is preserved verbatim
 * through serialization. The engine never reads it.
 */

import {
  type NodeId,
  type EdgeId,
  type SignalId,
  asId,
} from '@/types/ids';
import { type Result, type EngineError, ok, err, engineError } from '@/types/result';
import {
  type SectionNode,
  type SwitchNode,
  type Edge as TopologyEdge,
  type TopologyNode,
  isSectionNode,
  isSwitchNode,
} from '@/types/topology';
import { CURRENT_VERSION, envelope, parseVersioned, type Versioned } from '@/types/versioned';

/** Serialised form of the topology (without the version envelope). */
export interface TopologyData {
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyEdge[];
}

/** Input to the constructor. */
export interface TopologyInput {
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyEdge[];
}

export class Topology {
  private readonly nodes: ReadonlyMap<NodeId, TopologyNode>;
  private readonly edges: ReadonlyMap<EdgeId, TopologyEdge>;
  private readonly edgesByNode: ReadonlyMap<NodeId, readonly TopologyEdge[]>;

  constructor(input: TopologyInput) {
    validateInput(input);
    const nodesMap = new Map<NodeId, TopologyNode>();
    for (const n of input.nodes) {
      nodesMap.set(n.id, normaliseMetadata(n));
    }
    const edgesMap = new Map<EdgeId, TopologyEdge>();
    for (const e of input.edges) {
      edgesMap.set(e.id, normaliseMetadata(e));
    }
    this.nodes = nodesMap;
    this.edges = edgesMap;

    // Build per-node edge list for O(1) neighbour lookups.
    const edgesByNode = new Map<NodeId, TopologyEdge[]>();
    for (const e of input.edges) {
      pushEdge(edgesByNode, e.from, e);
      if (e.to !== e.from) {
        pushEdge(edgesByNode, e.to, e);
      }
    }
    this.edgesByNode = edgesByNode;

    // Freeze so accidental mutation throws in strict mode.
    Object.freeze(this);
  }

  /* ------------------------------------------------------------ */
  /* Queries                                                       */
  /* ------------------------------------------------------------ */

  /** Return the node with the given ID, or `undefined`. */
  public getNode(id: NodeId): TopologyNode | undefined {
    return this.nodes.get(id);
  }

  /** Return the edge with the given ID, or `undefined`. */
  public getEdge(id: EdgeId): TopologyEdge | undefined {
    return this.edges.get(id);
  }

  /** All nodes in the topology, in insertion order. */
  public getAllNodes(): readonly TopologyNode[] {
    return Array.from(this.nodes.values());
  }

  /** All edges in the topology, in insertion order. */
  public getAllEdges(): readonly TopologyEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Edges incident to `nodeId`. Includes both incoming and
   * outgoing edges. Used by pathfinding to enumerate neighbours.
   */
  public getEdgesFrom(nodeId: NodeId): readonly TopologyEdge[] {
    return this.edgesByNode.get(nodeId) ?? [];
  }

  /** Number of nodes. */
  public nodeCount(): number {
    return this.nodes.size;
  }

  /** Number of edges. */
  public edgeCount(): number {
    return this.edges.size;
  }

  /* ------------------------------------------------------------ */
  /* Serialization                                                 */
  /* ------------------------------------------------------------ */

  /**
   * Snapshot the topology as a versioned envelope. Metadata on
   * nodes and edges is preserved verbatim.
   */
  public serialize(): Versioned<TopologyData> {
    return envelope({
      nodes: this.getAllNodes().map((n) => normaliseMetadata(n)),
      edges: this.getAllEdges().map((e) => normaliseMetadata(e)),
    });
  }

  /**
   * Parse a raw JSON value into a `Topology`. The value is
   * expected to be a `Versioned<TopologyData>` (i.e. already at
   * `CURRENT_VERSION` — run it through the migrator first).
   *
   * Returns a `Result<Topology, EngineError>`. Does not throw.
   */
  public static fromJSON(raw: unknown): Result<Topology, EngineError> {
    const env = parseVersioned(raw);
    if (!env.ok) {
      return err(env.error);
    }
    if (env.value.version !== CURRENT_VERSION) {
      return err(
        engineError(
          'TOPOLOGY_VERSION_MISMATCH',
          `Expected version ${CURRENT_VERSION}, got ${env.value.version}`,
          { expected: CURRENT_VERSION, received: env.value.version },
        ),
      );
    }
    return Topology.fromData(env.value.data);
  }

  /**
   * Construct a `Topology` from already-parsed data. The data
   * shape is validated; malformed inputs return a structured
   * error.
   */
  public static fromData(data: unknown): Result<Topology, EngineError> {
    if (data === null || typeof data !== 'object') {
      return err(engineError('INVALID_TOPOLOGY', 'Topology data must be an object'));
    }
    const obj = data as Record<string, unknown>;
    const nodesRaw = obj.nodes;
    const edgesRaw = obj.edges;
    if (!Array.isArray(nodesRaw)) {
      return err(engineError('INVALID_TOPOLOGY', 'Topology data.nodes must be an array'));
    }
    if (!Array.isArray(edgesRaw)) {
      return err(engineError('INVALID_TOPOLOGY', 'Topology data.edges must be an array'));
    }

    const nodes: TopologyNode[] = [];
    for (let i = 0; i < nodesRaw.length; i++) {
      const n = parseNode(nodesRaw[i], i);
      if (!n.ok) return n;
      nodes.push(n.value);
    }
    const edges: TopologyEdge[] = [];
    for (let i = 0; i < edgesRaw.length; i++) {
      const e = parseEdge(edgesRaw[i], i);
      if (!e.ok) return e;
      edges.push(e.value);
    }

    try {
      return ok(new Topology({ nodes, edges }));
    } catch (err_) {
      return err(
        engineError(
          'INVALID_TOPOLOGY',
          err_ instanceof Error ? err_.message : 'Topology construction failed',
        ),
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

const pushEdge = (
  map: Map<NodeId, TopologyEdge[]>,
  key: NodeId,
  edge: TopologyEdge,
): void => {
  const existing = map.get(key);
  if (existing) {
    existing.push(edge);
  } else {
    map.set(key, [edge]);
  }
};

/**
 * Ensure the metadata field is present. The engine treats it as
 * an opaque pass-through; this just guarantees downstream code
 * can read `node.metadata` without an undefined check.
 */
const normaliseMetadata = <T extends { metadata?: Readonly<Record<string, unknown>> }>(
  obj: T,
): T & { readonly metadata: Readonly<Record<string, unknown>> } => {
  if (obj.metadata !== undefined) {
    return obj as T & { readonly metadata: Readonly<Record<string, unknown>> };
  }
  return { ...obj, metadata: {} };
};

const validateInput = (input: TopologyInput): void => {
  if (input.nodes.length === 0) {
    throw new Error('Topology: at least one node is required');
  }
  const seenNodeIds = new Set<NodeId>();
  for (const n of input.nodes) {
    if (seenNodeIds.has(n.id)) {
      throw new Error(`Topology: duplicate node id ${n.id}`);
    }
    seenNodeIds.add(n.id);
  }
  const seenEdgeIds = new Set<EdgeId>();
  for (const e of input.edges) {
    if (seenEdgeIds.has(e.id)) {
      throw new Error(`Topology: duplicate edge id ${e.id}`);
    }
    seenEdgeIds.add(e.id);
    if (!seenNodeIds.has(e.from)) {
      throw new Error(`Topology: edge ${e.id} references unknown node ${e.from}`);
    }
    if (!seenNodeIds.has(e.to)) {
      throw new Error(`Topology: edge ${e.id} references unknown node ${e.to}`);
    }
  }
  for (const n of input.nodes) {
    if (isSwitchNode(n)) {
      validateSwitchNode(n);
    }
  }
};

const validateSwitchNode = (n: SwitchNode): void => {
  const positions = Object.keys(n.legMap);
  if (positions.length === 0) {
    throw new Error(`Topology: switch ${n.id} has no legMap entries`);
  }
  for (const leg of n.legs) {
    const inNormal = n.legMap.normal.some(
      (c) => c.from === leg || c.to === leg,
    );
    const inReverse = n.legMap.reverse.some(
      (c) => c.from === leg || c.to === leg,
    );
    if (!inNormal && !inReverse) {
      throw new Error(
        `Topology: switch ${n.id} leg ${leg} is not connected in any position`,
      );
    }
  }
};

/* ------------------------------------------------------------------ */
/* JSON parsing helpers                                                */
/* ------------------------------------------------------------------ */

const parseNode = (
  raw: unknown,
  index: number,
): Result<TopologyNode, EngineError> => {
  if (raw === null || typeof raw !== 'object') {
    return err(engineError('INVALID_NODE', `nodes[${index}] must be an object`));
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0) {
    return err(engineError('INVALID_NODE', `nodes[${index}].id must be a non-empty string`));
  }
  if (o.kind === 'section') {
    const node: SectionNode = {
      kind: 'section',
      id: asId<NodeId>(o.id),
      ...(typeof o.label === 'string' ? { label: o.label } : {}),
      ...(typeof o.lengthMeters === 'number' ? { lengthMeters: o.lengthMeters } : {}),
      ...(o.metadata !== undefined && o.metadata !== null && typeof o.metadata === 'object'
        ? { metadata: o.metadata as Readonly<Record<string, unknown>> }
        : {}),
    };
    return ok(node);
  }
  if (o.kind === 'switch') {
    if (!Array.isArray(o.legs)) {
      return err(engineError('INVALID_NODE', `nodes[${index}].legs must be an array`));
    }
    if (o.legMap === null || typeof o.legMap !== 'object') {
      return err(engineError('INVALID_NODE', `nodes[${index}].legMap must be an object`));
    }
    const lm = o.legMap as Record<string, unknown>;
    if (!Array.isArray(lm.normal) || !Array.isArray(lm.reverse)) {
      return err(
        engineError('INVALID_NODE', `nodes[${index}].legMap must have normal and reverse arrays`),
      );
    }
    const legs = o.legs.map((l) => asId<NodeId>(String(l)));
    const legMap = {
      normal: (lm.normal as unknown[]).map((c) => parseLegConnection(c, index, 'normal')),
      reverse: (lm.reverse as unknown[]).map((c) => parseLegConnection(c, index, 'reverse')),
    };
    for (const arr of [...legMap.normal, ...legMap.reverse]) {
      if (!arr.ok) return arr;
    }
    const node: SwitchNode = {
      kind: 'switch',
      id: asId<NodeId>(o.id),
      legs,
      legMap: {
        normal: legMap.normal.map((r) => (r as { ok: true; value: { from: NodeId; to: NodeId } }).value),
        reverse: legMap.reverse.map((r) => (r as { ok: true; value: { from: NodeId; to: NodeId } }).value),
      },
      ...(typeof o.label === 'string' ? { label: o.label } : {}),
      ...(o.metadata !== undefined && o.metadata !== null && typeof o.metadata === 'object'
        ? { metadata: o.metadata as Readonly<Record<string, unknown>> }
        : {}),
    };
    return ok(node);
  }
  return err(
    engineError('INVALID_NODE', `nodes[${index}].kind must be "section" or "switch"`, {
      received: o.kind,
    }),
  );
};

const parseLegConnection = (
  raw: unknown,
  nodeIndex: number,
  position: string,
): Result<{ from: NodeId; to: NodeId }, EngineError> => {
  if (raw === null || typeof raw !== 'object') {
    return err(
      engineError(
        'INVALID_LEG_CONNECTION',
        `nodes[${nodeIndex}].legMap.${position} entries must be objects`,
      ),
    );
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.from !== 'string' || typeof o.to !== 'string') {
    return err(
      engineError(
        'INVALID_LEG_CONNECTION',
        `nodes[${nodeIndex}].legMap.${position} entries must have from and to strings`,
      ),
    );
  }
  return ok({ from: asId(o.from), to: asId(o.to) });
};

const parseEdge = (
  raw: unknown,
  index: number,
): Result<TopologyEdge, EngineError> => {
  if (raw === null || typeof raw !== 'object') {
    return err(engineError('INVALID_EDGE', `edges[${index}] must be an object`));
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0) {
    return err(engineError('INVALID_EDGE', `edges[${index}].id must be a non-empty string`));
  }
  if (typeof o.from !== 'string' || typeof o.to !== 'string') {
    return err(
      engineError('INVALID_EDGE', `edges[${index}].from and .to must be strings`),
    );
  }
  if (typeof o.bidirectional !== 'boolean') {
    return err(
      engineError('INVALID_EDGE', `edges[${index}].bidirectional must be a boolean`),
    );
  }
  const edge: TopologyEdge = {
    id: asId<EdgeId>(o.id),
    from: asId<NodeId>(o.from),
    to: asId<NodeId>(o.to),
    bidirectional: o.bidirectional,
    ...(typeof o.signalId === 'string'
      ? { signalId: asId<SignalId>(o.signalId) }
      : {}),
    ...(o.metadata !== undefined && o.metadata !== null && typeof o.metadata === 'object'
      ? { metadata: o.metadata as Readonly<Record<string, unknown>> }
      : {}),
  };
  return ok(edge);
};

// Re-export the isSectionNode/isSwitchNode guards for convenience.
export { isSectionNode, isSwitchNode };

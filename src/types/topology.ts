/**
 * Topology graph types.
 *
 * The infrastructure is modelled as a directed graph of two node
 * kinds joined by edges. The engine makes **no assumptions** about
 * the shape of a station, junction, yard, terminal, or future
 * multi-zone network — every routing algorithm operates on this
 * graph.
 *
 * See `ARCHITECTURE.md` §4 for the full topology model.
 */

import type { NodeId, EdgeId, SignalId } from './ids';

/** A plain track section (block) in the topology graph. */
export interface SectionNode {
  readonly kind: 'section';
  readonly id: NodeId;
  /** Optional human-readable label, e.g. "T1", "Block A". */
  readonly label?: string;
  /** Length in meters. Used for timing / distance estimates. */
  readonly lengthMeters?: number;
  /**
   * Arbitrary, engine-agnostic metadata. The engine never reads
   * this field; it is preserved verbatim through serialization so
   * downstream systems (and future engine features) can carry
   * domain-specific data — e.g. line speed, electrification,
   * kilometer position, axle counter type, ETCS/ATP info, custom
   * scenario tags.
   *
   * Authors may use any JSON-serialisable shape. The engine
   * treats unknown metadata as a black box.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * A directed connection between two legs of a switch when in a given
 * position. Listed inside {@link SwitchNode.legMap}.
 */
export interface LegConnection {
  readonly from: NodeId;
  readonly to: NodeId;
}

/**
 * The leg connectivity of a switch, keyed by position.
 *
 * Concrete interface (rather than `Record<SwitchPosition, ...>`) so
 * TypeScript can verify all positions are present and IDEs surface
 * the available keys. Extending to additional positions is a
 * deliberate, visible type change.
 */
export interface SwitchLegMap {
  readonly normal: readonly LegConnection[];
  readonly reverse: readonly LegConnection[];
}

/**
 * A switch (turnout) node.
 *
 * - `legs` lists the adjacent node IDs in the order chosen by the
 *   infrastructure author.
 * - `legMap` explicitly describes, for each `SwitchPosition`, which
 *   leg pairs are connected. This is the single source of truth for
 *   switch-driven connectivity — edges do not redundantly encode it.
 *
 * Examples:
 *
 *   2-leg switch with legs `[A, B]` (positions are physically
 *   different but always connect the same two legs):
 *     legMap = {
 *       normal:  [{ from: A, to: B }, { from: B, to: A }],
 *       reverse: [{ from: A, to: B }, { from: B, to: A }],
 *     }
 *
 *   3-leg switch with legs `[A, B, C]` (A is the stem):
 *     legMap = {
 *       normal:  [{ from: A, to: B }, { from: B, to: A }],
 *       reverse: [{ from: A, to: C }, { from: C, to: A }],
 *     }
 *
 * N-leg switches are possible by extending `SwitchLegMap`.
 */
export interface SwitchNode {
  readonly kind: 'switch';
  readonly id: NodeId;
  readonly legs: readonly NodeId[];
  readonly label?: string;
  readonly legMap: SwitchLegMap;
  /**
   * Arbitrary, engine-agnostic metadata. The engine never reads
   * this field; it is preserved verbatim through serialization.
   * See {@link SectionNode.metadata} for the full rationale and
   * supported use cases.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Discriminated union of all topology node kinds. */
export type TopologyNode = SectionNode | SwitchNode;

/**
 * A directed edge in the topology graph.
 *
 * Edge *activity* is derived, not stored on the edge:
 *   - If both endpoints are sections, the edge is always active.
 *   - If either endpoint is a switch, the edge is active only when
 *     the switch's `legMap` at the current position contains a
 *     connection between the two endpoints.
 *
 * The `Topology` class computes activity from switch positions.
 */
export interface Edge {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  /** Optional signal controlling entry to `to`. */
  readonly signalId?: SignalId;
  /** If true, the edge may be traversed from `to` to `from` as well. */
  readonly bidirectional: boolean;
  /**
   * Arbitrary, engine-agnostic metadata. The engine never reads
   * this field; it is preserved verbatim through serialization.
   * See {@link SectionNode.metadata} for the full rationale and
   * supported use cases.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Type guard: is the given node a section? */
export const isSectionNode = (n: TopologyNode): n is SectionNode =>
  n.kind === 'section';

/** Type guard: is the given node a switch? */
export const isSwitchNode = (n: TopologyNode): n is SwitchNode =>
  n.kind === 'switch';

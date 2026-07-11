/**
 * Infrastructure definitions that are not part of the topology graph
 * itself: signals (attached to edges), platforms (attached to
 * sections), and the runtime state of switches.
 *
 * `TrackSection` is intentionally NOT defined here as a separate
 * type — the topology graph's {@link SectionNode} is the only source
 * of truth for section definitions. Platforms reference sections by
 * their `NodeId`.
 */

import type { NodeId, EdgeId, SwitchId, SignalId, PlatformId, RouteId, TrainId } from './ids';
import type { SwitchPosition, Aspect } from './primitives';
/**
 * Authored signal definition. Signals are attached to edges (they
 * guard entry to the edge's `to` end).
 */
export interface Signal {
  readonly id: SignalId;
  readonly edgeId: EdgeId;
  readonly label?: string;
  /**
   * `true` for automatic signals (aspect computed from route state).
   * Manual signals are not implemented in milestone 1.
   */
  readonly automatic: boolean;
}

/**
 * A platform attached to one or more sections. A platform's
 * `sectionIds` span the track the platform serves.
 */
export interface Platform {
  readonly id: PlatformId;
  /** Human-readable name, e.g. "Platform 2". */
  readonly name: string;
  readonly sectionIds: readonly NodeId[];
}

/**
 * Runtime state of a switch in the simulation. The switch's
 * topological definition (legs, legMap) lives on
 * {@link SwitchNode}; this is the per-tick state.
 *
 * **Lifecycle.** The `lifecycle` field is the source of truth.
 * `lockedBy` and `occupiedBy` identify the route / train that
 * currently holds the switch; they are `null` unless the
 * lifecycle is `locked` / `reserved` (for `lockedBy`) or
 * `occupied` (for `occupiedBy`).
 *
 * The legacy `locked: boolean` and `occupied: boolean` were
 * removed in Section 5 in favour of the unified lifecycle. See
 * `engine/switches/SwitchStateStore` for the transition model.
 */
export interface SwitchState {
  /** The switch's stable ID (also the switch node's `NodeId`). */
  readonly id: SwitchId;
  /** Current physical position. */
  readonly position: SwitchPosition;
  /** Lifecycle state — see `SwitchLifecycleState`. */
  readonly lifecycle: import('@/engine/switches/SwitchLifecycleState').SwitchLifecycleState;
  /** Route that has reserved or locked this switch, if any. */
  readonly lockedBy: RouteId | null;
  /** Train currently occupying the switch, if any. */
  readonly occupiedBy: TrainId | null;
}

/**
 * Runtime state of a track section in the simulation. The section's
 * topological definition (id, label, length) lives on
 * {@link SectionNode}; this is the per-tick state.
 */
export interface SectionState {
  /** The section's stable `NodeId`. */
  readonly id: NodeId;
  /** A train currently occupies the section, if any. */
  readonly occupiedBy: TrainId | null;
  /** A route has reserved the section, if any. */
  readonly reservedBy: RouteId | null;
}

/**
 * Runtime state of a signal in the simulation. The signal's
 * static definition (id, edge, automatic) lives on {@link Signal};
 * this is the per-tick state.
 *
 * **Signals are derived views of the interlocking state.** The
 * `aspect` is set by the interlocking engine (Section 7), not
 * by the signal itself. The signal state store records the
 * engine's decision and the `lastChangeReason` describes *why*
 * the aspect changed.
 */
export interface SignalState {
  readonly id: SignalId;
  readonly aspect: Aspect;
  /** The route that currently controls this signal, if any. */
  readonly controlledBy: RouteId | null;
  /** The structured reason for the most recent aspect change. */
  readonly lastChangeReason: import('@/engine/signals').SignalAspectChangeReason;
  /** Sim-time of the most recent aspect change. */
  readonly lastChangeAtSimTime: number;
}

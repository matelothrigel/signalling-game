/**
 * Train domain model.
 *
 * A train is a runtime simulation object. Its behaviour is
 * modelled as a **finite state machine** (FSM) — see
 * `engine/trains/TrainFsmState` for the full state set.
 * Booleans like `stopped` or `isApproaching` are intentionally
 * not used; the FSM state is the single source of truth for
 * what the train is doing at any given sim-time.
 *
 * ## Immutability
 *
 * **`TrainDefinition` is immutable** — it is loaded from the
 * scenario file and never mutated. It carries the static data
 * the train was born with: identifier, length, maximum speed,
 * platforms it must stop at, and its entry/exit edges.
 *
 * **`TrainState` is the runtime counterpart.** It carries
 * everything the simulation has learned about the train since
 * it spawned: the FSM state, current edge, position along the
 * edge, current route, remaining planned edges, the time of
 * the last tick, and the running delay.
 *
 * The **timetable definition** (in `Scenario.timetable`) is
 * likewise immutable: the scenario scheduler walks the
 * timetable and emits events; it never rewrites the
 * definition.
 *
 * ## Position
 *
 * Position is described as a graph edge with a parameter
 * `t ∈ [0, 1]` along that edge for continuous visual
 * interpolation between ticks. The engine advances `t` to 0
 * or 1 and emits `TRAIN_ENTERED_SECTION` / `TRAIN_LEFT_SECTION`
 * events on every crossing. The renderer reads `t` directly
 * for smooth animation.
 *
 * ## Movement
 *
 * In milestone 1 trains move forward along their planned
 * route, one section per tick scaled by the definition's
 * `speedSectionsPerTick` (default 1). They obey signals,
 * stop at platforms flagged in `stopsAtPlatforms`, and leave
 * the controlled area when they reach their `exitEdgeId`.
 */

import type { TrainId, EdgeId, RouteId, PlatformId } from './ids';
import type { Direction } from './primitives';
import type { TrainFsmState } from '@/engine/trains/TrainFsmState';

/** Static definition of a train (read from the scenario). Immutable. */
export interface TrainDefinition {
  readonly id: TrainId;
  /** Display label, e.g. "IC101". */
  readonly label: string;
  /** Train length in meters; used for visualisation and platform fit. */
  readonly lengthMeters: number;
  /** Maximum speed in km/h. */
  readonly maxSpeedKmh: number;
  /**
   * Sections per simulation tick. The motion controller converts this
   * to discrete section advances. In milestone 1, this is typically
   * `1` (advance one section per tick while the route is clear).
   *
   * Sub-tick rates (e.g. `0.5`) are reserved for future "slow approach"
   * motion and are not used in milestone 1.
   */
  readonly speedSectionsPerTick: number;
  /**
   * Optional platforms where the train must stop (e.g. passenger
   * service at a platform). The train holds at the platform until
   * the dispatcher releases it (in milestone 1, via a
   * `DISPATCH_TRAIN` command) or the timetable schedules a
   * departure.
   */
  readonly stopsAtPlatforms?: readonly PlatformId[];
  /**
   * Where the train enters the controlled area, given as the edge
   * it will appear on. Used by the scenario scheduler to spawn
   * the train. The train's initial state is `WaitingForEntry` on
   * this edge.
   */
  readonly entryEdgeId: EdgeId;
  /**
   * Where the train leaves the controlled area. The train follows
   * its planned route to this edge, transitions through
   * `LeavingControlledArea`, and is then removed.
   */
  readonly exitEdgeId: EdgeId;
}

/**
 * Runtime state of a train in the simulation.
 *
 * Position is represented as a graph edge with a `t` parameter
 * so the renderer can interpolate smoothly between ticks. The
 * engine advances `t` to 0 or 1; the renderer reads it directly.
 *
 * The `fsmState` is the **source of truth** for what the train
 * is doing. Booleans are intentionally not present — the
 * `TrainMotionService` computes the next state and replaces
 * the whole `TrainState` record.
 */
export interface TrainState {
  readonly id: TrainId;
  readonly direction: Direction;
  /**
   * The train's current FSM state. The state determines which
   * actions the motion service will take on the next tick.
   *
   * State transitions are computed by `TrainMotionService`
   * and applied by replacing the whole `TrainState`. The state
   * is never mutated in place.
   */
  readonly fsmState: TrainFsmState;
  /** The edge the train currently occupies. `null` only at spawn. */
  readonly currentEdgeId: EdgeId | null;
  /**
   * Position along `currentEdgeId` in `[0, 1]`. `0` = at `from`,
   * `1` = at `to`. Pure visual / motion state — the engine
   * never stores finer position.
   */
  readonly edgePosition: number;
  /** The active route, if any. */
  readonly routeId: RouteId | null;
  /** The remaining planned edge sequence, after the current edge. */
  readonly remainingEdges: readonly EdgeId[];
  /**
   * The platform at which the train is currently held, if any.
   * Set by the motion service when entering `StoppedAtPlatform`
   * and cleared on departure.
   */
  readonly heldAtPlatform: PlatformId | null;
  /**
   * Sim-time of the most recent tick that touched this train's
   * state. Used to compute `delaySeconds` and to make motion
   * decisions deterministic across replays.
   */
  readonly lastTickAtSimTime: number;
  /**
   * Delay relative to the train's planned schedule, in
   * simulation seconds. Always 0 in milestone 1 (delays are
   * not yet modelled). The field exists so future sections
   * can track delay without changing the public shape.
   */
  readonly delaySeconds: number;
}

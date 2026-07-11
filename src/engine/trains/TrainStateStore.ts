/**
 * TrainStateStore — runtime state of every train in the
 * controlled area.
 *
 * The store is the **single source of truth** for the runtime
 * state of every train. It holds one {@link TrainState} per
 * `TrainId` and exposes explicit mutators that **replace** the
 * whole `TrainState` record (since `TrainState` is itself
 * immutable, by design).
 *
 * ## Design
 *
 * - `TrainDefinition` is immutable (loaded from the scenario
 *   file and never mutated). It lives outside this store.
 * - `TrainState` is the runtime counterpart: it carries the
 *   FSM state, current edge, position, current route, etc.
 * - The store does not contain business logic. It does not
 *   decide whether the train may move, whether a route is
 *   valid, or whether a platform is in the catalogue. Those
 *   decisions live in `TrainMotionService`, `InterlockingEngine`,
 *   and the platform catalogue (added in Section 10).
 * - The store is a passive data structure. The motion service
 *   reads the current state, computes the next state, and
 *   writes it back via `setState`. The state is never
 *   mutated in place.
 *
 * ## Determinism
 *
 * The store is deterministic: same inputs, same outputs.
 * `serialize()` captures the full state; `load()` restores it
 * exactly. Replaying the same scenario from the same
 * serialized state is bit-identical.
 */

import { type Result, type EngineError, ok, err } from '@/types/result';
import { asId, type NodeId, type EdgeId, type TrainId, type RouteId, type PlatformId } from '@/types/ids';
import type { TrainState, TrainDefinition } from '@/types/trains';
import type { TrainFsmState } from './TrainFsmState';
import { TrainReasonCode, trainError } from './TrainReasonCode';

export interface TrainStateStoreSerialized {
  readonly trains: Readonly<Record<string, TrainState>>;
}

export class TrainStateStore {
  private readonly states: Map<TrainId, TrainState>;

  constructor() {
    this.states = new Map();
  }

  /* ------------------------------------------------------------ */
  /* Queries                                                       */
  /* ------------------------------------------------------------ */

  public get(id: TrainId): TrainState | undefined {
    return this.states.get(id);
  }

  public require(id: TrainId): TrainState {
    const s = this.states.get(id);
    if (!s) throw new Error(`TrainStateStore: unknown train ${id}`);
    return s;
  }

  public getAll(): readonly TrainState[] {
    return Array.from(this.states.values());
  }

  public size(): number {
    return this.states.size;
  }

  /** Return every train currently in the given FSM state. */
  public findByState(fsmState: TrainFsmState): readonly TrainState[] {
    const out: TrainState[] = [];
    for (const s of this.states.values()) {
      if (s.fsmState === fsmState) out.push(s);
    }
    return out;
  }

  /** Return every train currently on the given route. */
  public findByRoute(routeId: RouteId): readonly TrainState[] {
    const out: TrainState[] = [];
    for (const s of this.states.values()) {
      if (s.routeId === routeId) out.push(s);
    }
    return out;
  }

  /** Return every train currently on the given edge. */
  public findByEdge(edgeId: EdgeId): readonly TrainState[] {
    const out: TrainState[] = [];
    for (const s of this.states.values()) {
      if (s.currentEdgeId === edgeId) out.push(s);
    }
    return out;
  }

  /**
   * Return every train currently held at the given platform
   * (i.e. in `StoppedAtPlatform` with `heldAtPlatform === pid`).
   */
  public findHeldAtPlatform(pid: PlatformId): readonly TrainState[] {
    const out: TrainState[] = [];
    for (const s of this.states.values()) {
      if (s.fsmState === 'StoppedAtPlatform' && s.heldAtPlatform === pid) {
        out.push(s);
      }
    }
    return out;
  }

  /**
   * Return the id of every section the trains are currently
   * occupying, along with the occupying train (or the first
   * train found on that section). Used by the motion service
   * to coordinate section occupancy.
   *
   * In milestone 1 the motion service tracks section
   * occupancy via `SectionStateStore`; this method is kept
   * as a hook for future refinement and currently returns
   * an empty list.
   */
  // The `sectionId` parameter is reserved for future use
  // (e.g. the query that returns the train on a specific
  // section). The underscore prefix is the ESLint
  // convention for intentionally unused parameters.
  public trainsOnSection(_sectionId: NodeId): readonly TrainState[] {
    return [];
  }

  /* ------------------------------------------------------------ */
  /* Mutators                                                      */
  /* ------------------------------------------------------------ */

  /**
   * Spawn a train from its definition. The train's initial
   * state is `WaitingForEntry` on the definition's
   * `entryEdgeId`. The caller is responsible for verifying
   * that the edge exists in the topology (the store does not
   * read the topology; it just records the edge id).
   */
  public spawn(
    definition: TrainDefinition,
    atSimTime: number,
  ): Result<TrainState, EngineError> {
    if (this.states.has(definition.id)) {
      return err(
        trainError(TrainReasonCode.ALREADY_EXISTS, {
          trainId: definition.id,
        }),
      );
    }
    const state: TrainState = {
      id: definition.id,
      direction: 'forward',
      fsmState: 'WaitingForEntry',
      currentEdgeId: definition.entryEdgeId,
      edgePosition: 0,
      routeId: null,
      remainingEdges: [],
      heldAtPlatform: null,
      lastTickAtSimTime: atSimTime,
      delaySeconds: 0,
    };
    this.states.set(definition.id, state);
    return ok(state);
  }

  /**
   * Replace the train's whole state record. Returns the new
   * state, or an `EngineError` if the train does not exist.
   */
  public setState(state: TrainState): Result<TrainState, EngineError> {
    if (!this.states.has(state.id)) {
      return err(trainError(TrainReasonCode.UNKNOWN, { trainId: state.id }));
    }
    this.states.set(state.id, state);
    return ok(state);
  }

  /**
   * Apply a mutator function to the train's state. The mutator
   * receives the current state and returns the next state. The
   * store applies the replacement atomically and returns the
   * new state. This is the canonical way for the motion service
   * to advance a train.
   */
  public update(
    id: TrainId,
    mutator: (current: TrainState) => TrainState,
  ): Result<TrainState, EngineError> {
    const current = this.states.get(id);
    if (!current) {
      return err(trainError(TrainReasonCode.UNKNOWN, { trainId: id }));
    }
    const next = mutator(current);
    this.states.set(id, next);
    return ok(next);
  }

  /**
   * Remove a train from the store. Returns the removed state
   * for diagnostics, or `null` if the train was not present.
   */
  public remove(id: TrainId): Result<TrainState, EngineError> {
    const s = this.states.get(id);
    if (!s) {
      return err(trainError(TrainReasonCode.UNKNOWN, { trainId: id }));
    }
    this.states.delete(id);
    return ok(s);
  }

  /* ------------------------------------------------------------ */
  /* Serialization                                                 */
  /* ------------------------------------------------------------ */

  public serialize(): TrainStateStoreSerialized {
    const trains: Record<string, TrainState> = {};
    for (const [id, state] of this.states) {
      trains[id] = state;
    }
    return { trains };
  }

  public load(snap: TrainStateStoreSerialized): Result<void, EngineError> {
    this.states.clear();
    for (const [rawId, state] of Object.entries(snap.trains)) {
      this.states.set(asId<TrainId>(rawId), state);
    }
    return ok(undefined);
  }
}

/**
 * Convenience type guard: is the given `TrainState`'s FSM
 * state "stationary" (train is not currently moving under
 * its own power)?
 */
export const isTrainStateStationary = (s: TrainState): boolean =>
  s.fsmState === 'StoppedAtSignal' ||
  s.fsmState === 'StoppedAtPlatform' ||
  s.fsmState === 'Finished';

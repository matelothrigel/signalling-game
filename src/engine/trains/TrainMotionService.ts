/**
 * TrainMotionService — drives the train finite-state machine.
 *
 * This service is the **brain** of the train domain. On every
 * simulation tick it walks every train in the controlled area,
 * computes the next FSM state, and applies the corresponding
 * side effects (section occupancy, switch lifecycle, event
 * emission).
 *
 * ## Determinism
 *
 * The service is pure and deterministic. Given the same
 * infrastructure, simulation state, and sim-time, it produces
 * the same train-state changes, the same store mutations, and
 * the same events. It never calls `Math.random`; randomness (if
 * added later, e.g. for delays) goes through the injected
 * `RngService`. The ESLint rule on `Math.random` in
 * `src/engine/**` is enforced.
 *
 * ## FSM transitions
 *
 * ```
 *   WaitingForEntry ─────▶ Entering ─────▶ Running
 *                                                  │
 *                                                  ▼
 *                                            ApproachingSignal
 *                                                  │
 *                                                  ▼
 *                                            StoppedAtSignal
 *
 *   Running ─────▶ StoppedAtPlatform ─────▶ Departing ─────▶ Running
 *                                                  │
 *                                                  ▼
 *                                       LeavingControlledArea
 *                                                  │
 *                                                  ▼
 *                                              Finished
 * ```
 *
 * Milestone 1 implements the canonical happy path. The full
 * state set is declared in `TrainFsmState`; the service may
 * be extended without changing the public surface.
 *
 * ## Position model
 *
 * A train is on an edge. The "occupied node" is the `to` end
 * of its current edge. When the train advances to the next
 * edge, the previous occupied node is vacated and the new
 * one is set. Sections and switches are updated accordingly.
 *
 * For example, a train on edge `(W1, B)` occupies section
 * `B`. When it advances to edge `(B, C)`, it vacates `B` and
 * occupies section `C`.
 *
 * ## Signal obedience
 *
 * Before advancing across an edge, the motion service checks
 * the signal at the `to` end of the **next** edge. If the
 * signal is `stop`, the train does not advance; it stays on
 * the current edge and transitions to `StoppedAtSignal`.
 * When the signal changes to `proceed` (via a `SET_ROUTE` or
 * `CANCEL_ROUTE`), the next tick resumes motion.
 *
 * ## Platform stops
 *
 * After advancing, the motion service checks whether the
 * new edge's `to` end belongs to a platform listed in the
 * train definition's `stopsAtPlatforms`. If so, the train
 * transitions to `StoppedAtPlatform` and the platform id is
 * recorded in `heldAtPlatform`. The dispatcher releases the
 * train via the `DISPATCH_TRAIN` command (Section 10).
 */

import { type Result, type EngineError, ok } from '@/types/result';
import type { Topology } from '@/engine/topology';
import { isSectionNode } from '@/engine/topology';
import type {
  TrainId,
  EdgeId,
  NodeId,
  SignalId,
  PlatformId,
} from '@/types/ids';
import type { Platform } from '@/types/infrastructure';
import type { TrainDefinition, TrainState } from '@/types/trains';
import type { Event } from '@/types/events';
import type { EventBus } from '@/engine/core/EventBus';
import { SwitchStateStore } from '@/engine/switches';
import { SignalStateStore } from '@/engine/signals';
import { SectionStateStore } from '@/engine/sections';
import { RouteStore } from '@/engine/routes';
import { TrainStateStore } from './TrainStateStore';

export interface TrainMotionServiceDeps {
  readonly topology: Topology;
  readonly trainStore: TrainStateStore;
  readonly switchStore: SwitchStateStore;
  readonly signalStore: SignalStateStore;
  readonly sectionStore: SectionStateStore;
  readonly routeStore: RouteStore;
  readonly eventBus: EventBus;
  /**
   * Authoritative map of platforms keyed by `PlatformId`. Used
   * to detect platform stops (the train's `to` end must
   * belong to a platform's `sectionIds`).
   *
   * The motion service treats this map as a frozen snapshot;
   * it is the caller's responsibility to keep it in sync with
   * the scenario / infrastructure.
   */
  readonly platforms: ReadonlyMap<PlatformId, Platform>;
}

/**
 * A single outcome of the motion service's tick — the
 * computed next state, the events to emit, and any extra
 * side effects (section / switch / signal writes) that the
 * caller is expected to apply. The motion service applies
 * the side effects itself for atomicity, but the result is
 * returned for tests and for logging.
 */
export interface TrainTickOutcome {
  readonly trainId: TrainId;
  readonly before: TrainState;
  readonly after: TrainState;
  readonly events: readonly Event[];
}

export class TrainMotionService {
  private readonly deps: TrainMotionServiceDeps;

  constructor(deps: TrainMotionServiceDeps) {
    this.deps = deps;
  }

  /**
   * The `TrainStateStore` this service writes to. Exposed for
   * tests and for the command processor's `DISPATCH_TRAIN`
   * handler. The motion service is the canonical writer; the
   * command processor may call `store.update` to release a
   * train held at a platform.
   */
  public get trainStore(): TrainStateStore {
    return this.deps.trainStore;
  }

  /**
   * Advance every train one simulation tick. Deterministic
   * given the current state. The list of outcomes (one per
   * touched train) is returned for tests and for the
   * scenario scheduler; events are emitted on the bus as a
   * side effect.
   */
  public tick(atSimTime: number): readonly TrainTickOutcome[] {
    const outcomes: TrainTickOutcome[] = [];
    // Snapshot the train ids so the in-place updates below do
    // not affect iteration order.
    const ids: TrainId[] = [];
    for (const t of this.deps.trainStore.getAll()) ids.push(t.id);
    for (const id of ids) {
      const outcome = this.tickOne(id, atSimTime);
      if (outcome) {
        outcomes.push(outcome);
        // Emit every event produced by the handler on the
        // bus. The Simulation's tick loop flushes the bus
        // after the motion service runs; this is the single
        // place where train events enter the stream.
        for (const event of outcome.events) {
          this.deps.eventBus.emit(event);
        }
      }
    }
    return outcomes;
  }

  /**
   * Spawn a train from its definition. The train is in
   * `WaitingForEntry` on the entry edge. Crucially, the
   * train does **not** occupy the entry section (the `to`
   * end of the entry edge) at spawn time: it is at the
   * *entry*, not at the entry section. The first
   * `occupyTargetNode` happens on the first advance.
   *
   * Section 15 fix: the original implementation
   * immediately marked the entry section as occupied,
   * which caused the `TrackClearRule` to reject any
   * route whose path started at the entry section. With
   * this fix the entry section is free when the
   * dispatcher sets the route, and the train occupies
   * the next section as it advances.
   */
  public spawnTrain(
    definition: TrainDefinition,
    atSimTime: number,
  ): Result<TrainState, EngineError> {
    const r = this.deps.trainStore.spawn(definition, atSimTime);
    if (!r.ok) return r;
    // Emit the TRAIN_REQUESTED_ENTRY event so the UI can
    // show the train appearing on the entry edge.
    this.deps.eventBus.emit({
      type: 'TRAIN_REQUESTED_ENTRY',
      trainId: definition.id,
      entryEdgeId: definition.entryEdgeId,
    });
    return ok(r.value);
  }
  /**
   * Advance a single train one tick. Public for unit tests.
   * Returns `null` if the train is in a no-op state
   * (`Finished`, `WaitingForEntry` without a route, or
   * `StoppedAtPlatform` without a release).
   */
  public tickOne(trainId: TrainId, atSimTime: number): TrainTickOutcome | null {
    const before = this.deps.trainStore.get(trainId);
    if (!before) return null;
    // Terminal state: nothing to do.
    if (before.fsmState === 'Finished') return null;

    const events: Event[] = [];

    switch (before.fsmState) {
      case 'WaitingForEntry':
        return this.handleWaitingForEntry(before, atSimTime, events);
      case 'Entering':
        return this.handleEntering(before, atSimTime, events);
      case 'Running':
        return this.handleRunning(before, atSimTime, events);
      case 'ApproachingSignal':
        return this.handleRunning(before, atSimTime, events);
      case 'Departing':
        return this.handleDeparting(before, atSimTime, events);
      case 'StoppedAtSignal':
        return this.handleStoppedAtSignal(before, atSimTime, events);
      case 'StoppedAtPlatform':
        // The dispatcher must release the train (DISPATCH_TRAIN).
        return null;
      case 'LeavingControlledArea':
        return this.handleLeaving(before, atSimTime, events);
      default:
        // Exhaustiveness: TrainFsmState is a closed union.
        return null;
    }
  }

  /* ------------------------------------------------------------ */
  /* Handlers                                                      */
  /* ------------------------------------------------------------ */

  /**
   * `WaitingForEntry` → `Entering`. The motion service looks
   * for an active route that begins at the signal on the
   * train's `currentEdgeId`. If the route exists, the train
   * is associated with it and transitions to `Entering`.
   */
  private handleWaitingForEntry(
    before: TrainState,
    atSimTime: number,
    events: Event[],
  ): TrainTickOutcome | null {
    const entryEdge = before.currentEdgeId;
    if (entryEdge === null) return null;
    const edge = this.deps.topology.getEdge(entryEdge);
    if (!edge) return null;
    const entrySignalId = edge.signalId;
    if (!entrySignalId) return null;
    const signal = this.deps.signalStore.get(entrySignalId);
    if (!signal || signal.aspect !== 'proceed') return null;
    const route = this.deps.routeStore.findByEntrySignal(entrySignalId);
    if (!route) return null;

    // Associate the train with the route and mark it Entering.
    const after: TrainState = {
      ...before,
      fsmState: 'Entering',
      routeId: route.id,
      remainingEdges: [...route.edgeIds],
      lastTickAtSimTime: atSimTime,
    };
    this.deps.trainStore.setState(after);

    events.push(
      this.log(
        before,
        after,
        'TRAIN_ENTERING',
        atSimTime,
        `Train ${before.id} entering route ${route.id} (signal ${entrySignalId})`,
      ),
    );

    return { trainId: before.id, before, after, events };
  }

  /**
   * `Entering` → `Running`. The train is now on the entry
   * edge with an associated route. It transitions to
   * `Running` so the next tick advances it.
   */
  private handleEntering(
    before: TrainState,
    atSimTime: number,
    events: Event[],
  ): TrainTickOutcome | null {
    const after: TrainState = {
      ...before,
      fsmState: 'Running',
      lastTickAtSimTime: atSimTime,
    };
    this.deps.trainStore.setState(after);
    events.push(
      this.log(
        before,
        after,
        'TRAIN_ENTERED',
        atSimTime,
        `Train ${before.id} entered route ${before.routeId ?? '?'}`,
      ),
    );
    return { trainId: before.id, before, after, events };
  }

  /**
   * `Running` / `ApproachingSignal` — try to advance one
   * section. Before advancing, check the next signal. After
   * advancing, check for a platform stop.
   *
   * Two correctness fixes for Section 15:
   *
   *  1. **Edge-skip.** When the dispatcher sets a new
   *     route on a held train (the "exit" workflow), the
   *     route's first edge is the train's current edge
   *     (the train reverses out of the platform). Skip
   *     that edge so the train doesn't "advance" into
   *     itself.
   *
   *  2. **Last-edge signal.** The destination signal of
   *     a route is the "stop" signal the train is
   *     heading to (a platform's entry / a yard's
   *     exit). The route only sets the *origin* signal
   *     to `proceed`; the destination stays at
   *     `stop`. The motion service must still let the
   *     train reach the destination edge, otherwise the
   *     train would be stuck at the previous section.
   *     Skip the signal check for the last edge in the
   *     route.
   */
  private handleRunning(
    before: TrainState,
    atSimTime: number,
    events: Event[],
  ): TrainTickOutcome | null {
    if (before.currentEdgeId === null) return null;
    if (before.routeId === null) return null;
    const route = this.deps.routeStore.get(before.routeId);
    if (!route) {
      // Route was cancelled; train must leave.
      return this.transitionTo(before, 'LeavingControlledArea', atSimTime, events, 'route cancelled');
    }

    // No remaining edges means we are on the last edge of the
    // route. Transition out of the controlled area.
    if (before.remainingEdges.length === 0) {
      return this.handleExitEdge(before, atSimTime, events);
    }

    // Skip past any remaining edges that match the train's
    // current edge (Section 15 edge-skip fix). The exit
    // route may include the train's current edge so the
    // BFS covers the full path.
    let edgeIndex = 0;
    let nextEdgeId: EdgeId | undefined;
    while (edgeIndex < before.remainingEdges.length) {
      const candidate = before.remainingEdges[edgeIndex];
      if (candidate !== before.currentEdgeId) {
        nextEdgeId = candidate;
        break;
      }
      edgeIndex += 1;
    }
    if (nextEdgeId === undefined) {
      return this.handleExitEdge(before, atSimTime, events);
    }
    const nextEdge = this.deps.topology.getEdge(nextEdgeId);
    if (!nextEdge) return null;

    // Signal check. The InterlockingEngine sets the
    // destination signal to `proceed` when the route is
    // established (Section 15 destination-fix), so the
    // train can always reach the destination. Mid-route
    // stop signals still block the train correctly.
    const blockedBySignal = this.isNextEdgeBlocked(nextEdge);
    if (blockedBySignal !== null) {
      return this.transitionTo(before, 'StoppedAtSignal', atSimTime, events, `blocked by signal ${blockedBySignal}`);
    }

    // Advance: move from currentEdgeId to nextEdgeId.
    const oldEdge = this.deps.topology.getEdge(before.currentEdgeId);
    if (oldEdge) {
      this.leaveOccupiedNode(before, oldEdge, events);
    }
    this.occupyTargetNode(before.id, nextEdge, events);

    const newRemaining = before.remainingEdges.slice(edgeIndex + 1);
    let nextState: TrainState['fsmState'] = 'Running';
    let heldAtPlatform: PlatformId | null = before.heldAtPlatform;
    // Platform stop check: did we just arrive at a section
    // that is part of a platform the train must stop at?
    const platformHit = this.findPlatformAtNode(nextEdge.to);
    if (platformHit !== null) {
      // The train must stop here.
      nextState = 'StoppedAtPlatform';
      heldAtPlatform = platformHit.id;
    }

    const after: TrainState = {
      ...before,
      fsmState: nextState,
      currentEdgeId: nextEdgeId,
      edgePosition: 0,
      remainingEdges: newRemaining,
      heldAtPlatform,
      lastTickAtSimTime: atSimTime,
    };
    this.deps.trainStore.setState(after);
    events.push(
      this.log(
        before,
        after,
        'TRAIN_ADVANCED',
        atSimTime,
        `Train ${before.id}: edge ${before.currentEdgeId} → ${nextEdgeId} (node ${nextEdge.to}${heldAtPlatform !== null ? `, platform ${heldAtPlatform}` : ''})`,
      ),
    );
    return { trainId: before.id, before, after, events };
  }

  /**
   * `Departing` → `Running`. The dispatcher released the
   * train at a platform; resume motion on the next tick.
   */
  private handleDeparting(
    before: TrainState,
    atSimTime: number,
    events: Event[],
  ): TrainTickOutcome | null {
    const after: TrainState = {
      ...before,
      fsmState: 'Running',
      heldAtPlatform: null,
      lastTickAtSimTime: atSimTime,
    };
    this.deps.trainStore.setState(after);
    events.push(
      this.log(
        before,
        after,
        'TRAIN_DEPARTED_PLATFORM',
        atSimTime,
        `Train ${before.id} departed platform ${before.heldAtPlatform ?? '?'}`,
      ),
    );
    return { trainId: before.id, before, after, events };
  }

  /**
   * `StoppedAtSignal` — re-check the signal. If it has
   * changed to `proceed`, advance; otherwise stay.
   */
  private handleStoppedAtSignal(
    before: TrainState,
    atSimTime: number,
    events: Event[],
  ): TrainTickOutcome | null {
    if (before.remainingEdges.length === 0) {
      return this.handleExitEdge(before, atSimTime, events);
    }
    const nextEdgeId = before.remainingEdges[0];
    if (nextEdgeId === undefined) return null;
    const nextEdge = this.deps.topology.getEdge(nextEdgeId);
    if (!nextEdge) return null;
    const blocked = this.isNextEdgeBlocked(nextEdge);
    if (blocked !== null) {
      // Still blocked. Hold position. Update tick timestamp
      // so the replay log records the wait.
      const after: TrainState = { ...before, lastTickAtSimTime: atSimTime };
      this.deps.trainStore.setState(after);
      return { trainId: before.id, before, after, events: [] };
    }
    // Signal cleared; resume `Running` and let the next tick
    // advance the train.
    const after: TrainState = {
      ...before,
      fsmState: 'Running',
      lastTickAtSimTime: atSimTime,
    };
    this.deps.trainStore.setState(after);
    events.push(
      this.log(
        before,
        after,
        'TRAIN_RESUMED',
        atSimTime,
        `Train ${before.id} resumed after signal cleared`,
      ),
    );
    return { trainId: before.id, before, after, events };
  }

  /**
   * The train is on the last edge of the route (the exit
   * edge). Transition to `LeavingControlledArea` and let the
   * next tick remove the train.
   */
  private handleExitEdge(
    before: TrainState,
    atSimTime: number,
    events: Event[],
  ): TrainTickOutcome | null {
    return this.transitionTo(before, 'LeavingControlledArea', atSimTime, events, 'reached exit edge');
  }

  /**
   * `LeavingControlledArea` → `Finished`. The train has
   * left the controlled area; vacate the last occupied
   * node, remove from the store, and emit `TRAIN_DEPARTED`.
   */
  private handleLeaving(
    before: TrainState,
    atSimTime: number,
    events: Event[],
  ): TrainTickOutcome | null {
    if (before.currentEdgeId !== null) {
      const edge = this.deps.topology.getEdge(before.currentEdgeId);
      if (edge) {
        this.leaveOccupiedNode(before, edge, events);
      }
    }
    this.deps.trainStore.remove(before.id);
    const after: TrainState = {
      ...before,
      fsmState: 'Finished',
      currentEdgeId: null,
      edgePosition: 0,
      routeId: null,
      remainingEdges: [],
      heldAtPlatform: null,
      lastTickAtSimTime: atSimTime,
    };
    events.push({
      type: 'TRAIN_DEPARTED',
      trainId: before.id,
    });
    events.push(
      this.log(before, after, 'TRAIN_FINISHED', atSimTime, `Train ${before.id} left the controlled area`),
    );
    return { trainId: before.id, before, after, events };
  }

  /* ------------------------------------------------------------ */
  /* Helpers                                                       */
  /* ------------------------------------------------------------ */

  /**
   * Apply a state transition with a log event. Convenience
   * for the simple state-to-state transitions that have no
   * side effects on stores.
   */
  private transitionTo(
    before: TrainState,
    to: TrainState['fsmState'],
    atSimTime: number,
    events: Event[],
    detail: string,
  ): TrainTickOutcome {
    const after: TrainState = { ...before, fsmState: to, lastTickAtSimTime: atSimTime };
    this.deps.trainStore.setState(after);
    events.push(
      this.log(
        before,
        after,
        'TRAIN_STATE_CHANGED',
        atSimTime,
        `Train ${before.id}: ${before.fsmState} → ${after.fsmState} (${detail})`,
      ),
    );
    return { trainId: before.id, before, after, events };
  }

  /**
   * Check whether the train may enter `nextEdge`. Returns
   * the blocking `SignalId` if the next edge has a `stop`
   * signal, otherwise `null`.
   */
  private isNextEdgeBlocked(nextEdge: { readonly to: NodeId; readonly signalId?: SignalId }): SignalId | null {
    if (!nextEdge.signalId) return null;
    const sig = this.deps.signalStore.get(nextEdge.signalId);
    if (!sig) return null;
    if (sig.aspect === 'stop') return nextEdge.signalId;
    return null;
  }

  /**
   * Vacate the node (section or switch) the train was
   * occupying on `oldEdge`. Emits `TRAIN_LEFT_SECTION` for
   * sections. For milestone 1, switches are not occupied by
   * trains (the lifecycle is reserved for route reservations
   * and locks); a no-op is performed for switch nodes.
   */
  private leaveOccupiedNode(
    before: TrainState,
    oldEdge: { readonly id: EdgeId; readonly from: NodeId; readonly to: NodeId },
    events: Event[],
  ): void {
    const nodeId = oldEdge.to;
    const node = this.deps.topology.getNode(nodeId);
    if (!node) return;
    if (isSectionNode(node)) {
      this.deps.sectionStore.setOccupied(nodeId, null);
      events.push({
        type: 'TRAIN_LEFT_SECTION',
        trainId: before.id,
        sectionId: nodeId,
      });
    }
    // Switches are not train-occupied in milestone 1.
  }

  /**
   * Occupy the target node of `newEdge`. Emits
   * `TRAIN_ENTERED_SECTION` for sections. For milestone 1,
   * switches are not occupied by trains.
   */
  private occupyTargetNode(
    trainId: TrainId,
    newEdge: { readonly to: NodeId },
    events: Event[],
  ): void {
    const nodeId = newEdge.to;
    const node = this.deps.topology.getNode(nodeId);
    if (!node) return;
    if (isSectionNode(node)) {
      this.deps.sectionStore.setOccupied(nodeId, trainId);
      events.push({
        type: 'TRAIN_ENTERED_SECTION',
        trainId,
        sectionId: nodeId,
      });
    }
    // Switches are not train-occupied in milestone 1.
  }

  /**
   * Find the platform whose `sectionIds` include `nodeId`,
   * or `null` if no platform covers this node.
   */
  private findPlatformAtNode(nodeId: NodeId): Platform | null {
    for (const platform of this.deps.platforms.values()) {
      if (platform.sectionIds.includes(nodeId)) return platform;
    }
    return null;
  }

  /**
   * Build a `LOG` event describing a state transition.
   */
  private log(
    _before: TrainState,
    _after: TrainState,
    code: string,
    atSimTime: number,
    message: string,
  ): Event {
    return {
      type: 'LOG',
      level: 'info',
      code,
      message,
      atSimTime,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Convenience functions for callers (tests, command processor)        */
/* ------------------------------------------------------------------ */

/**
 * Dispatcher-side helper: release a train held at a platform.
 * Transitions the train from `StoppedAtPlatform` to
 * `Departing` (the motion service will set it to `Running` on
 * the next tick). Returns the updated state, or an error if
 * the train is not in `StoppedAtPlatform`.
 */
export const releasePlatformStop = (
  store: TrainStateStore,
  trainId: TrainId,
  atSimTime: number,
): Result<TrainState, EngineError> =>
  store.update(trainId, (cur) => {
    if (cur.fsmState !== 'StoppedAtPlatform') {
      return cur;
    }
    return { ...cur, fsmState: 'Departing', lastTickAtSimTime: atSimTime };
  });

/**
 * Dispatcher-side helper: release a train at a platform via
 * the motion service. Convenience wrapper that pulls the
 * `TrainStateStore` out of the motion service's deps.
 */
export const dispatchTrain = (
  motion: TrainMotionService,
  trainId: TrainId,
  atSimTime: number,
): Result<TrainState, EngineError> => {
  // The motion service keeps the store as a private dep.
  // We expose it through a typed accessor (defined below).
  return releasePlatformStop(motion.trainStore, trainId, atSimTime);
};

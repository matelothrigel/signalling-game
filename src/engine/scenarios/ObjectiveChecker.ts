/**
 * ObjectiveChecker — evaluates scenario objectives on every
 * tick and emits `OBJECTIVE_COMPLETED` when one is met.
 *
 * The checker holds the active scenario's objectives and a
 * set of objectives that have already been met. On each
 * tick the simulation calls `tick(atSimTime)`, which
 * walks the unmet objectives and returns the list of
 * objectives that became complete in this tick. The
 * simulation emits one `OBJECTIVE_COMPLETED` event per
 * completed objective.
 *
 * The checker reads the **current** simulation state (a
 * minimal interface, not the full `SimulationSnapshot`,
 * so it has no dependency on the store layer) and
 * evaluates the predicates locally. It is deterministic.
 *
 * ## Supported objectives (milestone 1)
 *
 *  - `ROUTE_TRAIN_TO_PLATFORM`: complete when the named
 *    train is in `StoppedAtPlatform` and held at the
 *    named platform.
 *  - `DISPATCH_TRAIN`: complete when the named train
 *    has previously been held at a platform and is
 *    currently in `Departing`, `Running` (post-dispatch),
 *    `LeavingControlledArea`, or `Finished`.
 *  - `NO_CONFLICT_FOR_DURATION`: not implemented in
 *    milestone 1. Returns `false` (never complete).
 *
 * The `dueBySimTime` field is **not** enforced. An
 * objective is complete when its predicate is true,
 * regardless of whether the deadline has passed. The
 * UI shows the deadline separately.
 */

import type { EventBus } from '@/engine/core/EventBus';
import type { TrainFsmState } from '@/engine/trains';
import type { TrainState } from '@/types/trains';
import type { Objective } from '@/types/scenario';
import type { TrainId, PlatformId, EdgeId, ObjectiveId } from '@/types/ids';

/** Minimal read-only view of the simulation the checker needs. */
export interface ObjectiveCheckerSource {
  readonly now: () => number;
  readonly getTrain: (id: TrainId) => TrainState | undefined;
  readonly getTrainEdge: (id: TrainId) => EdgeId | null;
}

export interface ObjectiveView {
  readonly id: ObjectiveId;
  readonly description: string;
  readonly completed: boolean;
  /** Sim-time at which the objective was completed. `null` if not yet. */
  readonly completedAtSimTime: number | null;
}

export class ObjectiveChecker {
  private readonly eventBus: EventBus;
  private readonly source: ObjectiveCheckerSource;
  private objectives: readonly Objective[] = [];
  private completed: Set<ObjectiveId> = new Set();
  private completedAt: Map<ObjectiveId, number> = new Map();
  /**
   * Trains that have been at a platform at some point.
   * Used by the `DISPATCH_TRAIN` predicate to confirm
   * that the train was actually dispatched from a
   * platform (not just that it moved).
   */
  private trainsSeenAtPlatform: Set<TrainId> = new Set();

  constructor(eventBus: EventBus, source: ObjectiveCheckerSource) {
    this.eventBus = eventBus;
    this.source = source;
  }

  /**
   * Replace the active objectives. Called when a scenario
   * starts (`START_SCENARIO`) or ends (`END_SCENARIO`).
   * The previous completion state is cleared.
   */
  public setObjectives(objectives: readonly Objective[]): void {
    this.objectives = objectives;
    this.completed = new Set();
    this.completedAt = new Map();
    this.trainsSeenAtPlatform = new Set();
  }

  /** Drop the active objectives. */
  public clearObjectives(): void {
    this.objectives = [];
    this.completed = new Set();
    this.completedAt = new Map();
    this.trainsSeenAtPlatform = new Set();
  }

  /**
   * Snapshot of the current objective state. The UI
   * renders this in the status panel. Order is
   * deterministic (insertion order).
   */
  public getViews(): readonly ObjectiveView[] {
    const out: ObjectiveView[] = [];
    for (const obj of this.objectives) {
      out.push({
        id: obj.id,
        description: obj.description,
        completed: this.completed.has(obj.id),
        completedAtSimTime: this.completedAt.get(obj.id) ?? null,
      });
    }
    return out;
  }

  /**
   * Evaluate every unmet objective against the current
   * simulation state. Emit `OBJECTIVE_COMPLETED` for
   * each one that just became complete. Returns the list
   * of newly-completed objective ids (useful for tests).
   */
  public tick(): readonly ObjectiveId[] {
    const atSimTime = this.source.now();
    const newly: ObjectiveId[] = [];
    for (const obj of this.objectives) {
      if (this.completed.has(obj.id)) continue;
      if (this.isComplete(obj, atSimTime)) {
        this.completed.add(obj.id);
        this.completedAt.set(obj.id, atSimTime);
        newly.push(obj.id);
        this.eventBus.emit({
          type: 'OBJECTIVE_COMPLETED',
          objectiveId: obj.id,
        });
      }
    }
    return newly;
  }

  /**
   * Evaluate a single objective against the current
   * simulation state. Pure: same inputs → same result.
   */
  private isComplete(obj: Objective, atSimTime: number): boolean {
    switch (obj.kind) {
      case 'ROUTE_TRAIN_TO_PLATFORM': {
        const train = this.source.getTrain(obj.trainId);
        if (train === undefined) return false;
        if (this.isHeldAtPlatform(train, obj.platformId)) {
          this.trainsSeenAtPlatform.add(obj.trainId);
        }
        return this.trainsSeenAtPlatform.has(obj.trainId);
      }
      case 'DISPATCH_TRAIN': {
        const train = this.source.getTrain(obj.trainId);
        if (train === undefined) return false;
        // Record the train as seen at a platform (any
        // platform) so the objective can complete once the
        // train is dispatched. This is the only way the
        // `DISPATCH_TRAIN` predicate can be satisfied if the
        // scenario has no `ROUTE_TRAIN_TO_PLATFORM`
        // objective for the same train.
        if (train.fsmState === 'StoppedAtPlatform' && train.heldAtPlatform !== null) {
          this.trainsSeenAtPlatform.add(obj.trainId);
        }
        if (!this.trainsSeenAtPlatform.has(obj.trainId)) return false;
        return this.isPostDispatch(train.fsmState);
      }
      case 'NO_CONFLICT_FOR_DURATION': {
        // Not implemented in milestone 1.
        void atSimTime;
        return false;
      }
    }
  }

  private isHeldAtPlatform(
    train: TrainState,
    platformId: PlatformId,
  ): boolean {
    return (
      train.fsmState === 'StoppedAtPlatform' &&
      train.heldAtPlatform === platformId
    );
  }

  private isPostDispatch(state: TrainFsmState): boolean {
    return (
      state === 'Departing' ||
      state === 'Running' ||
      state === 'LeavingControlledArea' ||
      state === 'Finished'
    );
  }
}

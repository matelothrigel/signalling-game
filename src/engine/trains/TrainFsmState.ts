/**
 * Train FSM (finite-state machine) state.
 *
 * Every train in the simulation is in exactly one of these
 * states at any given sim-time. The state is the **single
 * source of truth** for what the train is doing — booleans
 * like `stopped` and `isApproaching` are not used.
 *
 * ## State machine (milestone 1)
 *
 * ```
 *                 ┌─────────────────────┐
 *   (spawn)       │                     │     (route cancelled /
 *     │           ▼                     │      set, no edge)
 *     │   ┌────────────────┐            │
 *     └──▶│ WaitingForEntry│────────────┘
 *         └───────┬────────┘
 *                 │  (route set, train on entry edge)
 *                 ▼
 *         ┌────────────────┐
 *         │    Entering    │  (one-tick transition: train
 *         └───────┬────────┘   enters the controlled area)
 *                 │
 *                 ▼
 *         ┌────────────────┐◀─────────┐
 *         │    Running     │──────────┤
 *         └──┬─────┬───┬───┘          │
 *            │     │   │              │
 *            │     │   │              │
 *            ▼     │   ▼              │
 *  ┌────────────────┐ │ ┌──────────────────┐
 *  │ApproachingSig. │ │ │StoppedAtPlatform │
 *  └───────┬────────┘ │ └────────┬─────────┘
 *          │          │          │  (dispatcher
 *          │          │          │   releases)
 *          ▼          ▼          ▼
 *  ┌────────────────┐ ┌──────────────────┐
 *  │StoppedAtSignal │ │    Departing     │
 *  └───────┬────────┘ └────────┬─────────┘
 *          │                  │
 *          │ (signal → proceed) (next tick)
 *          ▼                  ▼
 *         (back to Running)  (back to Running)
 *
 *  Any state (except Finished):
 *      │
 *      │  (train on exit edge, no further planned route)
 *      ▼
 *  ┌────────────────────────┐
 *  │ LeavingControlledArea  │
 *  └────────────┬───────────┘
 *               │  (off the edge, removed from store)
 *               ▼
 *  ┌────────────────────────┐
 *  │      Finished          │  (terminal)
 *  └────────────────────────┘
 * ```
 *
 * ## Adding new states
 *
 * Adding a new state is a deliberate, type-visible change. The
 * `assertNever` helper in `@/types/result` surfaces unhandled
 * states in consumers at compile time. The transition matrix
 * in `TrainMotionService` is updated together with the new
 * state.
 *
 * ## Future states (named in the type, not implemented in M1)
 *
 * - `HoldingForSchedule` — train waiting for timetable alignment
 * - `HeldByDispatcher` — dispatcher pause
 * - `HeldBySignalman` — manual signal hold
 * - `Faulted` — locomotive / rolling-stock fault
 * - `Coupling` — coupling to another consist
 * - `Splitting` — splitting off a portion of the consist
 */
export type TrainFsmState =
  /** Train is defined and ready, but no route yet covers its entry edge. */
  | 'WaitingForEntry'
  /**
   * Train is in the process of entering the controlled area.
   * This is a one-tick transitional state: the train is on its
   * first edge and the motion service sets it to `Running` on
   * the next tick unless an obstacle is encountered.
   */
  | 'Entering'
  /**
   * Train is moving along its route. The motion service advances
   * the train one section per tick (per the definition's
   * `speedSectionsPerTick`) while the route remains clear.
   */
  | 'Running'
  /**
   * Train is approaching a signal at the end of the next
   * section. The motion service reads the signal's aspect and
   * either continues (`Running`), slows, or transitions to
   * `StoppedAtSignal`.
   */
  | 'ApproachingSignal'
  /**
   * Train is stopped because the next signal is `stop`. The
   * motion service transitions to `Running` when the signal
   * changes to `proceed`.
   */
  | 'StoppedAtSignal'
  /**
   * Train is stopped at a platform listed in its definition's
   * `stopsAtPlatforms`. The motion service holds the train
   * here until the dispatcher issues a release
   * (`DISPATCH_TRAIN` command in milestone 1) or the scenario
   * timetable schedules a departure.
   */
  | 'StoppedAtPlatform'
  /**
   * Train has been released from a platform stop and is
   * resuming motion. This is a one-tick transitional state:
   * the motion service sets it to `Running` on the next tick.
   */
  | 'Departing'
  /**
   * Train has reached its exit edge and is leaving the
   * controlled area. The motion service removes the train
   * from the store on the next tick and transitions to
   * `Finished`.
   */
  | 'LeavingControlledArea'
  /**
   * Train has left the controlled area. This is a terminal
   * state: the train is no longer in the store. The state
   * is recorded in the `TRAIN_DEPARTED` event for replay.
   */
  | 'Finished';

/**
 * Type guard: is the given state a "stationary" state
 * (train is not currently moving under its own power)?
 *
 * The motion service uses this to decide whether to advance
 * the train on the next tick.
 */
export const isTrainStationary = (state: TrainFsmState): boolean =>
  state === 'StoppedAtSignal' ||
  state === 'StoppedAtPlatform' ||
  state === 'Finished';

/**
 * Type guard: is the given state a terminal state (train is
 * permanently out of the simulation)?
 */
export const isTrainTerminal = (state: TrainFsmState): boolean =>
  state === 'Finished';

/**
 * Type guard: is the given state a "in controlled area"
 * state (train is present in the simulation and may be acted
 * upon by the motion service)?
 */
export const isTrainInControlledArea = (state: TrainFsmState): boolean =>
  state !== 'WaitingForEntry' && state !== 'Finished';

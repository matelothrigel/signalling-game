/**
 * Trains — public surface.
 *
 * The trains module owns the runtime state of every train
 * (`TrainStateStore`) and the finite-state machine that
 * describes what a train is doing at any given sim-time
 * (`TrainFsmState`). The motion service (`TrainMotionService`)
 * drives trains along routes, obeys signals, stops at
 * platforms, and updates section / switch occupancy.
 *
 * - `TrainDefinition` (in `@/types/trains`) is immutable
 *   and is loaded from the scenario file.
 * - `TrainState` (in `@/types/trains`) is the runtime
 *   counterpart and lives in the store.
 * - The motion service is the only writer to the store
 *   during a normal tick; the command processor may
 *   write to the store when the dispatcher issues a
 *   command (e.g. `SPAWN_TRAIN`).
 */

export { TrainStateStore, isTrainStateStationary } from './TrainStateStore';
export type { TrainStateStoreSerialized } from './TrainStateStore';

export type { TrainFsmState } from './TrainFsmState';
export { isTrainStationary, isTrainTerminal, isTrainInControlledArea } from './TrainFsmState';

export { TrainReasonCode, trainReasonMessage, trainError } from './TrainReasonCode';

export { TrainMotionService, releasePlatformStop } from './TrainMotionService';
export type { TrainMotionServiceDeps, TrainTickOutcome } from './TrainMotionService';

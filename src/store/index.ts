/**
 * Store public surface.
 *
 * The store is the bridge between the engine and the UI.
 * It exposes the Zustand hook, the snapshot type, and
 * a few selector helpers for common queries.
 */

export {
  useSimulationStore,
  useSnapshot,
} from './simulationStore';

export type {
  SimulationStore,
  SimulationStoreState,
  SimulationStoreActions,
} from './simulationStore';

export type {
  SimulationSnapshot,
  EngineProjectionSource,
} from './SimulationSnapshot';

export { projectSnapshot } from './SimulationSnapshot';

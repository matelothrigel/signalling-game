/**
 * Engine public surface.
 *
 * Re-exports the core services. The current schema version is
 * `CURRENT_VERSION` from `@/types/versioned`.
 */

export {
  Simulation,
  TimeService,
  RngService,
  EventBus,
  TickLoop,
  CommandProcessor,
  defaultScheduler,
  defaultCanceller,
} from './core';

export type {
  SimulationOptions,
  SimulationState,
  TimeState,
  RngState,
  RngStreamState,
  EventHandler,
  TickLoopOptions,
  Scheduler,
  Canceller,
  CommandProcessorDeps,
} from './core';

export * from './trains';
export * from './scenarios';

export { CURRENT_VERSION } from '@/types/versioned';

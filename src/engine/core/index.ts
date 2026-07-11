/**
 * Engine core — public surface.
 *
 * Simulation is the thin orchestrator. The services below are
 * constructed and wired by `Simulation`; they can also be used
 * directly in tests.
 */

export { TimeService } from './TimeService';
export type { TimeState } from './TimeService';

export { RngService } from './RngService';
export type { RngState, RngStreamState } from './RngService';

export { EventBus } from './EventBus';
export type { EventHandler } from './EventBus';

export { TickLoop, defaultScheduler, defaultCanceller } from './TickLoop';
export type { TickLoopOptions, Scheduler, Canceller } from './TickLoop';

export { CommandProcessor } from './CommandProcessor';
export type { CommandProcessorDeps } from './CommandProcessor';

export { Simulation } from './Simulation';
export type { SimulationOptions, SimulationState } from './Simulation';

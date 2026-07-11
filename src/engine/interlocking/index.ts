/**
 * Interlocking engine — public surface.
 *
 * The brain of the route-setting system. Consumes the topology
 * and the runtime stores; produces `Route` objects and writes
 * back to the stores. Pure and deterministic.
 */

export type { SafetyRule, RuleContext } from './SafetyRule';
export { RuleRegistry } from './RuleRegistry';

export { TrackClearRule } from './TrackClearRule';
export { SwitchLockedRule } from './SwitchLockedRule';
export { ConflictRule } from './ConflictRule';
export { SignalRule } from './SignalRule';
export { PlatformRule } from './PlatformRule';

export {
  RouteReasonCode,
  routeReasonMessage,
  routeError,
  routeRejectionError,
  formatRejectionBatch,
} from './RouteReasonCode';
export type { RouteRejection } from './RouteReasonCode';

export {
  InterlockingEngine,
  formatRouteSetOutcome,
  routeSetOutcomeToError,
  routeSetOutcomeToResult,
} from './InterlockingEngine';
export type { InterlockingEngineDeps, RouteSetOutcome } from './InterlockingEngine';

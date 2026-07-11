/**
 * Scenarios — public surface.
 *
 * The scenarios module owns the `ScenarioService` (which
 * walks a scenario's timetable and dispatches the
 * corresponding commands) and the stable reason codes.
 */

export { ScenarioService } from './ScenarioService';
export type { ScenarioServiceOptions } from './ScenarioService';

export { ScenarioReasonCode, scenarioReasonMessage, scenarioError } from './ScenarioReasonCode';

export { ObjectiveChecker } from './ObjectiveChecker';
export type { ObjectiveCheckerSource, ObjectiveView } from './ObjectiveChecker';

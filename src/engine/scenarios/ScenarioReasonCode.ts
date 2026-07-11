/**
 * Stable reason codes for scenario-domain rejections.
 * Same pattern as the switch, signal, and section catalogues.
 */

import { type EngineError, engineError } from '@/types/result';

export const ScenarioReasonCode = {
  UNKNOWN: 'SCENARIO_UNKNOWN',
  ALREADY_STARTED: 'SCENARIO_ALREADY_STARTED',
  NOT_STARTED: 'SCENARIO_NOT_STARTED',
} as const;

export type ScenarioReasonCode =
  (typeof ScenarioReasonCode)[keyof typeof ScenarioReasonCode];

const idStr = (ctx: Readonly<Record<string, unknown>>, key: string): string =>
  ctx[key] === undefined ? '?' : String(ctx[key]);

export const scenarioReasonMessage = (
  code: ScenarioReasonCode,
  context: Readonly<Record<string, unknown>> = {},
): string => {
  switch (code) {
    case ScenarioReasonCode.UNKNOWN:
      return `Unknown scenario ${idStr(context, 'scenarioId')}`;
    case ScenarioReasonCode.ALREADY_STARTED:
      return `Scenario ${idStr(context, 'scenarioId')} is already started`;
    case ScenarioReasonCode.NOT_STARTED:
      return 'No scenario is currently active';
    default:
      return `Scenario: ${code}`;
  }
};

export const scenarioError = (
  code: ScenarioReasonCode,
  context: Readonly<Record<string, unknown>> = {},
): EngineError =>
  engineError(code, scenarioReasonMessage(code, context), context);

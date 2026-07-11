/**
 * Stable reason codes for train-domain rejections.
 *
 * Same pattern as the switch, signal, and section catalogues:
 * a frozen object of stable identifiers, plus a
 * `trainReasonMessage` helper that generates a human-readable
 * English message from the code and a context. Front-ends can
 * localise by mapping codes to translations.
 */

import { type EngineError, engineError } from '@/types/result';

export const TrainReasonCode = {
  /** Train ID is not in the store. */
  UNKNOWN: 'TRAIN_UNKNOWN',
  /** A train with the same ID has already been added. */
  ALREADY_EXISTS: 'TRAIN_ALREADY_EXISTS',
  /** The requested entry / exit edge is not in the topology. */
  UNKNOWN_EDGE: 'TRAIN_UNKNOWN_EDGE',
  /** The train is in a state that cannot perform the requested action. */
  INVALID_TRANSITION: 'TRAIN_INVALID_TRANSITION',
  /** The train is not currently on a route. */
  NO_ROUTE: 'TRAIN_NO_ROUTE',
  /** The platform ID is not in the platform catalogue. */
  UNKNOWN_PLATFORM: 'TRAIN_UNKNOWN_PLATFORM',
  /**
   * The train's definition does not list the requested
   * platform in `stopsAtPlatforms`.
   */
  NOT_A_STOP: 'TRAIN_NOT_A_STOP',
  /** Catch-all for unexpected store / motion errors. */
  REJECTED: 'TRAIN_REJECTED',
} as const;

export type TrainReasonCode = (typeof TrainReasonCode)[keyof typeof TrainReasonCode];

const idStr = (ctx: Readonly<Record<string, unknown>>, key: string): string =>
  ctx[key] === undefined ? '?' : String(ctx[key]);

export const trainReasonMessage = (
  code: TrainReasonCode,
  context: Readonly<Record<string, unknown>> = {},
): string => {
  switch (code) {
    case TrainReasonCode.UNKNOWN:
      return `Unknown train ${idStr(context, 'trainId')}`;
    case TrainReasonCode.ALREADY_EXISTS:
      return `Train ${idStr(context, 'trainId')} already exists`;
    case TrainReasonCode.UNKNOWN_EDGE:
      return `Train ${idStr(context, 'trainId')}: edge ${idStr(context, 'edgeId')} not in topology`;
    case TrainReasonCode.INVALID_TRANSITION:
      return `Train ${idStr(context, 'trainId')}: cannot transition from ${idStr(context, 'from')} to ${idStr(context, 'to')}`;
    case TrainReasonCode.NO_ROUTE:
      return `Train ${idStr(context, 'trainId')} is not on a route`;
    case TrainReasonCode.UNKNOWN_PLATFORM:
      return `Unknown platform ${idStr(context, 'platformId')}`;
    case TrainReasonCode.NOT_A_STOP:
      return `Train ${idStr(context, 'trainId')} does not stop at platform ${idStr(context, 'platformId')}`;
    case TrainReasonCode.REJECTED:
      return `Train rejected (${idStr(context, 'reason')})`;
    default:
      return `Train: ${code}`;
  }
};

export const trainError = (
  code: TrainReasonCode,
  context: Readonly<Record<string, unknown>> = {},
): EngineError =>
  engineError(code, trainReasonMessage(code, context), context);

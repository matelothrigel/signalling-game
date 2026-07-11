/**
 * Stable reason codes for signal-state-store rejections.
 *
 * Pattern follows the switch-store catalogues (Section 5):
 * every rejection returns an `EngineError` with a stable
 * `code`, a human-readable English message generated from the
 * code, and a serializable context.
 *
 * Milestone 1 only needs `UNKNOWN`. Other variants are
 * reserved for future use so the catalogue stays stable.
 */

import { type EngineError, engineError } from '@/types/result';

export const SignalReasonCode = {
  /** The signal ID is not in the store. */
  UNKNOWN: 'SIGNAL_UNKNOWN',
  /** The aspect value is not in the known set. */
  INVALID_ASPECT: 'SIGNAL_INVALID_ASPECT',
} as const;

export type SignalReasonCode = (typeof SignalReasonCode)[keyof typeof SignalReasonCode];

export const signalReasonMessage = (
  code: SignalReasonCode,
  context: Readonly<Record<string, unknown>> = {},
): string => {
  const id = String(context.signalId ?? '?');
  switch (code) {
    case SignalReasonCode.UNKNOWN:
      return `Unknown signal ${id}`;
    case SignalReasonCode.INVALID_ASPECT:
      return `Invalid aspect ${String(context.aspect ?? '?')} for signal ${id}`;
    default:
      return `Signal ${id}: ${code}`;
  }
};

export const signalError = (
  code: SignalReasonCode,
  context: Readonly<Record<string, unknown>> = {},
): EngineError => engineError(code, signalReasonMessage(code, context), context);

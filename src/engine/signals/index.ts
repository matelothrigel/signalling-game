/**
 * Signals engine — public surface.
 *
 * Signals are **derived views** of the interlocking state.
 * The store never decides what aspect to show; the
 * interlocking engine computes the permitted aspect and
 * calls `setAspect` to record the decision.
 */

export { SignalStateStore } from './SignalStateStore';
export type {
  SignalStateStoreInit,
  SignalStateStoreSerialized,
  SignalAspectChange,
} from './SignalStateStore';

export type {
  SignalAspectChangeReason,
  SignalAspectChangeKind,
} from './SignalAspectChangeReason';
export { signalReasonSummary } from './SignalAspectChangeReason';

export { SignalReasonCode, signalReasonMessage, signalError } from './SignalReasonCode';
export type { SignalReasonCode as SignalReasonCodeType } from './SignalReasonCode';

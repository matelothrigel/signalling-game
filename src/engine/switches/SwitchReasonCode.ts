/**
 * Structured reason codes for switch state transitions.
 *
 * Every rejected switch command returns an `EngineError` whose
 * `code` is one of these values. The human-readable message is
 * generated from the code via {@link switchReasonMessage}, so
 * localised front-ends can display translations without parsing
 * English log lines.
 *
 * The codes are stable identifiers; treat them as part of the
 * engine's public API. Adding a new code is non-breaking;
 * removing or renaming a code is a breaking change.
 */

import { type EngineError, engineError } from '@/types/result';

export const SwitchReasonCode = {
  /** The switch ID is not in the store. */
  UNKNOWN: 'SWITCH_UNKNOWN',
  /** Position change attempted on a switch that is locked by a route. */
  LOCKED: 'SWITCH_LOCKED',
  /** Position change attempted on a switch that is occupied by a train. */
  OCCUPIED: 'SWITCH_OCCUPIED',
  /** Reserve called on a switch that is not free. */
  NOT_FREE: 'SWITCH_NOT_FREE',
  /** Reserve called but the switch is already reserved by another route. */
  ALREADY_RESERVED: 'SWITCH_ALREADY_RESERVED',
  /** Lock called on a switch that is not reserved. */
  NOT_RESERVED: 'SWITCH_NOT_RESERVED',
  /** Lock called but the switch is reserved by a different route. */
  RESERVED_BY_ANOTHER: 'SWITCH_RESERVED_BY_ANOTHER',
  /** Release called on a switch with no lock/reservation. */
  NOT_HELD: 'SWITCH_NOT_HELD',
  /** Release called but the switch is held by a different route. */
  HELD_BY_ANOTHER: 'SWITCH_HELD_BY_ANOTHER',
  /** Occupy called on a switch that is locked. */
  CANNOT_OCCUPY_LOCKED: 'SWITCH_CANNOT_OCCUPY_LOCKED',
  /** Vacate called on a switch that is not occupied. */
  NOT_OCCUPIED: 'SWITCH_NOT_OCCUPIED',
  /** Vacate called but the switch is occupied by a different train. */
  OCCUPIED_BY_ANOTHER: 'SWITCH_OCCUPIED_BY_ANOTHER',
  /** Generic catch-all for a transition that the validator rejected. */
  INVALID_TRANSITION: 'SWITCH_INVALID_TRANSITION',
} as const;

export type SwitchReasonCode =
  (typeof SwitchReasonCode)[keyof typeof SwitchReasonCode];

/**
 * Generate a human-readable message from a reason code and a
 * context object. The message is English-only in milestone 1;
 * front-ends can localise by mapping the code themselves.
 */
export const switchReasonMessage = (
  code: SwitchReasonCode,
  context: Readonly<Record<string, unknown>> = {},
): string => {
  const sw = String(context.switchId ?? '?');
  switch (code) {
    case SwitchReasonCode.UNKNOWN:
      return `Unknown switch ${sw}`;
    case SwitchReasonCode.LOCKED:
      return `Switch ${sw} is locked by route ${String(context.heldBy ?? '?')}`;
    case SwitchReasonCode.OCCUPIED:
      return `Switch ${sw} is occupied by train ${String(context.occupiedBy ?? '?')}`;
    case SwitchReasonCode.NOT_FREE:
      return `Switch ${sw} is not free (current: ${String(context.current ?? '?')})`;
    case SwitchReasonCode.ALREADY_RESERVED:
      return `Switch ${sw} is already reserved by route ${String(context.heldBy ?? '?')}`;
    case SwitchReasonCode.NOT_RESERVED:
      return `Switch ${sw} is not reserved (current: ${String(context.current ?? '?')})`;
    case SwitchReasonCode.RESERVED_BY_ANOTHER:
      return `Switch ${sw} is reserved by route ${String(context.heldBy ?? '?')}`;
    case SwitchReasonCode.NOT_HELD:
      return `Switch ${sw} is not held by any route (current: ${String(context.current ?? '?')})`;
    case SwitchReasonCode.HELD_BY_ANOTHER:
      return `Switch ${sw} is held by route ${String(context.heldBy ?? '?')}`;
    case SwitchReasonCode.CANNOT_OCCUPY_LOCKED:
      return `Switch ${sw} is locked and cannot be occupied`;
    case SwitchReasonCode.NOT_OCCUPIED:
      return `Switch ${sw} is not occupied`;
    case SwitchReasonCode.OCCUPIED_BY_ANOTHER:
      return `Switch ${sw} is occupied by train ${String(context.occupiedBy ?? '?')}`;
    case SwitchReasonCode.INVALID_TRANSITION:
      return `Invalid transition for switch ${sw} (current: ${String(context.current ?? '?')})`;
    default:
      return `Switch ${sw}: ${code}`;
  }
};

/**
 * Build a fully-formed `EngineError` for a switch rejection:
 * a stable reason code plus a generated human-readable message
 * plus a serializable context for diagnostics.
 */
export const switchError = (
  code: SwitchReasonCode,
  context: Readonly<Record<string, unknown>> = {},
): EngineError => engineError(code, switchReasonMessage(code, context), context);

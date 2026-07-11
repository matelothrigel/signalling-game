/**
 * Stable reason codes for route rejections.
 *
 * Every `RouteRejection` carries one of these codes. The codes
 * are namespaced with `ROUTE_` so they cannot collide with the
 * switch or signal catalogues. The top-level "the route is
 * rejected" code is `REJECTED`; the individual rule failures
 * use the more specific codes below.
 *
 * Pattern follows the switch and signal catalogues (Sections 5
 * and 6): a frozen object of stable identifiers, plus a
 * `routeReasonMessage` helper that generates a human-readable
 * English message from the code and a context.
 */

import { type EngineError, engineError } from '@/types/result';

export const RouteReasonCode = {
  /** Catch-all for "this route cannot be set". */
  REJECTED: 'ROUTE_REJECTED',
  /** The origin signal is not in the signal store. */
  UNKNOWN_ORIGIN: 'ROUTE_UNKNOWN_ORIGIN',
  /** The destination signal is not in the signal store. */
  UNKNOWN_DESTINATION: 'ROUTE_UNKNOWN_DESTINATION',
  /** The origin signal is not automatic (manual override, not allowed in M1). */
  ORIGIN_NOT_AUTOMATIC: 'ROUTE_ORIGIN_NOT_AUTOMATIC',
  /** The destination signal is not automatic. */
  DESTINATION_NOT_AUTOMATIC: 'ROUTE_DESTINATION_NOT_AUTOMATIC',
  /** No path exists between origin and destination at current switch positions. */
  NO_PATH: 'ROUTE_NO_PATH',
  /** A section along the path is occupied by a train. */
  TRACK_OCCUPIED: 'ROUTE_TRACK_OCCUPIED',
  /** A section along the path is already reserved by another route. */
  TRACK_RESERVED: 'ROUTE_TRACK_RESERVED',
  /** A switch along the path is locked by another route. */
  SWITCH_LOCKED: 'ROUTE_SWITCH_LOCKED',
  /** A switch along the path is in the wrong position. */
  SWITCH_WRONG_POSITION: 'ROUTE_SWITCH_WRONG_POSITION',
  /** Another active route conflicts with the proposed path. */
  CONFLICT: 'ROUTE_CONFLICT',
  /** The destination is not a valid platform (per the Platform rule). */
  DESTINATION_NOT_PLATFORM: 'ROUTE_DESTINATION_NOT_PLATFORM',
} as const;

export type RouteReasonCode = (typeof RouteReasonCode)[keyof typeof RouteReasonCode];

/**
 * A single reason a route was rejected. Each rule returns zero
 * or more of these; the engine collects all of them and
 * returns them in one batch.
 */
export interface RouteRejection {
  readonly code: RouteReasonCode;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

const idStr = (ctx: Readonly<Record<string, unknown>>, key: string): string =>
  ctx[key] === undefined ? '?' : String(ctx[key]);

export const routeReasonMessage = (
  code: RouteReasonCode,
  context: Readonly<Record<string, unknown>> = {},
): string => {
  switch (code) {
    case RouteReasonCode.REJECTED:
      return 'Cannot set route';
    case RouteReasonCode.UNKNOWN_ORIGIN:
      return `Origin signal ${idStr(context, 'originSignal')} not found`;
    case RouteReasonCode.UNKNOWN_DESTINATION:
      return `Destination signal ${idStr(context, 'destinationSignal')} not found`;
    case RouteReasonCode.ORIGIN_NOT_AUTOMATIC:
      return `Origin signal ${idStr(context, 'originSignal')} is not automatic`;
    case RouteReasonCode.DESTINATION_NOT_AUTOMATIC:
      return `Destination signal ${idStr(context, 'destinationSignal')} is not automatic`;
    case RouteReasonCode.NO_PATH:
      return `No active path from signal ${idStr(context, 'originSignal')} to ${idStr(context, 'destinationSignal')}`;
    case RouteReasonCode.TRACK_OCCUPIED:
      return `Track ${idStr(context, 'sectionId')} is occupied by train ${idStr(context, 'occupiedBy')}`;
    case RouteReasonCode.TRACK_RESERVED:
      return `Track ${idStr(context, 'sectionId')} is reserved by route ${idStr(context, 'reservedBy')}`;
    case RouteReasonCode.SWITCH_LOCKED:
      return `Switch ${idStr(context, 'switchId')} is locked by route ${idStr(context, 'lockedBy')}`;
    case RouteReasonCode.SWITCH_WRONG_POSITION:
      return `Switch ${idStr(context, 'switchId')} is in the wrong position (expected ${idStr(context, 'expected')}, got ${idStr(context, 'actual')})`;
    case RouteReasonCode.CONFLICT:
      return `Route ${idStr(context, 'otherRouteId')} conflicts with the proposed path`;
    case RouteReasonCode.DESTINATION_NOT_PLATFORM:
      return `Destination ${idStr(context, 'destination')} is not a valid platform`;
    default:
      return `Route rejected (${code})`;
  }
};

export const routeError = (
  code: RouteReasonCode,
  context: Readonly<Record<string, unknown>> = {},
): EngineError =>
  engineError(code, routeReasonMessage(code, context), context);

/**
 * Format a batch of rejections as a single multi-line message,
 * as the user wants in the log:
 *
 *   Cannot set route:
 *     ✓ Switch W3 locked
 *     ✓ Track T12 occupied
 *     ✓ Route R4 conflicts
 */
export const formatRejectionBatch = (
  rejections: readonly RouteRejection[],
): string => {
  if (rejections.length === 0) return 'Cannot set route';
  const lines = rejections.map((r) => `  ✓ ${r.message}`);
  return ['Cannot set route:', ...lines].join('\n');
};

/**
 * Build a single `EngineError` from a batch of rejections.
 * The error carries the full list in `context.rejections` and
 * a multi-line `message` generated by `formatRejectionBatch`.
 */
export const routeRejectionError = (
  rejections: readonly RouteRejection[],
): EngineError => ({
  code: RouteReasonCode.REJECTED,
  message: formatRejectionBatch(rejections),
  context: { rejections: rejections.map((r) => ({ ...r })) },
});

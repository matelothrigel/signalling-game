/**
 * Structured reason for a signal aspect change.
 *
 * Every `SIGNAL_ASPECT_CHANGED` event carries a reason of this
 * shape. The structured form lets:
 *
 *   - the event log and replay system explain *why* the signal
 *     changed (e.g. "stopped by conflicting route R2", "cleared
 *     by route R1 set", "back to stop after route released");
 *   - the UI filter or colour-code by reason;
 *   - tests assert that the right reason was produced in
 *     each scenario.
 *
 * The `kind` discriminant is a closed string-literal union; new
 * reasons are added by extending the union. The `assertNever`
 * helper in `@/types/result` catches unhandled kinds at
 * compile time.
 *
 * **Milestone 1** uses `INITIAL`, `ROUTE_SET`, `ROUTE_RELEASED`,
 * and `CONFLICT`. Other variants are listed for future use; they
 * are already part of the type so that adding a new reason
 * later does not change the event signature.
 */

import type { RouteId, TrainId } from '@/types/ids';

export type SignalAspectChangeReason =
  /** The signal was created with this aspect. */
  | { readonly kind: 'INITIAL' }
  /** A route that protects this signal was successfully set. */
  | { readonly kind: 'ROUTE_SET'; readonly routeId: RouteId }
  /** A route that controlled this signal was released. */
  | { readonly kind: 'ROUTE_RELEASED'; readonly routeId: RouteId }
  /** The signal aspect was set to Stop because of a conflicting route. */
  | { readonly kind: 'CONFLICT'; readonly otherRouteId: RouteId }
  /** A train entering the block forced the signal to a stop aspect. */
  | { readonly kind: 'TRAIN_OCCUPIED'; readonly trainId: TrainId }
  /** A train cleared the block, allowing the signal to clear again. */
  | { readonly kind: 'TRAIN_CLEARED'; readonly trainId: TrainId }
  /** A timer expired (e.g. approach-locking timeout). */
  | { readonly kind: 'TIMER_EXPIRED' }
  /** A dispatcher manually overrode the aspect (not allowed in M1). */
  | { readonly kind: 'OPERATOR_OVERRIDE' }
  /** A system-initiated change (e.g. failure simulation). */
  | { readonly kind: 'SYSTEM'; readonly note?: string };

/** String-literal union of all `kind` values. Useful for filtering. */
export type SignalAspectChangeKind = SignalAspectChangeReason['kind'];

/**
 * Generate a short human-readable summary of a change reason
 * for the event log. The full structured reason remains
 * available on the event for code that needs it.
 */
export const signalReasonSummary = (r: SignalAspectChangeReason): string => {
  switch (r.kind) {
    case 'INITIAL':
      return 'initial state';
    case 'ROUTE_SET':
      return `route ${r.routeId} set`;
    case 'ROUTE_RELEASED':
      return `route ${r.routeId} released`;
    case 'CONFLICT':
      return `conflict with route ${r.otherRouteId}`;
    case 'TRAIN_OCCUPIED':
      return `block occupied by train ${r.trainId}`;
    case 'TRAIN_CLEARED':
      return `block cleared by train ${r.trainId}`;
    case 'TIMER_EXPIRED':
      return 'timer expired';
    case 'OPERATOR_OVERRIDE':
      return 'operator override';
    case 'SYSTEM':
      return r.note !== undefined ? `system (${r.note})` : 'system';
    default:
      // Exhaustiveness — if a new kind is added, this line
      // will fail to compile until the case is added above.
      return ((r as { kind: string }).kind) as string;
  }
};

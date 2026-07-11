/**
 * SignalRule — the origin and destination signals must
 * exist in the topology and be automatic.
 *
 * Spec rules covered:
 *   - "destination is valid" (the destination is a real
 *     signal)
 *   - "Signals are clickable" (the player can issue a
 *     `SET_ROUTE` only against an automatic signal in
 *     milestone 1; manual override is not implemented)
 *
 * Pure function.
 */

import type { SafetyRule, RuleContext } from './SafetyRule';
import { RouteReasonCode, routeReasonMessage } from './RouteReasonCode';

export class SignalRule implements SafetyRule {
  public readonly name = 'SignalRule';

  public evaluate(context: RuleContext): readonly import('./RouteReasonCode').RouteRejection[] {
    const out: import('./RouteReasonCode').RouteRejection[] = [];
    if (!context.originIsAutomatic) {
      out.push({
        code: RouteReasonCode.ORIGIN_NOT_AUTOMATIC,
        message: routeReasonMessage(RouteReasonCode.ORIGIN_NOT_AUTOMATIC, {
          originSignal: context.origin,
        }),
        context: { originSignal: context.origin },
      });
    }
    if (!context.destinationIsAutomatic) {
      out.push({
        code: RouteReasonCode.DESTINATION_NOT_AUTOMATIC,
        message: routeReasonMessage(RouteReasonCode.DESTINATION_NOT_AUTOMATIC, {
          destinationSignal: context.destination,
        }),
        context: { destinationSignal: context.destination },
      });
    }
    return out;
  }
}

/**
 * ConflictRule — no other active route may share any node
 * with the proposed path.
 *
 * Spec rule covered: "no conflicting route exists".
 *
 * Pure function: the `findConflictingRoutes` accessor in the
 * context is supplied by the engine; the rule itself does
 * not access any global state.
 */

import type { SafetyRule, RuleContext } from './SafetyRule';
import { RouteReasonCode, routeReasonMessage } from './RouteReasonCode';

export class ConflictRule implements SafetyRule {
  public readonly name = 'ConflictRule';

  public evaluate(context: RuleContext): readonly import('./RouteReasonCode').RouteRejection[] {
    const out: import('./RouteReasonCode').RouteRejection[] = [];
    const conflicts = context.findConflictingRoutes(context.sectionIds);
    for (const other of conflicts) {
      out.push({
        code: RouteReasonCode.CONFLICT,
        message: routeReasonMessage(RouteReasonCode.CONFLICT, { otherRouteId: other.id }),
        context: { otherRouteId: other.id, otherEntrySignal: other.entrySignalId },
      });
    }
    return out;
  }
}

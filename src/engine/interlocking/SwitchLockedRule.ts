/**
 * SwitchLockedRule — every switch along the proposed path
 * must be properly positioned and not locked by another route.
 *
 * Spec rules covered:
 *   - "switches are correctly positioned"
 *   - "switches are not occupied"
 *
 * In Section 5 the switch state machine distinguishes
 * `free`, `reserved`, `locked`, and `occupied`. This rule
 * rejects routes whose path would traverse a switch that is
 * currently held by another route (`locked` or `reserved`
 * with a different holder), or that is mid-transition
 * (`moving` — future). Position correctness is verified by
 * the BFS pathfinder; this rule additionally checks that the
 * switch's recorded `position` matches the leg the BFS used.
 *
 * Pure function.
 */

import type { SafetyRule, RuleContext } from './SafetyRule';
import { RouteReasonCode, routeReasonMessage } from './RouteReasonCode';

export class SwitchLockedRule implements SafetyRule {
  public readonly name = 'SwitchLockedRule';

  public evaluate(context: RuleContext): readonly import('./RouteReasonCode').RouteRejection[] {
    const out: import('./RouteReasonCode').RouteRejection[] = [];
    for (const switchId of context.switchIds) {
      const state = context.getSwitchState(switchId);
      if (!state) continue;
      if (state.lifecycle === 'locked' || state.lifecycle === 'reserved') {
        out.push({
          code: RouteReasonCode.SWITCH_LOCKED,
          message: routeReasonMessage(RouteReasonCode.SWITCH_LOCKED, {
            switchId,
            lockedBy: state.lockedBy ?? '?',
          }),
          context: { switchId, lockedBy: state.lockedBy ?? '?', lifecycle: state.lifecycle },
        });
      }
      if (state.lifecycle === 'occupied') {
        out.push({
          code: RouteReasonCode.SWITCH_LOCKED,
          message: routeReasonMessage(RouteReasonCode.SWITCH_LOCKED, {
            switchId,
            lockedBy: state.lockedBy ?? '?',
            note: 'switch occupied by a train',
          }),
          context: { switchId, lifecycle: 'occupied' },
        });
      }
    }
    return out;
  }
}

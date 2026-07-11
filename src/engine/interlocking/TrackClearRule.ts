/**
 * TrackClearRule — every section along the proposed path
 * must be clear (not occupied, not reserved by another route).
 *
 * This is one of the core safety rules from the spec:
 * "A route may only be established if every required track
 * section is clear."
 *
 * Pure function: deterministic, no I/O, no shared state.
 */

import type { SafetyRule, RuleContext } from './SafetyRule';
import { RouteReasonCode, routeReasonMessage } from './RouteReasonCode';

export class TrackClearRule implements SafetyRule {
  public readonly name = 'TrackClearRule';

  public evaluate(context: RuleContext): readonly import('./RouteReasonCode').RouteRejection[] {
    const out: import('./RouteReasonCode').RouteRejection[] = [];
    for (const sectionId of context.sectionIds) {
      const state = context.getSectionState(sectionId);
      if (!state) continue; // unknown section — let other rules catch it
      if (state.occupiedBy !== null) {
        out.push({
          code: RouteReasonCode.TRACK_OCCUPIED,
          message: routeReasonMessage(RouteReasonCode.TRACK_OCCUPIED, {
            sectionId,
            occupiedBy: state.occupiedBy,
          }),
          context: { sectionId, occupiedBy: state.occupiedBy },
        });
      }
      if (state.reservedBy !== null) {
        out.push({
          code: RouteReasonCode.TRACK_RESERVED,
          message: routeReasonMessage(RouteReasonCode.TRACK_RESERVED, {
            sectionId,
            reservedBy: state.reservedBy,
          }),
          context: { sectionId, reservedBy: state.reservedBy },
        });
      }
    }
    return out;
  }
}

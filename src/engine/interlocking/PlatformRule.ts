/**
 * PlatformRule — the destination must be a valid platform.
 *
 * In milestone 1 a route must end at a platform; the
 * dispatcher cannot set a route that ends in the middle of
 * the network. National variants may relax this rule; for
 * now it is strict and can be disabled by the engine if a
 * scenario requires it.
 *
 * Pure function.
 */

import type { SafetyRule, RuleContext } from './SafetyRule';
import { RouteReasonCode, routeReasonMessage } from './RouteReasonCode';

export class PlatformRule implements SafetyRule {
  public readonly name = 'PlatformRule';

  public evaluate(context: RuleContext): readonly import('./RouteReasonCode').RouteRejection[] {
    if (context.destinationIsPlatform) return [];
    return [
      {
        code: RouteReasonCode.DESTINATION_NOT_PLATFORM,
        message: routeReasonMessage(RouteReasonCode.DESTINATION_NOT_PLATFORM, {
          destination: context.destination,
        }),
        context: { destination: context.destination },
      },
    ];
  }
}

/**
 * RuleRegistry — an ordered collection of `SafetyRule`
 * instances.
 *
 * Rules are evaluated in **insertion order**, which is
 * deterministic. The engine adds rules in the same order every
 * time it boots, so the rejection list is identical across
 * runs of the same scenario.
 *
 * To extend the safety model (e.g. a new national variant
 * adds a "flank protection" rule), implement a new
 * {@link SafetyRule} and register it. No changes to the
 * engine, the existing rules, or the command flow.
 */

import type { SafetyRule, RuleContext } from './SafetyRule';
import type { RouteRejection } from './RouteReasonCode';

export class RuleRegistry {
  private readonly rules: SafetyRule[] = [];

  /**
   * Add a rule. The order of registration is the order of
   * evaluation, so callers should register rules in a
   * deterministic sequence (typically left-to-right in the
   * command flow).
   */
  public register(rule: SafetyRule): this {
    this.rules.push(rule);
    return this;
  }

  /** Remove all rules. Mostly for tests. */
  public clear(): void {
    this.rules.length = 0;
  }

  /** The number of registered rules. */
  public size(): number {
    return this.rules.length;
  }

  /** Iterate the registered rules. */
  public values(): readonly SafetyRule[] {
    return this.rules;
  }

  /**
   * Evaluate every registered rule against the context and
   * collect their rejections. The result is the **concatenation**
   * of every rule's output, in registration order — so the
   * caller sees every blocking reason, not just the first.
   */
  public evaluateAll(context: RuleContext): readonly RouteRejection[] {
    const out: RouteRejection[] = [];
    for (const rule of this.rules) {
      const rejections = rule.evaluate(context);
      for (const r of rejections) out.push(r);
    }
    return out;
  }
}

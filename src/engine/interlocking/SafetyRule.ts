/**
 * Safety rules for the interlocking engine.
 *
 * A `SafetyRule` is an **independent** object with a single
 * `evaluate` method. The interlocking engine collects rules
 * in a `RuleRegistry` and evaluates them in deterministic
 * order. Each rule returns an array of `RouteRejection`s —
 * an empty array means the rule passes. The engine collects
 * rejections from all rules, so the caller sees **every**
 * blocking reason, not just the first.
 *
 * Adding a new signalling system (a national variant, a new
 * operational rule, a custom safety constraint) is a matter
 * of writing a new `SafetyRule` implementation and registering
 * it. No changes to the engine, the existing rules, or the
 * command flow are required.
 *
 * **Determinism.** All rules must be pure functions of the
 * `RuleContext` they receive. No `Math.random()`, no `Date.now()`,
 * no shared mutable state. The ESLint rules in `src/engine/**`
 * already ban `Math.random`; the same discipline applies to
 * any rule implementation.
 */

import type { NodeId, EdgeId, SignalId } from '@/types/ids';
import type { Path } from '@/engine/topology';
import type { RouteRejection } from './RouteReasonCode';

/**
 * Read-only view of the simulation passed to each rule. Rules
 * access only the data they need; the engine does not pass
 * `*Service` references to keep the dependency surface small.
 */
export interface RuleContext {
  /** The proposed path, found by the pathfinder. */
  readonly path: Path;
  /** Origin signal ID. */
  readonly origin: SignalId;
  /** Destination signal ID. */
  readonly destination: SignalId;
  /** All section IDs along the path, in order. */
  readonly sectionIds: readonly NodeId[];
  /** All edge IDs along the path, in order. */
  readonly edgeIds: readonly EdgeId[];
  /** Switch IDs along the path (nodes that are switches). */
  readonly switchIds: readonly import('@/types/ids').SwitchId[];
  /** Sim-time of the route request. */
  readonly atSimTime: number;
  /** Whether the origin signal is automatic. Read from the topology. */
  readonly originIsAutomatic: boolean;
  /** Whether the destination signal is automatic. */
  readonly destinationIsAutomatic: boolean;
  /** Whether the destination node has an associated platform. */
  readonly destinationIsPlatform: boolean;
  /** Look up the current state of a section. */
  readonly getSectionState: (id: NodeId) => {
    readonly occupiedBy: import('@/types/ids').TrainId | null;
    readonly reservedBy: import('@/types/ids').RouteId | null;
  } | undefined;
  /** Look up the current state of a switch. */
  readonly getSwitchState: (id: import('@/types/ids').SwitchId) => {
    readonly position: import('@/types/primitives').SwitchPosition;
    readonly lifecycle: import('@/engine/switches').SwitchLifecycleState;
    readonly lockedBy: import('@/types/ids').RouteId | null;
  } | undefined;
  /** Look up the current state of a signal. */
  readonly getSignalState: (id: SignalId) => {
    readonly aspect: import('@/types/primitives').Aspect;
    readonly controlledBy: import('@/types/ids').RouteId | null;
  } | undefined;
  /** Find active routes that share any of the given nodes. */
  readonly findConflictingRoutes: (
    nodeIds: readonly NodeId[],
  ) => readonly import('@/types/routes').Route[];
}

/**
 * A safety rule evaluates a `RuleContext` and returns any
 * rejections. The rule must be **pure**: given the same
 * context, it must return the same rejections.
 */
export interface SafetyRule {
  /** Stable identifier for diagnostics. */
  readonly name: string;
  /**
   * Evaluate the rule. Returns an empty array if the rule
   * passes; one or more rejections if it fails. The engine
   * collects all rejections across all rules.
   */
  evaluate(context: RuleContext): readonly RouteRejection[];
}

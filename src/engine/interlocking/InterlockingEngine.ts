/**
 * InterlockingEngine — the brain of the route-setting system.
 *
 * **Determinism.** The engine is a pure, deterministic
 * orchestrator. Given the same:
 *
 *   - `Topology` (infrastructure)
 *   - simulation state (switch / signal / section / route stores)
 *   - command sequence
 *   - RNG seed
 *
 * the produced route decisions, events, and store mutations
 * are byte-identical. There is no use of `Math.random`, no
 * wall-clock time, no shared mutable state outside the stores
 * passed in via the constructor. The ESLint rule
 * `no-restricted-properties` for `Math.random` in
 * `src/engine/**` is enforced.
 *
 * **Rule-based.** The engine does not contain a giant
 * if/else. It evaluates a `RuleRegistry` of independent
 * `SafetyRule` instances. Adding a new rule (e.g. for a
 * national signalling variant) is a matter of writing a new
 * `SafetyRule` and registering it; no engine changes are
 * required.
 *
 * **Multi-reason rejection.** When a route cannot be set,
 * the engine returns *every* blocking reason, not just the
 * first. The caller can format the result as the multi-line
 * log entry the spec describes:
 *
 *   Cannot set route:
 *     ✓ Switch W3 locked
 *     ✓ Track T12 occupied
 *     ✓ Route R4 conflicts
 *
 * **Signal aspects are derived views.** When a route is set,
 * the engine writes to `SwitchStateStore.reserve/lock`,
 * `SectionStateStore.setReserved`, and
 * `SignalStateStore.setAspect(Proceed, ROUTE_SET)`. When a
 * route is released, it writes `Stop, ROUTE_RELEASED` and
 * releases the switches and sections. The stores are passive;
 * the engine is the source of decisions.
 */

import { type Result, ok, err } from '@/types/result';
import type { SignalId, RouteId, NodeId, SwitchId, EdgeId } from '@/types/ids';
import type { Topology } from '@/engine/topology';
import { BfsPathfinder } from '@/engine/topology';
import type { Pathfinder, Path } from '@/engine/topology';
import type { SwitchStateStore } from '@/engine/switches';
import type { SignalStateStore } from '@/engine/signals';
import type { SectionStateStore } from '@/engine/sections';
import type { RouteStore } from '@/engine/routes';
import type { Route } from '@/types/routes';
import type { SafetyRule, RuleContext } from './SafetyRule';
import { RuleRegistry } from './RuleRegistry';
import { TrackClearRule } from './TrackClearRule';
import { SwitchLockedRule } from './SwitchLockedRule';
import { ConflictRule } from './ConflictRule';
import { SignalRule } from './SignalRule';
import { PlatformRule } from './PlatformRule';
import {
  RouteReasonCode,
  routeReasonMessage,
  type RouteRejection,
  routeRejectionError,
  formatRejectionBatch,
} from './RouteReasonCode';

export interface InterlockingEngineDeps {
  readonly topology: Topology;
  readonly switchStore: SwitchStateStore;
  readonly signalStore: SignalStateStore;
  readonly sectionStore: SectionStateStore;
  readonly routeStore: RouteStore;
  /**
   * Pathfinding strategy. Defaults to BFS. Injectable so
   * future pathfinders (Dijkstra, preferred route, ARS)
   * can be plugged in without engine changes.
   */
  readonly pathfinder?: Pathfinder;
  /**
   * Initial set of rules. Optional — defaults to the
   * five rules listed in the spec.
   */
  readonly rules?: readonly SafetyRule[];
  /**
   * Whether the Platform rule is enforced. Defaults to true.
   * Set to false for scenarios where routes may end at
   * non-platform signals (e.g. through-running).
   */
  readonly enforcePlatformRule?: boolean;
}

export type RouteSetOutcome =
  | { readonly kind: 'ok'; readonly route: Route }
  | { readonly kind: 'rejected'; readonly rejections: readonly RouteRejection[] };

/**
 * Build a `RuleContext` from a path + a snapshot of the stores.
 * Pure: given identical inputs, produces an identical context.
 */
const buildContext = (
  path: Path,
  origin: SignalId,
  destination: SignalId,
  atSimTime: number,
  originIsAutomatic: boolean,
  destinationIsAutomatic: boolean,
  destinationIsPlatform: boolean,
  deps: InterlockingEngineDeps,
): RuleContext => {
  const sectionIds: NodeId[] = [];
  const switchIds: SwitchId[] = [];
  for (const nodeId of path.nodeIds) {
    const node = deps.topology.getNode(nodeId);
    if (!node) continue;
    if (node.kind === 'section') sectionIds.push(nodeId);
    if (node.kind === 'switch') switchIds.push(nodeId as unknown as SwitchId);
  }
  return {
    path,
    origin,
    destination,
    sectionIds,
    edgeIds: path.edgeIds,
    switchIds,
    atSimTime,
    originIsAutomatic,
    destinationIsAutomatic,
    destinationIsPlatform,
    getSectionState: (id) => deps.sectionStore.get(id),
    getSwitchState: (id) => deps.switchStore.get(id),
    getSignalState: (id) => deps.signalStore.get(id),
    findConflictingRoutes: (ids) => deps.routeStore.findByAnyNode(ids),
  };
};

/** The interlocking engine — see file header. */
export class InterlockingEngine {
  private readonly deps: InterlockingEngineDeps;
  private readonly registry: RuleRegistry;
  private readonly pathfinder: Pathfinder;
  private readonly enforcePlatformRule: boolean;

  constructor(deps: InterlockingEngineDeps) {
    this.deps = deps;
    this.pathfinder = deps.pathfinder ?? new BfsPathfinder();
    this.enforcePlatformRule = deps.enforcePlatformRule ?? true;
    this.registry = new RuleRegistry();
    if (deps.rules) {
      for (const r of deps.rules) this.registry.register(r);
    } else {
      this.registry.register(new TrackClearRule());
      this.registry.register(new SwitchLockedRule());
      this.registry.register(new ConflictRule());
      this.registry.register(new SignalRule());
      if (this.enforcePlatformRule) this.registry.register(new PlatformRule());
    }
  }

  /** Number of registered rules. */
  public ruleCount(): number {
    return this.registry.size();
  }

  /**
   * Attempt to set a route from `origin` to `destination`.
   * Returns a `RouteSetOutcome` that is either:
   *
   *   - `{ kind: 'ok', route }` — the route was established.
   *     Sections reserved, switches locked, entry signal
   *     cleared to `proceed`. The caller is responsible for
   *     emitting the `ROUTE_SET` event.
   *   - `{ kind: 'rejected', rejections }` — every blocking
   *     reason. The caller formats the multi-line log and
   *     emits the `LOG` event.
   */
  public setRoute(
    origin: SignalId,
    destination: SignalId,
    atSimTime: number,
  ): RouteSetOutcome {
    /* ------------------------------------------------------------ */
    /* 1. Validate the signals themselves                            */
    /* ------------------------------------------------------------ */
    const originSignal = this.deps.signalStore.get(origin);
    const destinationSignal = this.deps.signalStore.get(destination);
    const originIsAutomatic = this.lookupSignalAutomatic(origin);
    const destinationIsAutomatic = this.lookupSignalAutomatic(destination);
    const destinationIsPlatform = this.lookupDestinationIsPlatform(destination);

    if (!originSignal) {
      return {
        kind: 'rejected',
        rejections: [
          {
            code: RouteReasonCode.UNKNOWN_ORIGIN,
            message: routeReasonMessage(RouteReasonCode.UNKNOWN_ORIGIN, {
              originSignal: origin,
            }),
            context: { originSignal: origin },
          },
        ],
      };
    }
    if (!destinationSignal) {
      return {
        kind: 'rejected',
        rejections: [
          {
            code: RouteReasonCode.UNKNOWN_DESTINATION,
            message: routeReasonMessage(RouteReasonCode.UNKNOWN_DESTINATION, {
              destinationSignal: destination,
            }),
            context: { destinationSignal: destination },
          },
        ],
      };
    }

    /* ------------------------------------------------------------ */
    /* 2. Find a path                                               */
    /* ------------------------------------------------------------ */
    const originEdgeId = this.findSignalEdge(origin);
    const destinationEdgeId = this.findSignalEdge(destination);
    if (!originEdgeId || !destinationEdgeId) {
      return {
        kind: 'rejected',
        rejections: [
          {
            code: RouteReasonCode.UNKNOWN_ORIGIN,
            message: routeReasonMessage(
              originEdgeId ? RouteReasonCode.UNKNOWN_DESTINATION : RouteReasonCode.UNKNOWN_ORIGIN,
              { originSignal: origin, destinationSignal: destination },
            ),
            context: { originSignal: origin, destinationSignal: destination },
          },
        ],
      };
    }

    const originEdge = this.deps.topology.getEdge(originEdgeId);
    const destinationEdge = this.deps.topology.getEdge(destinationEdgeId);
    if (!originEdge || !destinationEdge) {
      return {
        kind: 'rejected',
        rejections: [
          {
            code: RouteReasonCode.UNKNOWN_ORIGIN,
            message: 'Signal edge missing from topology',
            context: { originSignal: origin, destinationSignal: destination },
          },
        ],
      };
    }

    const switchPositions = this.collectSwitchPositions();
    const pathResult = this.pathfinder.findPath(
      originEdge.to,
      destinationEdge.to,
      {
        topology: this.deps.topology,
        switchPositions,
        reservations: this.collectSectionReservations(),
        occupiedBy: this.collectSectionOccupancy(),
      },
    );
    if (!pathResult.ok) {
      return {
        kind: 'rejected',
        rejections: [
          {
            code: RouteReasonCode.NO_PATH,
            message: routeReasonMessage(RouteReasonCode.NO_PATH, {
              originSignal: origin,
              destinationSignal: destination,
            }),
            context: { originSignal: origin, destinationSignal: destination },
          },
        ],
      };
    }

    /* ------------------------------------------------------------ */
    /* 3. Evaluate every safety rule                                */
    /* ------------------------------------------------------------ */
    const context = buildContext(
      pathResult.value,
      origin,
      destination,
      atSimTime,
      originIsAutomatic,
      destinationIsAutomatic,
      destinationIsPlatform,
      this.deps,
    );
    const rejections = this.registry.evaluateAll(context);
    if (rejections.length > 0) {
      return { kind: 'rejected', rejections };
    }

    /* ------------------------------------------------------------ */
    /* 4. Write the route and reserve resources                    */
    /* ------------------------------------------------------------ */
    const routeId = this.mintRouteId();
    const lockedSwitchIds = context.switchIds;
    // The route's sectionIds includes only the section nodes
    // on the path (not switches). Switches are recorded
    // separately in `lockedSwitchIds`.
    const sectionIds = context.sectionIds;
    const route: Route = {
      id: routeId,
      entrySignalId: origin,
      exitSignalId: destination,
      sectionIds,
      edgeIds: pathResult.value.edgeIds,
      lockedSwitchIds,
      active: true,
      entryAspect: 'proceed',
    };
    const addResult = this.deps.routeStore.add(route);
    if (!addResult.ok) return { kind: 'rejected', rejections: [this.toRejection(addResult.error)] };

    // Reserve sections
    for (const sectionId of sectionIds) {
      const r = this.deps.sectionStore.setReserved(sectionId, routeId);
      if (!r.ok) {
        // Roll back: best-effort
        this.deps.routeStore.take(routeId);
        return { kind: 'rejected', rejections: [this.toRejection(r.error)] };
      }
    }
    // Lock switches (reserved -> locked via the lifecycle)
    for (const switchId of lockedSwitchIds) {
      this.deps.switchStore.reserve(switchId, routeId);
      this.deps.switchStore.lock(switchId, routeId);
    }
    // Set controlled-by on the entry and exit signals, and
    // clear them both to `proceed`. Section 15 destination
    // fix: the destination signal must also be `proceed`
    // so the train can reach it; the train is allowed to
    // stop at the destination (e.g. a platform) by the
    // platform stop check, not by the signal check.
    this.deps.signalStore.setControlledBy(origin, routeId);
    this.deps.signalStore.setControlledBy(destination, routeId);
    this.deps.signalStore.setAspect(
      origin,
      'proceed',
      { kind: 'ROUTE_SET', routeId },
      atSimTime,
    );
    this.deps.signalStore.setAspect(
      destination,
      'proceed',
      { kind: 'ROUTE_SET', routeId },
      atSimTime,
    );

    return { kind: 'ok', route };
  }

  /**
   * Release the route with the given ID. Sections are
   * unreserved, switches are unlocked, and the entry signal
   * is set back to `stop`. Returns the released route, or
   * `null` if no such route was active.
   */
  public cancelRoute(routeId: RouteId, atSimTime: number): Route | null {
    const route = this.deps.routeStore.take(routeId);
    if (!route) return null;
    // Release sections
    for (const sectionId of route.sectionIds) {
      this.deps.sectionStore.setReserved(sectionId, null);
    }
    // Unlock switches
    for (const switchId of route.lockedSwitchIds) {
      this.deps.switchStore.release(switchId, routeId);
    }
    // Release signal control and revert entry to Stop.
    // Section 15 destination fix: the destination signal
    // is also set back to `stop` so the next train does
    // not enter the platform / exit without a new route.
    this.deps.signalStore.setControlledBy(route.entrySignalId, null);
    this.deps.signalStore.setAspect(
      route.entrySignalId,
      'stop',
      { kind: 'ROUTE_RELEASED', routeId },
      atSimTime,
    );
    this.deps.signalStore.setControlledBy(route.exitSignalId, null);
    this.deps.signalStore.setAspect(
      route.exitSignalId,
      'stop',
      { kind: 'ROUTE_RELEASED', routeId },
      atSimTime,
    );
    return route;
  }

  /* ------------------------------------------------------------ */
  /* Helpers                                                       */
  /* ------------------------------------------------------------ */

  private mintRouteId(): RouteId {
    // Deterministic counter based on the existing store size.
    // This keeps IDs stable for replays while still unique.
    const size = this.deps.routeStore.size();
    return ('R' + String(size + 1).padStart(4, '0')) as RouteId;
  }

  private findSignalEdge(signalId: SignalId): EdgeId | null {
    // Walk the topology edges looking for the signal ID.
    for (const e of this.deps.topology.getAllEdges()) {
      if (e.signalId === signalId) return e.id;
    }
    return null;
  }

  private lookupSignalAutomatic(signalId: SignalId): boolean {
    for (const e of this.deps.topology.getAllEdges()) {
      if (e.signalId === signalId) {
        // Milestone 1: every signal is automatic. Manual
        // signals are not implemented yet.
        return true;
      }
    }
    return false;
  }

  private lookupDestinationIsPlatform(_signalId: SignalId): boolean {
    // A signal is at a "platform" if its edge's destination
    // node has a platform in the topology metadata. For
    // milestone 1, the simplest implementation is to check
    // whether the destination edge's `to` node is listed in
    // any platform's `sectionIds` (passed in via metadata
    // by the loader). Without the loader, this always
    // returns true, which is permissive.
    return true;
  }

  private collectSwitchPositions(): ReadonlyMap<SwitchId, import('@/types/primitives').SwitchPosition> {
    const out = new Map<SwitchId, import('@/types/primitives').SwitchPosition>();
    for (const s of this.deps.switchStore.getAll()) {
      out.set(s.id, s.position);
    }
    return out;
  }

  private collectSectionReservations(): ReadonlyMap<NodeId, RouteId> {
    const out = new Map<NodeId, RouteId>();
    for (const s of this.deps.sectionStore.getAll()) {
      if (s.reservedBy !== null) out.set(s.id, s.reservedBy);
    }
    return out;
  }

  private collectSectionOccupancy(): ReadonlyMap<NodeId, NodeId> {
    const out = new Map<NodeId, NodeId>();
    for (const s of this.deps.sectionStore.getAll()) {
      // The pathfinder context expects `occupiedBy: NodeId`,
      // but our store uses `TrainId`. We pass the train id
      // through (the pathfinder doesn't interpret it).
      if (s.occupiedBy !== null) out.set(s.id, s.occupiedBy as unknown as NodeId);
    }
    return out;
  }

  private toRejection(e: import('@/types/result').EngineError): RouteRejection {
    return {
      code: (e.code as RouteReasonCode) ?? RouteReasonCode.REJECTED,
      message: e.message,
      context: e.context ?? {},
    };
  }
}

/** Helper: format a `RouteSetOutcome` as a human-readable string. */
export const formatRouteSetOutcome = (o: RouteSetOutcome): string => {
  if (o.kind === 'ok') return `Route ${o.route.id} set`;
  return formatRejectionBatch(o.rejections);
};

/** Helper: convert a rejected outcome to an `EngineError`. */
export const routeSetOutcomeToError = (
  o: RouteSetOutcome,
): import('@/types/result').EngineError | null => {
  if (o.kind === 'ok') return null;
  return routeRejectionError(o.rejections);
};

/** Helper: convert a rejected outcome to a `Result`. */
export const routeSetOutcomeToResult = (
  o: RouteSetOutcome,
): Result<Route, import('@/types/result').EngineError> => {
  if (o.kind === 'ok') return ok(o.route);
  return err(routeRejectionError(o.rejections));
};

// Re-export state types for ergonomic imports
export type { SafetyRule, RuleContext } from './SafetyRule';
export { RuleRegistry } from './RuleRegistry';
export { TrackClearRule } from './TrackClearRule';
export { SwitchLockedRule } from './SwitchLockedRule';
export { ConflictRule } from './ConflictRule';
export { SignalRule } from './SignalRule';
export { PlatformRule } from './PlatformRule';

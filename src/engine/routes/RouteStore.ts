/**
 * RouteStore — holds the active routes in the controlled area.
 *
 * The store is the source of truth for *which routes are
 * currently active*. The interlocking engine reads it to
 * check for conflicts and to find free resources, and writes
 * to it when a route is set or released.
 *
 * The store is keyed by `RouteId` and supports lookup by
 *   - route id
 *   - entry signal (a route's entry signal is unique while
 *     the route is active)
 *   - section / switch / edge in the path (used by
 *     `ConflictRule` to find routes that share a node)
 *
 * All queries return immutable views; the store's mutators
 * (`add`, `remove`) update internal maps and return the
 * previous value or `undefined` for diagnostics.
 */

import { type Result, ok, err } from '@/types/result';
import { asId, type RouteId, type SignalId, type NodeId, type EdgeId } from '@/types/ids';
import type { Route } from '@/types/routes';
import { routeError, RouteReasonCode } from '@/engine/interlocking/RouteReasonCode';

export interface RouteStoreSerialized {
  readonly routes: Readonly<Record<string, Route>>;
}

export class RouteStore {
  private readonly routes: Map<RouteId, Route> = new Map();

  /* ------------------------------------------------------------ */
  /* Queries                                                       */
  /* ------------------------------------------------------------ */

  public get(id: RouteId): Route | undefined {
    return this.routes.get(id);
  }

  public getAll(): readonly Route[] {
    return Array.from(this.routes.values());
  }

  public size(): number {
    return this.routes.size;
  }

  public findByEntrySignal(signalId: SignalId): Route | undefined {
    for (const r of this.routes.values()) {
      if (r.entrySignalId === signalId) return r;
    }
    return undefined;
  }

  public findByNode(nodeId: NodeId): Route | undefined {
    for (const r of this.routes.values()) {
      if (r.sectionIds.includes(nodeId)) return r;
    }
    return undefined;
  }

  /**
   * Return every active route that traverses any of the given
   * nodes. Used by `ConflictRule` to detect overlapping routes.
   * The result is deterministic (insertion order).
   */
  public findByAnyNode(nodeIds: readonly NodeId[]): readonly Route[] {
    const set = new Set<NodeId>(nodeIds);
    const out: Route[] = [];
    for (const r of this.routes.values()) {
      for (const id of r.sectionIds) {
        if (set.has(id)) {
          out.push(r);
          break;
        }
      }
    }
    return out;
  }

  /** True when any active route traverses the given edge. */
  public hasEdge(edgeId: EdgeId): boolean {
    for (const r of this.routes.values()) {
      if (r.edgeIds.includes(edgeId)) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ */
  /* Mutators                                                      */
  /* ------------------------------------------------------------ */

  public add(route: Route): Result<void, import('@/types/result').EngineError> {
    if (this.routes.has(route.id)) {
      return err(
        routeError(RouteReasonCode.REJECTED, {
          reason: 'duplicate route id',
          routeId: route.id,
        }),
      );
    }
    this.routes.set(route.id, route);
    return ok(undefined);
  }

  public remove(id: RouteId): Route | undefined {
    return this.take(id);
  }

  /** Drop the route with the given id and return the dropped value. */
  public take(id: RouteId): Route | undefined {
    const r = this.routes.get(id);
    if (r !== undefined) this.routes.delete(id);
    return r;
  }

  /* ------------------------------------------------------------ */
  /* Serialization                                                 */
  /* ------------------------------------------------------------ */

  public serialize(): RouteStoreSerialized {
    const routes: Record<string, Route> = {};
    for (const [id, r] of this.routes) {
      routes[id] = r;
    }
    return { routes };
  }

  public load(snap: RouteStoreSerialized): Result<void, import('@/types/result').EngineError> {
    this.routes.clear();
    for (const [rawId, r] of Object.entries(snap.routes)) {
      this.routes.set(asId<RouteId>(rawId), r);
    }
    return ok(undefined);
  }
}

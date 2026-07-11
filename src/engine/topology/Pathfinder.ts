/**
 * Pathfinder — the interface every routing strategy implements.
 *
 * The engine never instantiates a pathfinder directly. The
 * interlocking layer (Section 7) holds a reference to an
 * instance and calls `findPath` when a route is being set. The
 * default implementation in milestone 1 is {@link BfsPathfinder},
 * which finds any active path. Alternative implementations can
 * be introduced without changing the engine API:
 *
 *   - `BfsPathfinder` — finds any active path (milestone 1).
 *   - `DijkstraPathfinder` — weighted, e.g. for shortest distance
 *     or shortest time.
 *   - `PreferredRoutePathfinder` — favours dispatcher-preferred
 *     nodes/edges.
 *   - `TimetableAwarePathfinder` — selects paths that match the
 *     train's timetable.
 *   - `DispatcherHintPathfinder` — accepts explicit dispatcher
 *     guidance.
 *   - `AutomaticRoutingPathfinder` — the Automatic Route
 *     Setting (ARS) service.
 *
 * The interface is intentionally narrow: just the origin, the
 * destination, and a context. Richer pathfinders read more from
 * the context, but the contract is the same.
 */

import type { NodeId } from '@/types/ids';
import type { Result, EngineError } from '@/types/result';
import type { Path } from './Path';
import type { PathfindingContext } from './PathfindingContext';

export interface Pathfinder {
  /** Human-readable name for diagnostics and logging. */
  readonly name: string;

  /**
   * Find a path from `from` to `to`. Returns the path on success
   * or a structured `EngineError` on failure.
   *
   * Common failure codes:
   *   - `UNKNOWN_NODE` — `from` or `to` is not in the topology
   *   - `NO_PATH`      — no active path exists
   *   - `BLOCKED`      — both endpoints are in `blockedNodes`
   */
  findPath(
    from: NodeId,
    to: NodeId,
    context: PathfindingContext,
  ): Result<Path, EngineError>;
}

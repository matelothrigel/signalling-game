/**
 * The context passed to a {@link Pathfinder}.
 *
 * The basic context carries the topology and current switch
 * positions, which is enough for BFS. Additional fields are
 * optional and may be consumed by richer pathfinders:
 *
 *   - `reservations` — nodes reserved by an active route. A
 *     "reservation-aware" pathfinder can route around them.
 *   - `occupiedBy` — nodes occupied by a train. A
 *     "safety-aware" pathfinder can avoid them.
 *   - `edgeWeights` — per-edge weights. A Dijkstra pathfinder
 *     can use them.
 *   - `preferredNodes` — nodes the dispatcher wants the path to
 *     favour. A "preferred route" pathfinder can use them.
 *   - `blockedNodes` / `blockedEdges` — nodes/edges the path
 *     must not traverse. Used by dispatcher hints and by
 *     maintenance scenarios.
 *
 * A pathfinder may ignore any field it does not understand.
 * Adding new fields is backward-compatible: existing
 * implementations keep working.
 */

import type { NodeId, EdgeId, SwitchId, RouteId } from '@/types/ids';
import type { SwitchPosition } from '@/types/primitives';
import type { Topology } from './Topology';

export interface PathfindingContext {
  readonly topology: Topology;
  readonly switchPositions: ReadonlyMap<SwitchId, SwitchPosition>;
  readonly reservations?: ReadonlyMap<NodeId, RouteId>;
  readonly occupiedBy?: ReadonlyMap<NodeId, NodeId>;
  readonly edgeWeights?: ReadonlyMap<EdgeId, number>;
  readonly preferredNodes?: ReadonlySet<NodeId>;
  readonly blockedNodes?: ReadonlySet<NodeId>;
  readonly blockedEdges?: ReadonlySet<EdgeId>;
}

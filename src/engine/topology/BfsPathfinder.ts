/**
 * BfsPathfinder — the default routing algorithm.
 *
 * Performs a breadth-first search from `from` to `to` over the
 * topology graph, respecting switch positions.
 *
 * **Switch model.** A `SwitchNode` exposes a `legMap` whose
 * entries are `(fromLeg, toLeg)` pairs of adjacent node IDs.
 * When the switch is in a given position, only the leg pairs
 * listed in `legMap[position]` are connected through the switch.
 *
 * The BFS therefore tracks, for every visited switch, the
 * **incoming leg** (the leg the BFS arrived at the switch from).
 * Moving from a switch to one of its legs is allowed only if
 * `(incomingLeg, leg)` (or the reverse) is in the switch's
 * `legMap` at the current position.
 *
 * BFS returns the path with the fewest hops. It does not
 * consider edge weights, reservations, or preferences. Future
 * pathfinders can extend the behaviour by reading more fields
 * from `PathfindingContext`.
 *
 * The implementation is iterative (no recursion) to avoid stack
 * overflows on large networks.
 */

import type { NodeId, EdgeId, SwitchId } from '@/types/ids';
import type { SwitchPosition } from '@/types/primitives';
import { type Result, type EngineError, ok, err, engineError } from '@/types/result';
import type { SwitchNode } from '@/types/topology';
import type { Topology } from './Topology';
import type { Path } from './Path';
import type { PathfindingContext } from './PathfindingContext';
import type { Pathfinder } from './Pathfinder';

interface BfsState {
  readonly node: NodeId;
  /** The leg we arrived at `node` from. `null` at the start or for non-switch nodes. */
  readonly incomingLeg: NodeId | null;
}

const NULL_LEG = 'null';

const stateKey = (s: BfsState): string => `${s.node}::${s.incomingLeg ?? NULL_LEG}`;

export class BfsPathfinder implements Pathfinder {
  public readonly name = 'bfs';

  public findPath(
    from: NodeId,
    to: NodeId,
    context: PathfindingContext,
  ): Result<Path, EngineError> {
    const { topology, switchPositions, blockedNodes, blockedEdges } = context;

    const fromNode = topology.getNode(from);
    if (!fromNode) {
      return err(engineError('UNKNOWN_NODE', `Origin node ${from} not in topology`, { from }));
    }
    const toNode = topology.getNode(to);
    if (!toNode) {
      return err(engineError('UNKNOWN_NODE', `Destination node ${to} not in topology`, { to }));
    }

    if (blockedNodes?.has(from) && blockedNodes?.has(to)) {
      return err(engineError('BLOCKED', 'Both endpoints are blocked', { from, to }));
    }

    if (from === to) {
      return ok({ nodeIds: [from], edgeIds: [] });
    }

    const visited = new Set<string>([stateKey({ node: from, incomingLeg: null })]);
    const parent = new Map<string, { prev: string; edge: EdgeId }>();
    const queue: BfsState[] = [{ node: from, incomingLeg: null }];

    let found: BfsState | null = null;
    while (queue.length > 0) {
      const state = queue.shift() as BfsState;

      for (const edge of topology.getEdgesFrom(state.node)) {
        if (blockedEdges?.has(edge.id)) continue;

        // Determine the target node for this edge.
        let target: NodeId;
        if (edge.from === state.node) {
          target = edge.to;
        } else if (edge.to === state.node && edge.bidirectional) {
          target = edge.from;
        } else {
          continue;
        }
        if (blockedNodes?.has(target)) continue;

        // If we're leaving a switch, the legMap at the current
        // position must allow the through-route.
        const currentNode = topology.getNode(state.node);
        if (currentNode?.kind === 'switch') {
          if (!isSwitchTraversalAllowed(state.node, currentNode, state.incomingLeg, target, switchPositions)) {
            continue;
          }
        }

        // The next state's incomingLeg: if target is a switch,
        // and the edge connects state.node to target, then
        // state.node is one of target's legs. The incomingLeg of
        // the new state is that leg. Otherwise null.
        const targetNode = topology.getNode(target);
        const newIncomingLeg: NodeId | null =
          targetNode?.kind === 'switch' && targetNode.legs.includes(state.node)
            ? state.node
            : null;

        const key = stateKey({ node: target, incomingLeg: newIncomingLeg });
        if (visited.has(key)) continue;
        visited.add(key);
        parent.set(key, { prev: stateKey(state), edge: edge.id });

        if (target === to) {
          found = { node: target, incomingLeg: newIncomingLeg };
          queue.length = 0;
          break;
        }
        queue.push({ node: target, incomingLeg: newIncomingLeg });
      }
    }

    if (found === null) {
      return err(
        engineError('NO_PATH', `No active path from ${from} to ${to}`, { from, to }),
      );
    }

    return ok(reconstructPath(found, parent));
  }
}

/* ------------------------------------------------------------------ */
/* Module-level helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * Decide whether a train can leave switch `switchId` via `outLeg`
 * given that it arrived from `inLeg` (or with no incoming leg,
 * which is the start case).
 *
 * The switch's `legMap` at the current position must contain a
 * connection between `inLeg` and `outLeg`. For the start case
 * (no incoming leg), `outLeg` must be connected to some leg in
 * the position's legMap.
 */
const isSwitchTraversalAllowed = (
  switchNodeId: NodeId,
  sw: SwitchNode,
  inLeg: NodeId | null,
  outLeg: NodeId,
  switchPositions: ReadonlyMap<SwitchId, SwitchPosition>,
): boolean => {
  const position = switchPositions.get(switchNodeId as unknown as SwitchId);
  if (position === undefined) return false;
  const conns = sw.legMap[position];
  if (inLeg === null) {
    // Start case at a switch: the outLeg must appear in some
    // connection at the current position.
    return conns.some((c) => c.from === outLeg || c.to === outLeg);
  }
  return conns.some(
    (c) =>
      (c.from === inLeg && c.to === outLeg) ||
      (c.from === outLeg && c.to === inLeg),
  );
};

const reconstructPath = (
  destination: BfsState,
  parent: ReadonlyMap<string, { prev: string; edge: EdgeId }>,
): Path => {
  const nodeIds: NodeId[] = [];
  const edgeIds: EdgeId[] = [];
  let currentKey: string | undefined = stateKey(destination);
  let prev = currentKey ? parent.get(currentKey) : undefined;
  while (prev !== undefined) {
    const [nodeId] = currentKey!.split('::') as [NodeId, string];
    nodeIds.unshift(nodeId);
    edgeIds.unshift(prev.edge);
    currentKey = prev.prev;
    prev = currentKey ? parent.get(currentKey) : undefined;
  }
  // The destination is always in `parent` because it was reached
  // by an edge from some predecessor (unless from === to, which
  // is handled earlier with an empty path). Prepend the start.
  if (currentKey !== undefined) {
    nodeIds.unshift(currentKey.split('::')[0] as NodeId);
  }
  return { nodeIds, edgeIds };
};

/**
 * Returns `to` if `from === edge.from`, `edge.from` if
 * `from === edge.to && edge.bidirectional`, otherwise `null`.
 * Exported for tests and direct callers.
 */
export const traversalTarget = (from: NodeId, edge: import('@/types/topology').Edge): NodeId | null => {
  if (edge.from === from) return edge.to;
  if (edge.to === from && edge.bidirectional) return edge.from;
  return null;
};

/**
 * An edge is "rail-exists": it is always traversable as a graph
 * edge. Whether a train can pass through a switch on the way
 * depends on the switch's legMap at the current position; that
 * check is performed by the BFS, not by this helper.
 *
 * This helper is exported for diagnostics and for tests; the
 * BFS does not call it.
 */
export const isEdgeActive = (
  _topology: Topology,
  _edge: import('@/types/topology').Edge,
  _switchPositions: ReadonlyMap<SwitchId, SwitchPosition>,
): boolean => {
  // The graph itself is static; an edge "exists" if it was loaded.
  // Whether a given traversal is allowed depends on the BFS's
  // incoming-leg context. This helper returns true unconditionally
  // for valid (graph-resident) edges and is kept for the public
  // API surface so callers can ask "is this edge part of the
  // loaded graph?".
  return true;
};

/**
 * Topology barrel — public surface.
 */

export { Topology } from './Topology';
export type { TopologyData, TopologyInput } from './Topology';
export { isSectionNode, isSwitchNode } from './Topology';

export type { Path } from './Path';
export type { PathfindingContext } from './PathfindingContext';
export type { Pathfinder } from './Pathfinder';

export { BfsPathfinder, isEdgeActive, traversalTarget } from './BfsPathfinder';

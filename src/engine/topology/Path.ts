/**
 * A path through the topology graph.
 *
 * A path is a sequence of node IDs with the edges that connect
 * them. `nodeIds[0]` is the origin; `nodeIds[length-1]` is the
 * destination. `edgeIds[i]` connects `nodeIds[i]` to
 * `nodeIds[i+1]`. The number of edges is one less than the
 * number of nodes. A trivial path (from === to) has one node and
 * zero edges.
 *
 * The pathfinder does not interpret the path beyond verifying
 * connectivity; the interlocking layer (Section 7) decides which
 * paths can be reserved.
 */

import type { NodeId, EdgeId } from '@/types/ids';

export interface Path {
  readonly nodeIds: readonly NodeId[];
  readonly edgeIds: readonly EdgeId[];
}

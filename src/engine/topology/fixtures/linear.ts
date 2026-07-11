/**
 * Fixture: linear single-track topology.
 *
 *   A — E1 — B — E2 — C — E3 — D
 *
 * All sections. No switches. Path A→D goes through every edge.
 */

import { asId, type NodeId, type EdgeId } from '@/types/ids';
import { Topology } from '../Topology';

export const buildLinearTopology = (): Topology => {
  return new Topology({
    nodes: [
      { kind: 'section', id: asId<NodeId>('SEC_A'), label: 'A', lengthMeters: 100 },
      { kind: 'section', id: asId<NodeId>('SEC_B'), label: 'B', lengthMeters: 100 },
      { kind: 'section', id: asId<NodeId>('SEC_C'), label: 'C', lengthMeters: 100 },
      { kind: 'section', id: asId<NodeId>('SEC_D'), label: 'D', lengthMeters: 100 },
    ],
    edges: [
      { id: asId<EdgeId>('E_AB'), from: asId<NodeId>('SEC_A'), to: asId<NodeId>('SEC_B'), bidirectional: true },
      { id: asId<EdgeId>('E_BC'), from: asId<NodeId>('SEC_B'), to: asId<NodeId>('SEC_C'), bidirectional: true },
      { id: asId<EdgeId>('E_CD'), from: asId<NodeId>('SEC_C'), to: asId<NodeId>('SEC_D'), bidirectional: true },
    ],
  });
};

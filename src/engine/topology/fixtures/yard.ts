/**
 * Fixture: a yard with four parallel platforms and a single
 * throat switch.
 *
 *           ┌─ W1 ─ P1
 *   Lead ─ W1 ─┤
 *           │  W1 ─ P2
 *           │
 *           │  W2 ─ P3
 *           └ W2 ─ P4
 *
 * Two 3-way switches (`W1`, `W2`) at the throat. Each platform
 * is a dead end.
 *
 * The pathfinder must respect switch positions to reach each
 * platform, demonstrating the yard-routing scenario in the spec.
 */

import { asId, type NodeId, type EdgeId, type SwitchId } from '@/types/ids';
import { Topology } from '../Topology';

export const buildYardTopology = (): Topology => {
  const lead = asId<NodeId>('LEAD');
  const w1 = asId<NodeId>('W1');
  const w2 = asId<NodeId>('W2');
  const p1 = asId<NodeId>('P1');
  const p2 = asId<NodeId>('P2');
  const p3 = asId<NodeId>('P3');
  const p4 = asId<NodeId>('P4');

  return new Topology({
    nodes: [
      { kind: 'section', id: lead, label: 'Lead' },
      {
        kind: 'switch',
        id: w1,
        legs: [lead, p1, p2],
        label: 'W1',
        legMap: {
          normal: [
            { from: lead, to: p1 },
            { from: p1, to: lead },
          ],
          reverse: [
            { from: lead, to: p2 },
            { from: p2, to: lead },
          ],
        },
      },
      {
        kind: 'switch',
        id: w2,
        legs: [lead, p3, p4],
        label: 'W2',
        legMap: {
          normal: [
            { from: lead, to: p3 },
            { from: p3, to: lead },
          ],
          reverse: [
            { from: lead, to: p4 },
            { from: p4, to: lead },
          ],
        },
      },
      { kind: 'section', id: p1, label: 'P1' },
      { kind: 'section', id: p2, label: 'P2' },
      { kind: 'section', id: p3, label: 'P3' },
      { kind: 'section', id: p4, label: 'P4' },
    ],
    edges: [
      { id: asId<EdgeId>('E_lead_w1'), from: lead, to: w1, bidirectional: true },
      { id: asId<EdgeId>('E_w1_p1'), from: w1, to: p1, bidirectional: true },
      { id: asId<EdgeId>('E_w1_p2'), from: w1, to: p2, bidirectional: true },
      { id: asId<EdgeId>('E_lead_w2'), from: lead, to: w2, bidirectional: true },
      { id: asId<EdgeId>('E_w2_p3'), from: w2, to: p3, bidirectional: true },
      { id: asId<EdgeId>('E_w2_p4'), from: w2, to: p4, bidirectional: true },
    ],
  });
};

export const yardSwitchPositions = (): ReadonlyMap<SwitchId, import('@/types/primitives').SwitchPosition> =>
  new Map<SwitchId, import('@/types/primitives').SwitchPosition>([
    [asId<SwitchId>('W1'), 'normal'],
    [asId<SwitchId>('W2'), 'normal'],
  ]);

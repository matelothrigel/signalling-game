/**
 * Fixture: double-track with a single crossover switch.
 *
 *         WB1              WB2
 *   A1 ────── B1 ─ WX ─ B2 ────── C1
 *                                 │
 *   A2 ────── B3 ─ WX ─ B4 ────── C2
 *         WB3              WB4
 *
 * Two parallel main lines (top: A1→C1, bottom: A2→C2) with a
 * crossover switch `WX` at the midpoint. WX in `normal` keeps
 * the two lines separate; WX in `reverse` connects the top
 * line at B1 to the bottom line at B3 (and vice versa).
 *
 * Used to verify that double-track layouts and crossovers are
 * modelled correctly.
 */

import { asId, type NodeId, type EdgeId, type SwitchId } from '@/types/ids';
import { Topology } from '../Topology';

export const buildDoubleTrackTopology = (): Topology => {
  const a1 = asId<NodeId>('A1');
  const b1 = asId<NodeId>('B1');
  const wx = asId<NodeId>('WX');
  const b2 = asId<NodeId>('B2');
  const c1 = asId<NodeId>('C1');
  const a2 = asId<NodeId>('A2');
  const b3 = asId<NodeId>('B3');
  const b4 = asId<NodeId>('B4');
  const c2 = asId<NodeId>('C2');

  return new Topology({
    nodes: [
      { kind: 'section', id: a1, label: 'A1' },
      { kind: 'section', id: b1, label: 'B1' },
      {
        kind: 'switch',
        id: wx,
        legs: [b1, b2, b3],
        label: 'WX (crossover)',
        legMap: {
          // In normal, top line goes straight: B1 ↔ B2.
          normal: [
            { from: b1, to: b2 },
            { from: b2, to: b1 },
          ],
          // In reverse, top line at B1 connects to bottom line at B3.
          reverse: [
            { from: b1, to: b3 },
            { from: b3, to: b1 },
          ],
        },
      },
      { kind: 'section', id: b2, label: 'B2' },
      { kind: 'section', id: c1, label: 'C1' },
      { kind: 'section', id: a2, label: 'A2' },
      { kind: 'section', id: b3, label: 'B3' },
      { kind: 'section', id: b4, label: 'B4' },
      { kind: 'section', id: c2, label: 'C2' },
    ],
    edges: [
      { id: asId<EdgeId>('E_A1_B1'), from: a1, to: b1, bidirectional: true },
      { id: asId<EdgeId>('E_B1_WX'), from: b1, to: wx, bidirectional: true },
      { id: asId<EdgeId>('E_WX_B2'), from: wx, to: b2, bidirectional: true },
      { id: asId<EdgeId>('E_B2_C1'), from: b2, to: c1, bidirectional: true },
      { id: asId<EdgeId>('E_A2_B3'), from: a2, to: b3, bidirectional: true },
      { id: asId<EdgeId>('E_B3_WX'), from: b3, to: wx, bidirectional: true },
      { id: asId<EdgeId>('E_WX_B4'), from: wx, to: b4, bidirectional: true },
      { id: asId<EdgeId>('E_B4_C2'), from: b4, to: c2, bidirectional: true },
    ],
  });
};

export const doubleTrackSwitchPositions = (): ReadonlyMap<SwitchId, import('@/types/primitives').SwitchPosition> =>
  new Map<SwitchId, import('@/types/primitives').SwitchPosition>([
    // Normal: top and bottom lines are independent.
    [asId<SwitchId>('WX'), 'normal'],
  ]);

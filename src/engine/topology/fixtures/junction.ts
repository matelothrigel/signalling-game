/**
 * Fixture: Y-junction with a single 3-way switch.
 *
 *          ┌─ E_B ─ B
 *   A ─ W1 ─┤
 *          └─ E_C ─ C
 *
 * `W1` is a 3-way switch. In `normal`, A connects to B; in
 * `reverse`, A connects to C. Used to verify that the pathfinder
 * honours switch position.
 */

import { asId, type NodeId, type EdgeId, type SwitchId } from '@/types/ids';
import { Topology } from '../Topology';

export const buildJunctionTopology = (): Topology => {
  const a = asId<NodeId>('A');
  const w1 = asId<NodeId>('W1');
  const b = asId<NodeId>('B');
  const c = asId<NodeId>('C');

  return new Topology({
    nodes: [
      { kind: 'section', id: a, label: 'A' },
      {
        kind: 'switch',
        id: w1,
        legs: [a, b, c],
        label: 'W1',
        legMap: {
          normal: [
            { from: a, to: b },
            { from: b, to: a },
          ],
          reverse: [
            { from: a, to: c },
            { from: c, to: a },
          ],
        },
      },
      { kind: 'section', id: b, label: 'B' },
      { kind: 'section', id: c, label: 'C' },
    ],
    edges: [
      { id: asId<EdgeId>('E_A_W1'), from: a, to: w1, bidirectional: true },
      { id: asId<EdgeId>('E_W1_B'), from: w1, to: b, bidirectional: true },
      { id: asId<EdgeId>('E_W1_C'), from: w1, to: c, bidirectional: true },
    ],
  });
};

/** Default switch positions for tests: W1 in `normal` (A→B). */
export const junctionSwitchPositions = (): ReadonlyMap<SwitchId, import('@/types/primitives').SwitchPosition> =>
  new Map<SwitchId, import('@/types/primitives').SwitchPosition>([
    [asId<SwitchId>('W1'), 'normal'],
  ]);

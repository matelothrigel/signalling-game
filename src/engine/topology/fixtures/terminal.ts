/**
 * Fixture: terminal stub with two dead-end platforms.
 *
 *   Main ─ E1 ─ Lead ─ W1 ─ P1 (dead end)
 *                   │
 *                   └ W1 ─ P2 (dead end)
 *
 * `W1` is a 3-way switch. In `normal`, the lead connects to `P1`;
 * in `reverse`, it connects to `P2`. Both platforms are dead ends
 * (no outgoing edges).
 */

import { asId, type NodeId, type EdgeId, type SwitchId } from '@/types/ids';
import { Topology } from '../Topology';

export const buildTerminalTopology = (): Topology => {
  const main = asId<NodeId>('MAIN');
  const lead = asId<NodeId>('LEAD');
  const w1 = asId<NodeId>('W1');
  const p1 = asId<NodeId>('P1');
  const p2 = asId<NodeId>('P2');

  return new Topology({
    nodes: [
      { kind: 'section', id: main, label: 'Main' },
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
      { kind: 'section', id: p1, label: 'Platform 1' },
      { kind: 'section', id: p2, label: 'Platform 2' },
    ],
    edges: [
      { id: asId<EdgeId>('E_main_lead'), from: main, to: lead, bidirectional: true },
      { id: asId<EdgeId>('E_lead_w1'), from: lead, to: w1, bidirectional: true },
      { id: asId<EdgeId>('E_w1_p1'), from: w1, to: p1, bidirectional: true },
      { id: asId<EdgeId>('E_w1_p2'), from: w1, to: p2, bidirectional: true },
    ],
  });
};

/** Default switch positions for tests: W1 in `normal` (lead→P1). */
export const terminalSwitchPositions = (): ReadonlyMap<SwitchId, import('@/types/primitives').SwitchPosition> =>
  new Map<SwitchId, import('@/types/primitives').SwitchPosition>([
    [asId<SwitchId>('W1'), 'normal'],
  ]);

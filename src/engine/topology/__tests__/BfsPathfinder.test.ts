import { describe, it, expect } from 'vitest';
import { BfsPathfinder, isEdgeActive, traversalTarget } from '../BfsPathfinder';
import { asId, type NodeId, type EdgeId, type SwitchId } from '@/types/ids';
import { buildLinearTopology } from '../fixtures/linear';
import { buildTerminalTopology, terminalSwitchPositions } from '../fixtures/terminal';
import { buildJunctionTopology, junctionSwitchPositions } from '../fixtures/junction';
import { buildYardTopology, yardSwitchPositions } from '../fixtures/yard';
import { buildDoubleTrackTopology, doubleTrackSwitchPositions } from '../fixtures/doubleTrack';

const ctx = (topology: import('../Topology').Topology, switchPositions: ReadonlyMap<SwitchId, import('@/types/primitives').SwitchPosition>) => ({
  topology,
  switchPositions,
});

describe('traversalTarget (helper)', () => {
  const edge = {
    id: asId<EdgeId>('E1'),
    from: asId<NodeId>('A'),
    to: asId<NodeId>('B'),
    bidirectional: false,
  } as const;

  it('returns the to-node when called from the from-node', () => {
    expect(traversalTarget(asId<NodeId>('A'), edge)).toBe('B');
  });

  it('returns null when called from the to-node of a one-way edge', () => {
    expect(traversalTarget(asId<NodeId>('B'), edge)).toBeNull();
  });

  it('returns the from-node when called from the to-node of a bidirectional edge', () => {
    const bidir = { ...edge, bidirectional: true } as const;
    expect(traversalTarget(asId<NodeId>('B'), bidir)).toBe('A');
  });
});

describe('BfsPathfinder — linear', () => {
  it('finds the only path A → D', () => {
    const t = buildLinearTopology();
    const r = new BfsPathfinder().findPath(asId<NodeId>('SEC_A'), asId<NodeId>('SEC_D'), ctx(t, new Map()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.nodeIds).toEqual([
        asId<NodeId>('SEC_A'),
        asId<NodeId>('SEC_B'),
        asId<NodeId>('SEC_C'),
        asId<NodeId>('SEC_D'),
      ]);
      expect(r.value.edgeIds).toHaveLength(3);
    }
  });

  it('returns a trivial path when from === to', () => {
    const t = buildLinearTopology();
    const r = new BfsPathfinder().findPath(asId<NodeId>('SEC_B'), asId<NodeId>('SEC_B'), ctx(t, new Map()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.nodeIds).toEqual([asId<NodeId>('SEC_B')]);
      expect(r.value.edgeIds).toEqual([]);
    }
  });

  it('reports UNKNOWN_NODE for a missing origin', () => {
    const t = buildLinearTopology();
    const r = new BfsPathfinder().findPath(asId<NodeId>('Z'), asId<NodeId>('SEC_A'), ctx(t, new Map()));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('UNKNOWN_NODE');
    }
  });
});

describe('BfsPathfinder — junction (switch position matters)', () => {
  it('A → B when W1 is normal', () => {
    const t = buildJunctionTopology();
    const positions = junctionSwitchPositions(); // normal
    const r = new BfsPathfinder().findPath(asId<NodeId>('A'), asId<NodeId>('B'), ctx(t, positions));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.nodeIds).toContain(asId<NodeId>('B'));
      expect(r.value.nodeIds).not.toContain(asId<NodeId>('C'));
    }
  });

  it('A → C when W1 is reverse', () => {
    const t = buildJunctionTopology();
    const positions = new Map<SwitchId, import('@/types/primitives').SwitchPosition>([
      [asId<SwitchId>('W1'), 'reverse'],
    ]);
    const r = new BfsPathfinder().findPath(asId<NodeId>('A'), asId<NodeId>('C'), ctx(t, positions));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.nodeIds).toContain(asId<NodeId>('C'));
      expect(r.value.nodeIds).not.toContain(asId<NodeId>('B'));
    }
  });

  it('A → B fails when W1 is in reverse (edge W1-B is inactive)', () => {
    const t = buildJunctionTopology();
    const positions = new Map<SwitchId, import('@/types/primitives').SwitchPosition>([
      [asId<SwitchId>('W1'), 'reverse'],
    ]);
    const r = new BfsPathfinder().findPath(asId<NodeId>('A'), asId<NodeId>('B'), ctx(t, positions));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('NO_PATH');
    }
  });

  it('rejects when the only switch has no declared position', () => {
    const t = buildJunctionTopology();
    const r = new BfsPathfinder().findPath(asId<NodeId>('A'), asId<NodeId>('B'), ctx(t, new Map()));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('NO_PATH');
    }
  });
});

describe('BfsPathfinder — terminal stub', () => {
  it('reaches P1 via the lead with W1 normal', () => {
    const t = buildTerminalTopology();
    const r = new BfsPathfinder().findPath(asId<NodeId>('MAIN'), asId<NodeId>('P1'), ctx(t, terminalSwitchPositions()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.nodeIds).toContain(asId<NodeId>('P1'));
    }
  });

  it('reaches P2 when W1 is reverse', () => {
    const t = buildTerminalTopology();
    const positions = new Map<SwitchId, import('@/types/primitives').SwitchPosition>([
      [asId<SwitchId>('W1'), 'reverse'],
    ]);
    const r = new BfsPathfinder().findPath(asId<NodeId>('MAIN'), asId<NodeId>('P2'), ctx(t, positions));
    expect(r.ok).toBe(true);
  });

  it('cannot reach P2 when W1 is normal', () => {
    const t = buildTerminalTopology();
    const r = new BfsPathfinder().findPath(asId<NodeId>('MAIN'), asId<NodeId>('P2'), ctx(t, terminalSwitchPositions()));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('NO_PATH');
    }
  });
});

describe('BfsPathfinder — yard (parallel platforms)', () => {
  it('reaches each platform from the lead with the right switch positions', () => {
    const t = buildYardTopology();
    // W1 normal → P1, reverse → P2; W2 normal → P3, reverse → P4
    const cases: ReadonlyArray<{
      target: 'P1' | 'P2' | 'P3' | 'P4';
      w1: import('@/types/primitives').SwitchPosition;
      w2: import('@/types/primitives').SwitchPosition;
    }> = [
      { target: 'P1', w1: 'normal', w2: 'normal' },
      { target: 'P2', w1: 'reverse', w2: 'normal' },
      { target: 'P3', w1: 'normal', w2: 'normal' },
      { target: 'P4', w1: 'normal', w2: 'reverse' },
    ];
    for (const c of cases) {
      const positions = new Map<SwitchId, import('@/types/primitives').SwitchPosition>([
        [asId<SwitchId>('W1'), c.w1],
        [asId<SwitchId>('W2'), c.w2],
      ]);
      const r = new BfsPathfinder().findPath(
        asId<NodeId>('LEAD'),
        asId<NodeId>(c.target),
        ctx(t, positions),
      );
      expect(r.ok, `LEAD → ${c.target} with W1=${c.w1}, W2=${c.w2}`).toBe(true);
      if (r.ok) {
        expect(r.value.nodeIds).toContain(asId<NodeId>(c.target));
      }
    }
  });

  it('fails to reach P2 when W1 is normal', () => {
    const t = buildYardTopology();
    const r = new BfsPathfinder().findPath(
      asId<NodeId>('LEAD'),
      asId<NodeId>('P2'),
      ctx(t, yardSwitchPositions()),
    );
    expect(r.ok).toBe(false);
  });
});

describe('BfsPathfinder — double-track with crossover', () => {
  it('top line A1 → C1 with WX normal', () => {
    const t = buildDoubleTrackTopology();
    const r = new BfsPathfinder().findPath(
      asId<NodeId>('A1'),
      asId<NodeId>('C1'),
      ctx(t, doubleTrackSwitchPositions()),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.nodeIds).toEqual([
        asId<NodeId>('A1'),
        asId<NodeId>('B1'),
        asId<NodeId>('WX'),
        asId<NodeId>('B2'),
        asId<NodeId>('C1'),
      ]);
    }
  });

  it('crossover: A1 → B3 (top to bottom) with WX reverse', () => {
    // Note: with a single-switch WX, the crossover routes A1 to
    // B3 but does not connect B3 onward to C2. A full crossover
    // would need two switches (one at each end of the diamond);
    // for milestone 1 the single-switch model is sufficient to
    // verify the pathfinder honours switch positions.
    const t = buildDoubleTrackTopology();
    const positions = new Map<SwitchId, import('@/types/primitives').SwitchPosition>([
      [asId<SwitchId>('WX'), 'reverse'],
    ]);
    const r = new BfsPathfinder().findPath(
      asId<NodeId>('A1'),
      asId<NodeId>('B3'),
      ctx(t, positions),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.nodeIds).toEqual([
        asId<NodeId>('A1'),
        asId<NodeId>('B1'),
        asId<NodeId>('WX'),
        asId<NodeId>('B3'),
      ]);
    }
  });

  it('A1 → C2 fails with WX normal (no crossover route)', () => {
    const t = buildDoubleTrackTopology();
    const r = new BfsPathfinder().findPath(
      asId<NodeId>('A1'),
      asId<NodeId>('C2'),
      ctx(t, doubleTrackSwitchPositions()),
    );
    expect(r.ok).toBe(false);
  });

  it('A1 → B3 fails with WX normal (WX only connects to B2 at normal)', () => {
    const t = buildDoubleTrackTopology();
    const r = new BfsPathfinder().findPath(
      asId<NodeId>('A1'),
      asId<NodeId>('B3'),
      ctx(t, doubleTrackSwitchPositions()),
    );
    expect(r.ok).toBe(false);
  });
});

describe('BfsPathfinder — optional context fields', () => {
  it('honours blockedNodes', () => {
    const t = buildLinearTopology();
    const r = new BfsPathfinder().findPath(
      asId<NodeId>('SEC_A'),
      asId<NodeId>('SEC_D'),
      {
        topology: t,
        switchPositions: new Map(),
        blockedNodes: new Set([asId<NodeId>('SEC_B'), asId<NodeId>('SEC_C')]),
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('NO_PATH');
    }
  });

  it('honours blockedEdges', () => {
    const t = buildLinearTopology();
    const r = new BfsPathfinder().findPath(
      asId<NodeId>('SEC_A'),
      asId<NodeId>('SEC_D'),
      {
        topology: t,
        switchPositions: new Map(),
        blockedEdges: new Set([asId<EdgeId>('E_BC')]),
      },
    );
    expect(r.ok).toBe(false);
  });

  it('returns BLOCKED when both endpoints are blocked', () => {
    const t = buildLinearTopology();
    const r = new BfsPathfinder().findPath(
      asId<NodeId>('SEC_A'),
      asId<NodeId>('SEC_B'),
      {
        topology: t,
        switchPositions: new Map(),
        blockedNodes: new Set([asId<NodeId>('SEC_A'), asId<NodeId>('SEC_B')]),
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('BLOCKED');
    }
  });
});

describe('isEdgeActive (helper)', () => {
  it('is a smoke check — actual switch-aware traversal is in the BFS', () => {
    const t = buildLinearTopology();
    const e = t.getEdge(asId<EdgeId>('E_AB'))!;
    // The helper is a graph-existence check; the BFS does the
    // switch-aware check internally. So this returns true for
    // any edge that exists in the topology.
    expect(isEdgeActive(t, e, new Map())).toBe(true);
  });
});

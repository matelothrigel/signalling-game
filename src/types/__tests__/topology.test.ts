import { describe, it, expect } from 'vitest';
import {
  isSectionNode,
  isSwitchNode,
  type SectionNode,
  type SwitchNode,
} from '../topology';
import { asId, type NodeId, type EdgeId, type SwitchId, type SignalId } from '../ids';

const A = asId<NodeId>('A');
const B = asId<NodeId>('B');
const C = asId<NodeId>('C');
const E1 = asId<EdgeId>('E1');
const SW1 = asId<SwitchId>('SW1');
const SG1 = asId<SignalId>('SG1');

describe('isSectionNode / isSwitchNode', () => {
  it('isSectionNode discriminates correctly', () => {
    const s: SectionNode = { kind: 'section', id: A };
    expect(isSectionNode(s)).toBe(true);
    expect(isSwitchNode(s)).toBe(false);
  });

  it('isSwitchNode discriminates correctly', () => {
    const w: SwitchNode = {
      kind: 'switch',
      id: asId<NodeId>('W1'),
      legs: [A, B],
      legMap: {
        normal: [
          { from: A, to: B },
          { from: B, to: A },
        ],
        reverse: [
          { from: A, to: B },
          { from: B, to: A },
        ],
      },
    };
    expect(isSwitchNode(w)).toBe(true);
    expect(isSectionNode(w)).toBe(false);
  });
});

describe('SwitchNode.legMap', () => {
  it('supports 2-leg switches', () => {
    const w: SwitchNode = {
      kind: 'switch',
      id: asId<NodeId>('W1'),
      legs: [A, B],
      legMap: {
        normal: [
          { from: A, to: B },
          { from: B, to: A },
        ],
        reverse: [
          { from: A, to: B },
          { from: B, to: A },
        ],
      },
    };
    expect(w.legs).toHaveLength(2);
    expect(w.legMap.normal).toHaveLength(2);
  });

  it('supports 3-leg switches with different position connectivity', () => {
    const w: SwitchNode = {
      kind: 'switch',
      id: asId<NodeId>('W1'),
      legs: [A, B, C],
      legMap: {
        normal: [
          { from: A, to: B },
          { from: B, to: A },
        ],
        reverse: [
          { from: A, to: C },
          { from: C, to: A },
        ],
      },
    };
    expect(w.legMap.normal.every((c) => c.to !== C && c.from !== C)).toBe(true);
    expect(w.legMap.reverse.every((c) => c.to !== B && c.from !== B)).toBe(true);
  });
});

describe('Edge', () => {
  it('holds an optional signal and bidirectionality flag', () => {
    const e = {
      id: E1,
      from: A,
      to: B,
      signalId: SG1,
      bidirectional: true,
    } as const;
    expect(e.signalId).toBe(SG1);
    expect(e.bidirectional).toBe(true);
  });

  it('does not include a `requires` field — activity is derived', () => {
    // The Topology derives activity from SwitchNode.legMap; edges do
    // not redundantly encode gating. This test guards against
    // re-introducing the redundant field at the type level.
    type EdgeKeys = keyof import('../topology').Edge;
    type _AssertNoRequires = 'requires' extends EdgeKeys ? true : false;
    // If `requires` is ever added to Edge, _AssertNoRequires becomes
    // `true` and the assignment below fails to compile.
    const noRequires: _AssertNoRequires = false;
    expect(noRequires).toBe(false);
  });

  it('referenced types are usable in a real graph', () => {
    // Smoke test: ids are assignable to the right branded slots.
    const sid: SignalId = SG1;
    const swid: SwitchId = SW1;
    expect(typeof sid).toBe('string');
    expect(typeof swid).toBe('string');
  });
});

describe('topology types — metadata', () => {
  it('SectionNode carries optional metadata', () => {
    const n: SectionNode = {
      kind: 'section',
      id: A,
      metadata: { lineSpeed: 120, electrified: true },
    };
    expect(n.metadata).toEqual({ lineSpeed: 120, electrified: true });
  });

  it('SwitchNode carries optional metadata', () => {
    const w: SwitchNode = {
      kind: 'switch',
      id: asId<NodeId>('W1'),
      legs: [A, B],
      legMap: {
        normal: [
          { from: A, to: B },
          { from: B, to: A },
        ],
        reverse: [
          { from: A, to: B },
          { from: B, to: A },
        ],
      },
      metadata: { maintenance: { last: '2025-01-01' } },
    };
    expect(w.metadata).toEqual({ maintenance: { last: '2025-01-01' } });
  });

  it('Edge carries optional metadata', () => {
    const e: import('../topology').Edge = {
      id: asId<EdgeId>('E1'),
      from: A,
      to: B,
      bidirectional: true,
      metadata: { trackCircuit: 'TC-12', axleCounter: true },
    };
    expect(e.metadata).toEqual({ trackCircuit: 'TC-12', axleCounter: true });
  });

  it('metadata is optional — nodes/edges without it compile', () => {
    const n: SectionNode = { kind: 'section', id: A };
    const w: SwitchNode = {
      kind: 'switch',
      id: asId<NodeId>('W1'),
      legs: [A, B],
      legMap: {
        normal: [{ from: A, to: B }],
        reverse: [{ from: A, to: B }],
      },
    };
    const e: import('../topology').Edge = {
      id: asId<EdgeId>('E1'),
      from: A,
      to: B,
      bidirectional: true,
    };
    expect(n.metadata).toBeUndefined();
    expect(w.metadata).toBeUndefined();
    expect(e.metadata).toBeUndefined();
  });
});

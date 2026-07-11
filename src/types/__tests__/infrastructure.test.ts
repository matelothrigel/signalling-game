import { describe, it, expect } from 'vitest';
import { asId, type NodeId, type EdgeId, type SwitchId, type SignalId, type PlatformId, type RouteId } from '../ids';
import type { Signal, Platform, SwitchState, SectionState, SignalState } from '../infrastructure';

const n = (s: string) => asId<NodeId>(s);
const e = (s: string) => asId<EdgeId>(s);
const sw = (s: string) => asId<SwitchId>(s);
const sg = (s: string) => asId<SignalId>(s);
const pl = (s: string) => asId<PlatformId>(s);
const rt = (s: string) => asId<RouteId>(s);

describe('Signal', () => {
  it('is a frozen-shape description attached to an edge', () => {
    const s: Signal = {
      id: sg('S1'),
      edgeId: e('E1'),
      automatic: true,
      label: 'Entry A',
    };
    expect(s.edgeId).toBe('E1');
    expect(s.automatic).toBe(true);
  });
});

describe('Platform', () => {
  it('spans one or more sections by NodeId', () => {
    const p: Platform = {
      id: pl('P1'),
      name: 'Platform 2',
      sectionIds: [n('T1'), n('T2')],
    };
    expect(p.sectionIds).toHaveLength(2);
  });
});

describe('SwitchState', () => {
  it('carries position, lifecycle, lockedBy, occupiedBy', () => {
    const s: SwitchState = {
      id: sw('W1'),
      position: 'normal',
      lifecycle: 'free',
      lockedBy: null,
      occupiedBy: null,
    };
    expect(s.lifecycle).toBe('free');
    expect(s.lockedBy).toBeNull();
    expect(s.position).toBe('normal');
  });

  it('a locked switch has lockedBy set', () => {
    const s: SwitchState = {
      id: sw('W1'),
      position: 'reverse',
      lifecycle: 'locked',
      lockedBy: rt('R1'),
      occupiedBy: null,
    };
    expect(s.lockedBy).toBe(rt('R1'));
    expect(s.lifecycle).toBe('locked');
  });
});

describe('SectionState', () => {
  it('carries occupancy and reservation', () => {
    const s: SectionState = {
      id: n('T1'),
      occupiedBy: null,
      reservedBy: rt('R1'),
    };
    expect(s.reservedBy).toBe('R1');
    expect(s.occupiedBy).toBeNull();
  });
});

describe('SignalState', () => {
  it('carries aspect, controlledBy, lastChangeReason, lastChangeAtSimTime', () => {
    const s: SignalState = {
      id: sg('S1'),
      aspect: 'proceed',
      controlledBy: null,
      lastChangeReason: { kind: 'INITIAL' },
      lastChangeAtSimTime: 0,
    };
    expect(s.aspect).toBe('proceed');
    expect(s.controlledBy).toBeNull();
    expect(s.lastChangeReason.kind).toBe('INITIAL');
  });
});

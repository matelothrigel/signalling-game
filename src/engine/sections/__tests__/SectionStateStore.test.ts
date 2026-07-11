import { describe, it, expect } from 'vitest';
import { SectionStateStore } from '../SectionStateStore';
import { SectionReasonCode, sectionError, sectionReasonMessage } from '../SectionReasonCode';
import { asId, type NodeId, type RouteId, type TrainId } from '@/types/ids';

const s1 = (): NodeId => asId<NodeId>('T1');
const s2 = (): NodeId => asId<NodeId>('T2');
const r1 = (): RouteId => asId<RouteId>('R1');
const t1 = (): TrainId => asId<TrainId>('IC101');

const make = (): SectionStateStore =>
  new SectionStateStore({ sectionIds: [s1(), s2()] });

describe('SectionStateStore — construction', () => {
  it('creates an entry per section, initially free', () => {
    const s = make();
    expect(s.size()).toBe(2);
    expect(s.get(s1())?.occupiedBy).toBeNull();
    expect(s.get(s1())?.reservedBy).toBeNull();
  });
});

describe('SectionStateStore — setOccupied', () => {
  it('marks a section as occupied by a train', () => {
    const s = make();
    const r = s.setOccupied(s1(), t1());
    expect(r.ok).toBe(true);
    expect(s.get(s1())?.occupiedBy).toBe(t1());
  });

  it('clears the occupancy when set to null', () => {
    const s = make();
    s.setOccupied(s1(), t1());
    s.setOccupied(s1(), null);
    expect(s.get(s1())?.occupiedBy).toBeNull();
  });

  it('rejects unknown section with SECTION_UNKNOWN', () => {
    const s = make();
    const r = s.setOccupied(asId<NodeId>('NOPE'), t1());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SectionReasonCode.UNKNOWN);
    }
  });
});

describe('SectionStateStore — setReserved', () => {
  it('marks a section as reserved by a route', () => {
    const s = make();
    const r = s.setReserved(s1(), r1());
    expect(r.ok).toBe(true);
    expect(s.get(s1())?.reservedBy).toBe(r1());
  });

  it('clears the reservation when set to null', () => {
    const s = make();
    s.setReserved(s1(), r1());
    s.setReserved(s1(), null);
    expect(s.get(s1())?.reservedBy).toBeNull();
  });
});

describe('SectionStateStore — independence of occupancy and reservation', () => {
  it('can be occupied by a train AND reserved by a route (rare but possible)', () => {
    const s = make();
    s.setReserved(s1(), r1());
    s.setOccupied(s1(), t1());
    expect(s.get(s1())?.reservedBy).toBe(r1());
    expect(s.get(s1())?.occupiedBy).toBe(t1());
  });
});

describe('SectionStateStore — serialization', () => {
  it('serialize / load round-trip preserves state', () => {
    const a = make();
    a.setOccupied(s1(), t1());
    a.setReserved(s2(), r1());
    const snap = a.serialize();
    const b = make();
    const r = b.load(snap);
    expect(r.ok).toBe(true);
    expect(b.get(s1())?.occupiedBy).toBe(t1());
    expect(b.get(s2())?.reservedBy).toBe(r1());
  });
});

describe('sectionReasonMessage + sectionError', () => {
  it('produces a human-readable message for the code', () => {
    expect(sectionReasonMessage(SectionReasonCode.UNKNOWN, { sectionId: 'T1' })).toMatch(/T1/);
  });

  it('builds an EngineError with the right code and context', () => {
    const e = sectionError(SectionReasonCode.UNKNOWN, { sectionId: 'T1' });
    expect(e.code).toBe('SECTION_UNKNOWN');
    expect(e.message).toMatch(/T1/);
    expect(e.context).toEqual({ sectionId: 'T1' });
  });
});

import { describe, it, expect } from 'vitest';
import { SwitchStateStore, isLocked, isOccupied } from '../SwitchStateStore';
import { SwitchReasonCode, switchError, switchReasonMessage } from '../SwitchReasonCode';
import { asId, type SwitchId, type RouteId, type TrainId } from '@/types/ids';

const sw1 = (): SwitchId => asId<SwitchId>('SW1');
const sw2 = (): SwitchId => asId<SwitchId>('SW2');
const r1 = (): RouteId => asId<RouteId>('R1');
const r2 = (): RouteId => asId<RouteId>('R2');
const t1 = (): TrainId => asId<TrainId>('IC101');

const make = (): SwitchStateStore =>
  new SwitchStateStore({ switchIds: [sw1(), sw2()] });

describe('SwitchStateStore — construction', () => {
  it('creates an entry per switch id, defaulting position to normal', () => {
    const s = make();
    expect(s.size()).toBe(2);
    expect(s.get(sw1())?.position).toBe('normal');
    expect(s.get(sw2())?.position).toBe('normal');
  });

  it('honours initial positions', () => {
    const s = new SwitchStateStore({
      switchIds: [sw1()],
      initialPositions: new Map([[sw1(), 'reverse']]),
    });
    expect(s.get(sw1())?.position).toBe('reverse');
  });

  it('starts every switch in the free lifecycle with no holders', () => {
    const s = make();
    expect(s.get(sw1())).toEqual({
      id: sw1(),
      position: 'normal',
      lifecycle: 'free',
      lockedBy: null,
      occupiedBy: null,
    });
  });
});

describe('SwitchStateStore — changePosition (transition model)', () => {
  it('moves a free switch and produces a transition record', () => {
    const s = make();
    const r = s.changePosition(sw1(), 'reverse');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.from.position).toBe('normal');
      expect(r.value.to.position).toBe('reverse');
      expect(r.value.from.lifecycle).toBe('free');
      expect(r.value.to.lifecycle).toBe('free');
      expect(r.value.reason).toBe('PLAYER_COMMAND');
    }
    expect(s.get(sw1())?.position).toBe('reverse');
  });

  it('a no-op (already in position) still produces a transition with the same from/to', () => {
    const s = make();
    const r = s.changePosition(sw1(), 'normal');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.from.position).toBe(r.value.to.position);
    }
  });

  it('rejects with SWITCH_LOCKED when the switch is locked', () => {
    const s = make();
    s.reserve(sw1(), r1());
    s.lock(sw1(), r1());
    const r = s.changePosition(sw1(), 'reverse');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SwitchReasonCode.LOCKED);
    }
    // Position must not have changed.
    expect(s.get(sw1())?.position).toBe('normal');
  });

  it('rejects with SWITCH_OCCUPIED when the switch is occupied', () => {
    const s = make();
    s.occupy(sw1(), t1());
    const r = s.changePosition(sw1(), 'reverse');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SwitchReasonCode.OCCUPIED);
    }
  });

  it('rejects with SWITCH_UNKNOWN for an unknown switch', () => {
    const s = make();
    const r = s.changePosition(asId<SwitchId>('NOPE'), 'reverse');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SwitchReasonCode.UNKNOWN);
    }
  });

  it('allows position change on a reserved switch (reserve does not lock position)', () => {
    const s = make();
    s.reserve(sw1(), r1());
    const r = s.changePosition(sw1(), 'reverse');
    expect(r.ok).toBe(true);
    expect(s.get(sw1())?.position).toBe('reverse');
    expect(s.get(sw1())?.lifecycle).toBe('reserved');
  });
});

describe('SwitchStateStore — reserve / lock / release', () => {
  it('reserve moves a free switch to reserved and sets lockedBy', () => {
    const s = make();
    const r = s.reserve(sw1(), r1());
    expect(r.ok).toBe(true);
    expect(s.get(sw1())?.lifecycle).toBe('reserved');
    expect(s.get(sw1())?.lockedBy).toBe(r1());
  });

  it('reserve rejects on a non-free switch with ALREADY_RESERVED', () => {
    const s = make();
    s.reserve(sw1(), r1());
    const r = s.reserve(sw1(), r2());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SwitchReasonCode.ALREADY_RESERVED);
    }
  });

  it('lock promotes reserved to locked', () => {
    const s = make();
    s.reserve(sw1(), r1());
    const r = s.lock(sw1(), r1());
    expect(r.ok).toBe(true);
    expect(s.get(sw1())?.lifecycle).toBe('locked');
  });

  it('lock rejects on a free switch with NOT_RESERVED', () => {
    const s = make();
    const r = s.lock(sw1(), r1());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SwitchReasonCode.NOT_RESERVED);
    }
  });

  it('lock rejects when reserved by a different route (RESERVED_BY_ANOTHER)', () => {
    const s = make();
    s.reserve(sw1(), r1());
    const r = s.lock(sw1(), r2());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SwitchReasonCode.RESERVED_BY_ANOTHER);
    }
  });

  it('release frees a reserved switch and clears lockedBy', () => {
    const s = make();
    s.reserve(sw1(), r1());
    const r = s.release(sw1(), r1());
    expect(r.ok).toBe(true);
    expect(s.get(sw1())?.lifecycle).toBe('free');
    expect(s.get(sw1())?.lockedBy).toBeNull();
  });

  it('release frees a locked switch', () => {
    const s = make();
    s.reserve(sw1(), r1());
    s.lock(sw1(), r1());
    const r = s.release(sw1(), r1());
    expect(r.ok).toBe(true);
    expect(s.get(sw1())?.lifecycle).toBe('free');
  });

  it('release rejects on a non-held switch with NOT_HELD', () => {
    const s = make();
    const r = s.release(sw1(), r1());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SwitchReasonCode.NOT_HELD);
    }
  });

  it('release rejects when held by a different route (HELD_BY_ANOTHER)', () => {
    const s = make();
    s.reserve(sw1(), r1());
    const r = s.release(sw1(), r2());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SwitchReasonCode.HELD_BY_ANOTHER);
    }
  });
});

describe('SwitchStateStore — occupy / vacate', () => {
  it('occupy moves a free switch to occupied and sets occupiedBy', () => {
    const s = make();
    const r = s.occupy(sw1(), t1());
    expect(r.ok).toBe(true);
    expect(s.get(sw1())?.lifecycle).toBe('occupied');
    expect(s.get(sw1())?.occupiedBy).toBe(t1());
  });

  it('occupy rejects on a locked switch (CANNOT_OCCUPY_LOCKED)', () => {
    const s = make();
    s.reserve(sw1(), r1());
    s.lock(sw1(), r1());
    const r = s.occupy(sw1(), t1());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SwitchReasonCode.CANNOT_OCCUPY_LOCKED);
    }
  });

  it('vacate frees an occupied switch', () => {
    const s = make();
    s.occupy(sw1(), t1());
    const r = s.vacate(sw1(), t1());
    expect(r.ok).toBe(true);
    expect(s.get(sw1())?.lifecycle).toBe('free');
    expect(s.get(sw1())?.occupiedBy).toBeNull();
  });

  it('vacate rejects when occupied by a different train', () => {
    const s = make();
    s.occupy(sw1(), t1());
    const r = s.vacate(sw1(), asId<TrainId>('IC999'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SwitchReasonCode.OCCUPIED_BY_ANOTHER);
    }
  });
});

describe('SwitchStateStore — derived guards', () => {
  it('isLocked reflects the lifecycle', () => {
    const s = make();
    expect(isLocked(s.require(sw1()))).toBe(false);
    s.reserve(sw1(), r1());
    s.lock(sw1(), r1());
    expect(isLocked(s.require(sw1()))).toBe(true);
  });

  it('isOccupied reflects the lifecycle', () => {
    const s = make();
    expect(isOccupied(s.require(sw1()))).toBe(false);
    s.occupy(sw1(), t1());
    expect(isOccupied(s.require(sw1()))).toBe(true);
  });
});

describe('SwitchStateStore — serialization', () => {
  it('serialize / load round-trip preserves state', () => {
    const a = new SwitchStateStore({ switchIds: [sw1(), sw2()] });
    a.changePosition(sw1(), 'reverse');
    a.reserve(sw2(), r1());
    a.lock(sw2(), r1());

    const snap = a.serialize();
    const b = new SwitchStateStore({ switchIds: [sw1(), sw2()] });
    const r = b.load(snap);
    expect(r.ok).toBe(true);

    expect(b.get(sw1())?.position).toBe('reverse');
    expect(b.get(sw2())?.lifecycle).toBe('locked');
    expect(b.get(sw2())?.lockedBy).toBe(r1());
  });
});

describe('switchReasonMessage', () => {
  it('produces a human-readable message for a code', () => {
    expect(switchReasonMessage(SwitchReasonCode.LOCKED, { switchId: 'SW1', heldBy: 'R1' })).toMatch(
      /SW1.*locked.*R1/,
    );
  });

  it('includes a fallback for missing context', () => {
    expect(switchReasonMessage(SwitchReasonCode.OCCUPIED)).toMatch(/Switch \?/);
  });
});

describe('switchError', () => {
  it('builds an EngineError with the right code and a generated message', () => {
    const e = switchError(SwitchReasonCode.LOCKED, { switchId: 'SW1', heldBy: 'R1' });
    expect(e.code).toBe('SWITCH_LOCKED');
    expect(e.message).toMatch(/SW1/);
    expect(e.context).toEqual({ switchId: 'SW1', heldBy: 'R1' });
  });
});

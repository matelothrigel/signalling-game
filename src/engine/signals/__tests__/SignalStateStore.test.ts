import { describe, it, expect } from 'vitest';
import { SignalStateStore, SignalReasonCode, signalError, signalReasonMessage } from '..';
import { asId, type SignalId, type RouteId } from '@/types/ids';

const s1 = (): SignalId => asId<SignalId>('S1');
const s2 = (): SignalId => asId<SignalId>('S2');
const r1 = (): RouteId => asId<RouteId>('R1');

const make = (): SignalStateStore =>
  new SignalStateStore({ signalIds: [s1(), s2()] });

describe('SignalStateStore — construction', () => {
  it('creates an entry per signal, defaulting aspect to stop', () => {
    const s = make();
    expect(s.size()).toBe(2);
    expect(s.get(s1())?.aspect).toBe('stop');
    expect(s.get(s2())?.aspect).toBe('stop');
  });

  it('honours initial aspects', () => {
    const s = new SignalStateStore({
      signalIds: [s1()],
      initialAspects: new Map([[s1(), 'proceed']]),
    });
    expect(s.get(s1())?.aspect).toBe('proceed');
  });

  it('starts every signal with no controller and INITIAL reason', () => {
    const s = make();
    const state = s.get(s1());
    expect(state?.controlledBy).toBeNull();
    expect(state?.lastChangeReason.kind).toBe('INITIAL');
    expect(state?.lastChangeAtSimTime).toBe(0);
  });
});

describe('SignalStateStore — setAspect (signals are derived views)', () => {
  it('records the new aspect and returns the change record', () => {
    const s = make();
    const r = s.setAspect(s1(), 'proceed', { kind: 'ROUTE_SET', routeId: r1() }, 5);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.from).toBe('stop');
      expect(r.value.to).toBe('proceed');
      expect(r.value.changed).toBe(true);
      expect(r.value.atSimTime).toBe(5);
      expect(r.value.reason.kind).toBe('ROUTE_SET');
    }
    expect(s.get(s1())?.aspect).toBe('proceed');
  });

  it('a no-op (same aspect) still returns a change record with changed=false', () => {
    const s = make();
    const r = s.setAspect(s1(), 'stop', { kind: 'INITIAL' }, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.changed).toBe(false);
      expect(r.value.from).toBe('stop');
      expect(r.value.to).toBe('stop');
    }
  });

  it('does not change state on a no-op', () => {
    const s = make();
    s.setAspect(s1(), 'proceed', { kind: 'ROUTE_SET', routeId: r1() }, 5);
    s.setAspect(s1(), 'proceed', { kind: 'ROUTE_SET', routeId: r1() }, 6);
    expect(s.get(s1())?.lastChangeAtSimTime).toBe(5);
  });

  it('updates lastChangeReason and lastChangeAtSimTime on change', () => {
    const s = make();
    s.setAspect(s1(), 'proceed', { kind: 'ROUTE_SET', routeId: r1() }, 7);
    const state = s.get(s1());
    expect(state?.lastChangeReason).toEqual({ kind: 'ROUTE_SET', routeId: r1() });
    expect(state?.lastChangeAtSimTime).toBe(7);
  });

  it('rejects unknown signal with SIGNAL_UNKNOWN', () => {
    const s = make();
    const r = s.setAspect(asId<SignalId>('NOPE'), 'proceed', { kind: 'INITIAL' }, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SignalReasonCode.UNKNOWN);
    }
  });
});

describe('SignalStateStore — setControlledBy', () => {
  it('sets the route that controls the signal', () => {
    const s = make();
    const r = s.setControlledBy(s1(), r1());
    expect(r.ok).toBe(true);
    expect(s.get(s1())?.controlledBy).toBe(r1());
  });

  it('clears the controller when set to null', () => {
    const s = make();
    s.setControlledBy(s1(), r1());
    s.setControlledBy(s1(), null);
    expect(s.get(s1())?.controlledBy).toBeNull();
  });

  it('rejects unknown signal', () => {
    const s = make();
    const r = s.setControlledBy(asId<SignalId>('NOPE'), r1());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SignalReasonCode.UNKNOWN);
    }
  });
});

describe('SignalStateStore — derived nature (no validation logic)', () => {
  it('accepts any aspect value the caller asks for — no decision logic', () => {
    const s = make();
    // Even a "weird" reason shape is accepted as-is; the store
    // is a notepad, not a gatekeeper. The interlocking engine
    // (Section 7) is the one that decides whether the change
    // is valid in the current state.
    const r = s.setAspect(s1(), 'proceed', { kind: 'SYSTEM', note: 'manual test' }, 1);
    expect(r.ok).toBe(true);
    expect(s.get(s1())?.lastChangeReason).toEqual({ kind: 'SYSTEM', note: 'manual test' });
  });
});

describe('SignalStateStore — serialization', () => {
  it('serialize / load round-trip preserves state', () => {
    const a = new SignalStateStore({ signalIds: [s1(), s2()] });
    a.setAspect(s1(), 'proceed', { kind: 'ROUTE_SET', routeId: r1() }, 5);
    a.setControlledBy(s1(), r1());

    const snap = a.serialize();
    const b = new SignalStateStore({ signalIds: [s1(), s2()] });
    const r = b.load(snap);
    expect(r.ok).toBe(true);
    expect(b.get(s1())?.aspect).toBe('proceed');
    expect(b.get(s1())?.controlledBy).toBe(r1());
    expect(b.get(s1())?.lastChangeReason).toEqual({ kind: 'ROUTE_SET', routeId: r1() });
    expect(b.get(s1())?.lastChangeAtSimTime).toBe(5);
  });
});

describe('signalReasonMessage + signalError', () => {
  it('produces a human-readable message for a code', () => {
    expect(signalReasonMessage(SignalReasonCode.UNKNOWN, { signalId: 'S1' })).toMatch(/S1/);
  });

  it('builds an EngineError with the right code and a generated message', () => {
    const e = signalError(SignalReasonCode.UNKNOWN, { signalId: 'S1' });
    expect(e.code).toBe('SIGNAL_UNKNOWN');
    expect(e.message).toMatch(/S1/);
    expect(e.context).toEqual({ signalId: 'S1' });
  });
});

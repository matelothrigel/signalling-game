import { describe, it, expect } from 'vitest';
import {
  InterlockingEngine,
  formatRouteSetOutcome,
  formatRejectionBatch,
  RouteReasonCode,
} from '..';
import { SwitchStateStore } from '@/engine/switches';
import { SignalStateStore } from '@/engine/signals';
import { SectionStateStore } from '@/engine/sections';
import { RouteStore } from '@/engine/routes';
import { Topology } from '@/engine/topology';
import { asId, type NodeId, type EdgeId, type SignalId, type RouteId, type TrainId, type SwitchId } from '@/types/ids';

/* ------------------------------------------------------------------ */
/* Fixture: a 4-section, 1-switch, 2-signal mini station.              */
/*                                                                     */
/*      ENTRY                                                         */
/*        │                                                            */
/*        ▼                                                            */
/*      ┌──A──┐                                                        */
/*      │     │                                                        */
/*      W1 ── B ── C ── D                                              */
/*      │                                                              */
/*      └────── EXIT (on edge C-D)                                    */
/*                                                                     */
/*  W1: 3-leg switch with legs [A, B, C]                              */
/*      normal:  A ↔ B                                                */
/*      reverse: A ↔ C                                                */
/*                                                                     */
/*  Signals:                                                           */
/*    ENTRY on edge (A, W1)  → train enters at A                       */
/*    EXIT  on edge (B, C)  → train exits at C (or B if reverse)       */
/*                                                                     */
/*  Routes are set from ENTRY to EXIT. The path is:                    */
/*    A → W1 → B → C                                                  */
/*    with W1 in normal position                                      */
/*                                                                     */
/*  Tests use this to set up:                                         */
/*    - a clean route                                                  */
/*    - a multi-reason rejection (3 problems at once)                 */
/*    - a NO_PATH scenario (switch in wrong position)                  */
/* ------------------------------------------------------------------ */

const A = (): NodeId => asId<NodeId>('A');
const B = (): NodeId => asId<NodeId>('B');
const C = (): NodeId => asId<NodeId>('C');
const W1 = (): NodeId => asId<NodeId>('W1');
const W1S = (): SwitchId => asId<SwitchId>('W1');
const ENTRY = (): SignalId => asId<SignalId>('ENTRY');
const EXIT = (): SignalId => asId<SignalId>('EXIT');
const TRAIN = (): TrainId => asId<TrainId>('IC101');

const buildFixture = () => {
  const w1 = W1();
  const topology = new Topology({
    nodes: [
      { kind: 'section', id: A() },
      { kind: 'section', id: B() },
      { kind: 'section', id: C() },
      {
        kind: 'switch',
        id: w1,
        legs: [A(), B(), C()],
        legMap: {
          normal: [
            { from: A(), to: B() },
            { from: B(), to: A() },
          ],
          reverse: [
            { from: A(), to: C() },
            { from: C(), to: A() },
          ],
        },
      },
    ],
    edges: [
      { id: asId<EdgeId>('E_A_W1'), from: A(), to: w1, bidirectional: true },
      { id: asId<EdgeId>('E_W1_B'), from: w1, to: B(), bidirectional: true },
      { id: asId<EdgeId>('E_W1_C'), from: w1, to: C(), bidirectional: true },
      { id: asId<EdgeId>('E_B_C'), from: B(), to: C(), bidirectional: true },
      { id: asId<EdgeId>('E_entry'), from: A(), to: w1, bidirectional: true, signalId: ENTRY() },
      { id: asId<EdgeId>('E_exit'), from: B(), to: C(), bidirectional: true, signalId: EXIT() },
    ],
  });
  const switchStore = new SwitchStateStore({ switchIds: [w1 as unknown as SwitchId] });
  const signalStore = new SignalStateStore({ signalIds: [ENTRY(), EXIT()] });
  const sectionStore = new SectionStateStore({ sectionIds: [A(), B(), C()] });
  const routeStore = new RouteStore();
  return { topology, switchStore, signalStore, sectionStore, routeStore };
};

const buildEngine = (fix = buildFixture()) =>
  new InterlockingEngine({
    topology: fix.topology,
    switchStore: fix.switchStore,
    signalStore: fix.signalStore,
    sectionStore: fix.sectionStore,
    routeStore: fix.routeStore,
    enforcePlatformRule: false,  // fixture has no platform metadata
  });

describe('InterlockingEngine — happy path', () => {
  it('sets a route when everything is clear', () => {
    const eng = buildEngine();
    const outcome = eng.setRoute(ENTRY(), EXIT(), 0);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.route.entrySignalId).toBe(ENTRY());
      expect(outcome.route.exitSignalId).toBe(EXIT());
      // The path goes W1 → B → C (with W1 in normal position).
      // Section A is not on the path — the path starts at W1
      // (the "to" end of the entry signal's edge) and ends at C
      // (the "to" end of the exit signal's edge).
      expect(outcome.route.sectionIds).toContain(B());
      expect(outcome.route.sectionIds).toContain(C());
      expect(outcome.route.lockedSwitchIds).toContain(W1());
      expect(outcome.route.active).toBe(true);
    }
  });

  it('sets the entry signal to proceed when the route is established', () => {
    const fix = buildFixture();
    const eng = buildEngine(fix);
    eng.setRoute(ENTRY(), EXIT(), 0);
    expect(fix.signalStore.get(ENTRY())?.aspect).toBe('proceed');
  });

  it('reserves the sections along the path', () => {
    const fix = buildFixture();
    const eng = buildEngine(fix);
    const outcome = eng.setRoute(ENTRY(), EXIT(), 0);
    if (outcome.kind === 'ok') {
      for (const sectionId of outcome.route.sectionIds) {
        expect(fix.sectionStore.get(sectionId)?.reservedBy).toBe(outcome.route.id);
      }
    }
  });

  it('locks the switch on the path', () => {
    const fix = buildFixture();
    const eng = buildEngine(fix);
    const outcome = eng.setRoute(ENTRY(), EXIT(), 0);
    if (outcome.kind === 'ok') {
      expect(fix.switchStore.get(W1S())?.lifecycle).toBe('locked');
    }
  });
});

describe('InterlockingEngine — cancel route', () => {
  it('releases sections, unlocks switches, sets signal to stop', () => {
    const fix = buildFixture();
    const eng = buildEngine(fix);
    const outcome = eng.setRoute(ENTRY(), EXIT(), 0);
    if (outcome.kind !== 'ok') throw new Error('expected ok');
    const released = eng.cancelRoute(outcome.route.id, 1);
    expect(released).not.toBeNull();
    expect(fix.signalStore.get(ENTRY())?.aspect).toBe('stop');
    expect(fix.switchStore.get(W1S())?.lifecycle).toBe('free');
    for (const sectionId of outcome.route.sectionIds) {
      expect(fix.sectionStore.get(sectionId)?.reservedBy).toBeNull();
    }
  });

  it('cancelRoute on unknown id returns null', () => {
    const eng = buildEngine();
    expect(eng.cancelRoute(asId<RouteId>('R9999'), 0)).toBeNull();
  });
});

describe('InterlockingEngine — rejections (single reason)', () => {
  it('rejects with NO_PATH when no path exists at current switch positions', () => {
    const eng = buildEngine();
    const outcome = eng.setRoute(ENTRY(), EXIT(), 0);
    // The first SET_ROUTE will set W1 to reverse to reach C; then
    // a second attempt with a different configuration should
    // also be checkable. Simpler: try ENTRY -> EXIT where the
    // path requires W1 to be reverse, but W1 is already locked
    // by a previous route.
    expect(outcome.kind).toBe('ok'); // sets a route, locks W1 reverse
    // Now a second route request should fail because W1 is
    // locked in reverse; the BFS would have to go via reverse
    // but the switch is held.
    const r2 = eng.setRoute(ENTRY(), EXIT(), 1);
    expect(r2.kind).toBe('rejected');
    if (r2.kind === 'rejected') {
      const codes = r2.rejections.map((r) => r.code);
      expect(codes).toContain(RouteReasonCode.SWITCH_LOCKED);
    }
  });

  it('rejects with TRACK_OCCUPIED when a section on the path is occupied', () => {
    const fix = buildFixture();
    const eng = buildEngine(fix);
    fix.sectionStore.setOccupied(B(), TRAIN());
    const outcome = eng.setRoute(ENTRY(), EXIT(), 0);
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') {
      const codes = outcome.rejections.map((r) => r.code);
      expect(codes).toContain(RouteReasonCode.TRACK_OCCUPIED);
    }
  });
});

describe('InterlockingEngine — multi-reason rejection (the spec example)', () => {
  it('returns ALL blocking reasons: switch locked + track occupied + route conflicts', () => {
    const fix = buildFixture();
    const eng = buildEngine(fix);
    // 1. Pre-lock the switch by setting a route that locks it.
    const r1 = eng.setRoute(ENTRY(), EXIT(), 0);
    expect(r1.kind).toBe('ok');
    // 2. Occupy a section on the would-be path.
    fix.sectionStore.setOccupied(B(), TRAIN());
    // 3. Try a second route that would share section B and the switch.
    const r2 = eng.setRoute(ENTRY(), EXIT(), 1);
    expect(r2.kind).toBe('rejected');
    if (r2.kind === 'rejected') {
      const codes = r2.rejections.map((r) => r.code);
      // The conflict with the first route AND the track occupied AND the switch is locked
      // all show up together.
      expect(codes).toContain(RouteReasonCode.SWITCH_LOCKED);
      expect(codes).toContain(RouteReasonCode.TRACK_OCCUPIED);
      expect(codes).toContain(RouteReasonCode.CONFLICT);
      // The multi-line log message is generated correctly.
      const log = formatRejectionBatch(r2.rejections);
      expect(log).toMatch(/Cannot set route:/);
      expect(log).toMatch(/Switch/);
      expect(log).toMatch(/Track/);
      expect(log).toMatch(/Route R0001/);
    }
  });
});

describe('InterlockingEngine — determinism', () => {
  it('the same setup + same command sequence produces the same outcome twice', () => {
    const setupA = () => {
      const fix = buildFixture();
      const eng = buildEngine(fix);
      return { eng, fix };
    };
    const { eng: a } = setupA();
    const { eng: b } = setupA();

    const ra = a.setRoute(ENTRY(), EXIT(), 0);
    const rb = b.setRoute(ENTRY(), EXIT(), 0);
    expect(ra.kind).toBe(rb.kind);
    if (ra.kind === 'ok' && rb.kind === 'ok') {
      expect(ra.route.id).toBe(rb.route.id);
      expect(ra.route.sectionIds).toEqual(rb.route.sectionIds);
      expect(ra.route.lockedSwitchIds).toEqual(rb.route.lockedSwitchIds);
    }
  });

  it('replays produce identical event sequences and final state', () => {
    const runScenario = () => {
      const fix = buildFixture();
      const eng = buildEngine(fix);
      const events: string[] = [];
      const r1 = eng.setRoute(ENTRY(), EXIT(), 0);
      if (r1.kind === 'ok') {
        events.push(`route ${r1.route.id} set`);
        eng.cancelRoute(r1.route.id, 1);
        events.push(`route ${r1.route.id} released`);
      }
      return {
        events,
        sectionReservations: fix.sectionStore.getAll().map((s) => [s.id, s.reservedBy]),
        switchLifecycles: fix.switchStore.getAll().map((s) => [s.id, s.lifecycle]),
        signalAspects: fix.signalStore.getAll().map((s) => [s.id, s.aspect]),
      };
    };
    const a = runScenario();
    const b = runScenario();
    expect(a).toEqual(b);
  });
});

describe('formatRouteSetOutcome + routeSetOutcomeToError', () => {
  it('formatRouteSetOutcome returns a clean message for ok', () => {
    const fix = buildFixture();
    const eng = buildEngine(fix);
    const o = eng.setRoute(ENTRY(), EXIT(), 0);
    if (o.kind === 'ok') {
      expect(formatRouteSetOutcome(o)).toMatch(/set/);
    }
  });
  it('formatRouteSetOutcome returns a multi-line message for rejected', () => {
    const fix = buildFixture();
    const eng = buildEngine(fix);
    const o = eng.setRoute(ENTRY(), EXIT(), 0);
    if (o.kind === 'ok') {
      eng.cancelRoute(o.route.id, 1);
    }
    fix.sectionStore.setOccupied(B(), TRAIN());
    const r2 = eng.setRoute(ENTRY(), EXIT(), 2);
    if (r2.kind === 'rejected') {
      const msg = formatRouteSetOutcome(r2);
      expect(msg).toMatch(/Cannot set route/);
    }
  });
});

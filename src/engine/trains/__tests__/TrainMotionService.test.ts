import { describe, it, expect } from 'vitest';
import { TrainMotionService, releasePlatformStop } from '../TrainMotionService';
import { TrainStateStore } from '../TrainStateStore';
import { SwitchStateStore } from '@/engine/switches';
import { SignalStateStore } from '@/engine/signals';
import { SectionStateStore } from '@/engine/sections';
import { RouteStore } from '@/engine/routes';
import { EventBus } from '@/engine/core/EventBus';
import { Topology } from '@/engine/topology';
import { InterlockingEngine } from '@/engine/interlocking';
import {
  asId,
  type NodeId,
  type EdgeId,
  type SignalId,
  type RouteId,
  type TrainId,
  type SwitchId,
  type PlatformId,
} from '@/types/ids';
import type { TrainDefinition } from '@/types/trains';
import type { Platform } from '@/types/infrastructure';
import type { Event } from '@/types/events';

/* ------------------------------------------------------------------ */
/* Fixture: 4-section, 1-switch, 2-signal mini station                 */
/*                                                                     */
/*   A — E_A_W1 — W1 (3-leg) — E_W1_B — B — E_B_C — C                 */
/*                                                                     */
/* Signals:                                                            */
/*   ENTRY on edge (A, W1)                                             */
/*   EXIT  on edge (B, C)                                              */
/*                                                                     */
/* The route from ENTRY to EXIT (with W1 normal) is:                   */
/*   nodes: [W1, B, C]                                                 */
/*   edges: [E_W1_B, E_B_C]                                            */
/* ------------------------------------------------------------------ */

const A = (): NodeId => asId<NodeId>('A');
const B = (): NodeId => asId<NodeId>('B');
const C = (): NodeId => asId<NodeId>('C');
const W1 = (): NodeId => asId<NodeId>('W1');
const W1S = (): SwitchId => asId<SwitchId>('W1');
const ENTRY = (): SignalId => asId<SignalId>('ENTRY');
const EXIT = (): SignalId => asId<SignalId>('EXIT');
const MID = (): SignalId => asId<SignalId>('MID');
const TRAIN = (): TrainId => asId<TrainId>('IC101');
const E_ENTRY = (): EdgeId => asId<EdgeId>('E_entry');
const E_EXIT = (): EdgeId => asId<EdgeId>('E_exit');

interface Fixture {
  readonly topology: Topology;
  readonly trainStore: TrainStateStore;
  readonly switchStore: SwitchStateStore;
  readonly signalStore: SignalStateStore;
  readonly sectionStore: SectionStateStore;
  readonly routeStore: RouteStore;
  readonly eventBus: EventBus;
  readonly motion: TrainMotionService;
  readonly interlocking: InterlockingEngine;
  readonly platforms: ReadonlyMap<PlatformId, Platform>;
}

const buildFixture = (
  platforms: ReadonlyMap<PlatformId, Platform> = new Map(),
): Fixture => {
  const w1 = W1();
  const topology = new Topology({
    nodes: [
      { kind: 'section', id: A(), label: 'A' },
      { kind: 'section', id: B(), label: 'B' },
      { kind: 'section', id: C(), label: 'C' },
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
      { id: E_ENTRY(), from: A(), to: w1, bidirectional: true, signalId: ENTRY() },
      { id: E_EXIT(), from: B(), to: C(), bidirectional: true, signalId: EXIT() },
    ],
  });
  const trainStore = new TrainStateStore();
  const switchStore = new SwitchStateStore({ switchIds: [W1S()] });
  const signalStore = new SignalStateStore({ signalIds: [ENTRY(), EXIT()] });
  const sectionStore = new SectionStateStore({ sectionIds: [A(), B(), C()] });
  const routeStore = new RouteStore();
  const eventBus = new EventBus();
  const motion = new TrainMotionService({
    topology,
    trainStore,
    switchStore,
    signalStore,
    sectionStore,
    routeStore,
    eventBus,
    platforms,
  });
  const interlocking = new InterlockingEngine({
    topology,
    switchStore,
    signalStore,
    sectionStore,
    routeStore,
    enforcePlatformRule: false,
  });
  return { topology, trainStore, switchStore, signalStore, sectionStore, routeStore, eventBus, motion, interlocking, platforms };
};

const spawn = (
  f: Fixture,
  overrides: Partial<TrainDefinition> = {},
): TrainDefinition => {
  const def: TrainDefinition = {
    id: TRAIN(),
    label: 'IC101',
    lengthMeters: 200,
    maxSpeedKmh: 160,
    speedSectionsPerTick: 1,
    entryEdgeId: E_ENTRY(),
    exitEdgeId: E_EXIT(),
    ...overrides,
  };
  const r = f.motion.spawnTrain(def, 0);
  if (!r.ok) throw new Error('spawn failed');
  return def;
};

const setRoute = (f: Fixture): RouteId => {
  const outcome = f.interlocking.setRoute(ENTRY(), EXIT(), 0);
  if (outcome.kind !== 'ok') throw new Error('setRoute rejected');
  return outcome.route.id;
};

const collectEvents = (f: Fixture): Event[] => {
  const out: Event[] = [];
  f.eventBus.subscribe((events) => {
    for (const e of events) out.push(e);
  });
  return out;
};

describe('TrainMotionService — spawn and WaitingForEntry', () => {
  it('a freshly spawned train is in WaitingForEntry on its entry edge', () => {
    const f = buildFixture();
    spawn(f);
    const t = f.trainStore.require(TRAIN());
    expect(t.fsmState).toBe('WaitingForEntry');
    expect(t.currentEdgeId).toBe(E_ENTRY());
    expect(t.routeId).toBeNull();
    expect(t.remainingEdges).toEqual([]);
  });

  it('spawnTrain does not occupy switches (milestone 1 simplification)', () => {
    const f = buildFixture();
    spawn(f);
    // The entry edge (A, W1) ends at W1 (a switch). In
    // milestone 1 the switch is not train-occupied; the
    // switch lifecycle is reserved for route reservations
    // and locks.
    expect(f.switchStore.get(W1S())?.lifecycle).toBe('free');
  });

  it('spawnTrain emits TRAIN_REQUESTED_ENTRY', () => {
    const f = buildFixture();
    const events = collectEvents(f);
    spawn(f);
    f.eventBus.flush();
    const evt = events.find(
      (e) => e.type === 'TRAIN_REQUESTED_ENTRY' && e.trainId === TRAIN(),
    );
    expect(evt).toBeDefined();
  });
});

describe('TrainMotionService — WaitingForEntry → Entering (route set)', () => {
  it('transitions to Entering when the entry signal clears (route is set)', () => {
    const f = buildFixture();
    spawn(f);
    setRoute(f);
    const outcomes = f.motion.tick(0);
    expect(outcomes).toHaveLength(1);
    const out = outcomes[0]!;
    expect(out.before.fsmState).toBe('WaitingForEntry');
    expect(out.after.fsmState).toBe('Entering');
    expect(out.after.routeId).not.toBeNull();
    expect(out.after.remainingEdges.length).toBeGreaterThan(0);
  });

  it('does not transition when the entry signal is stop', () => {
    const f = buildFixture();
    spawn(f);
    // No route set; entry signal remains `stop`.
    const outcomes = f.motion.tick(0);
    expect(outcomes).toHaveLength(0);
    const t = f.trainStore.require(TRAIN());
    expect(t.fsmState).toBe('WaitingForEntry');
  });

  it('emits TRAIN_ENTERING log on the transition', () => {
    const f = buildFixture();
    spawn(f);
    setRoute(f);
    const events = collectEvents(f);
    f.motion.tick(0);
    f.eventBus.flush();
    const enteringLog = events.find(
      (e) => e.type === 'LOG' && e.code === 'TRAIN_ENTERING',
    );
    expect(enteringLog).toBeDefined();
  });
});

describe('TrainMotionService — Entering → Running → traverse route', () => {
  it('transitions to Running on the next tick and starts advancing', () => {
    const f = buildFixture();
    spawn(f);
    setRoute(f);
    f.motion.tick(0); // WaitingForEntry → Entering
    f.motion.tick(1); // Entering → Running
    const t = f.trainStore.require(TRAIN());
    expect(t.fsmState).toBe('Running');
  });

  it('traverses the whole route and ends in LeavingControlledArea → removed', () => {
    const f = buildFixture();
    spawn(f);
    setRoute(f);
    f.motion.tick(0); // → Entering
    f.motion.tick(1); // → Running (still on E_entry)
    f.motion.tick(2); // Running → advance to E_W1_B (to=B)
    let t = f.trainStore.require(TRAIN());
    expect(t.currentEdgeId).toBe(asId<EdgeId>('E_W1_B'));
    expect(t.remainingEdges).toEqual([asId<EdgeId>('E_B_C')]);
    f.motion.tick(3); // Running → advance to E_B_C (to=C, exit edge)
    t = f.trainStore.require(TRAIN());
    expect(t.currentEdgeId).toBe(asId<EdgeId>('E_B_C'));
    expect(t.remainingEdges).toEqual([]);
    f.motion.tick(4); // Running → LeavingControlledArea
    t = f.trainStore.require(TRAIN());
    expect(t.fsmState).toBe('LeavingControlledArea');
    f.motion.tick(5); // LeavingControlledArea → removed
    expect(f.trainStore.get(TRAIN())).toBeUndefined();
  });
});

describe('TrainMotionService — section occupancy', () => {
  it('occupies the `to` section of each edge as the train advances', () => {
    const f = buildFixture();
    spawn(f);
    setRoute(f);
    f.motion.tick(0); // → Entering
    f.motion.tick(1); // → Running
    f.motion.tick(2); // advance to E_W1_B; occupies B
    expect(f.sectionStore.get(B())?.occupiedBy).toBe(TRAIN());
    f.motion.tick(3); // advance to E_B_C; vacates B, occupies C
    expect(f.sectionStore.get(B())?.occupiedBy).toBeNull();
    expect(f.sectionStore.get(C())?.occupiedBy).toBe(TRAIN());
  });

  it('vacates a section when the train transitions to LeavingControlledArea', () => {
    const f = buildFixture();
    spawn(f);
    setRoute(f);
    f.motion.tick(0);
    f.motion.tick(1);
    f.motion.tick(2);
    f.motion.tick(3); // on E_B_C (exit edge)
    f.motion.tick(4); // → LeavingControlledArea
    f.motion.tick(5); // removed; C vacated
    expect(f.sectionStore.get(C())?.occupiedBy).toBeNull();
  });
});

describe('TrainMotionService — switch lifecycle', () => {
  it('the switch is locked by the route while the train traverses it', () => {
    const f = buildFixture();
    spawn(f);
    setRoute(f);
    // After the route is set, W1 should be locked.
    expect(f.switchStore.get(W1S())?.lifecycle).toBe('locked');
  });

  it('switch is released when the route is cancelled', () => {
    const f = buildFixture();
    spawn(f);
    const routeId = setRoute(f);
    f.interlocking.cancelRoute(routeId, 1);
    expect(f.switchStore.get(W1S())?.lifecycle).toBe('free');
  });
});

describe('TrainMotionService — StoppedAtSignal (block at next signal)', () => {
  it('stops at a stop signal on the next edge (mid-route)', () => {
    // Build a custom topology with a mid-route signal. The
    // route is set from ENTRY to EXIT; the entry signal goes
    // to `proceed`, but the MID signal on the next edge is
    // `stop` by default (the InterlockingEngine only sets
    // the entry signal to `proceed`).
    const topology = new Topology({
      nodes: [
        { kind: 'section', id: A() },
        { kind: 'section', id: B() },
        { kind: 'section', id: C() },
        {
          kind: 'switch',
          id: W1(),
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
        { id: E_ENTRY(), from: A(), to: W1(), bidirectional: true, signalId: ENTRY() },
        { id: asId<EdgeId>('E_W1_B'), from: W1(), to: B(), bidirectional: true },
        { id: asId<EdgeId>('E_B_C'), from: B(), to: C(), bidirectional: true, signalId: MID() },
        { id: asId<EdgeId>('E_exit'), from: C(), to: C(), bidirectional: true, signalId: EXIT() },
      ],
    });
    const trainStore = new TrainStateStore();
    const switchStore = new SwitchStateStore({ switchIds: [W1S()] });
    const signalStore = new SignalStateStore({
      signalIds: [ENTRY(), EXIT(), MID()],
    });
    const sectionStore = new SectionStateStore({
      sectionIds: [A(), B(), C()],
    });
    const routeStore = new RouteStore();
    const eventBus = new EventBus();
    const motion = new TrainMotionService({
      topology,
      trainStore,
      switchStore,
      signalStore,
      sectionStore,
      routeStore,
      eventBus,
      platforms: new Map(),
    });
    const interlocking = new InterlockingEngine({
      topology,
      switchStore,
      signalStore,
      sectionStore,
      routeStore,
      enforcePlatformRule: false,
    });
    const def: TrainDefinition = {
      id: TRAIN(),
      label: 'IC101',
      lengthMeters: 200,
      maxSpeedKmh: 160,
      speedSectionsPerTick: 1,
      entryEdgeId: E_ENTRY(),
      exitEdgeId: asId<EdgeId>('E_exit'),
    };
    motion.spawnTrain(def, 0);
    const r = interlocking.setRoute(ENTRY(), EXIT(), 0);
    if (r.kind !== 'ok') throw new Error('route rejected');
    motion.tick(0); // → Entering
    motion.tick(1); // → Running on E_entry
    motion.tick(2); // → advance to E_W1_B
    let t = trainStore.require(TRAIN());
    expect(t.fsmState).toBe('Running');
    expect(t.currentEdgeId).toBe(asId<EdgeId>('E_W1_B'));
    // MID is `stop` by default; the train is blocked at MID.
    motion.tick(3);
    t = trainStore.require(TRAIN());
    expect(t.fsmState).toBe('StoppedAtSignal');
    // Stay stopped while MID is `stop`.
    motion.tick(4);
    t = trainStore.require(TRAIN());
    expect(t.fsmState).toBe('StoppedAtSignal');
    // Manually set MID to `proceed` (simulating a dispatcher
    // action). The next tick resumes motion.
    signalStore.setAspect(MID(), 'proceed', { kind: 'OPERATOR_OVERRIDE' }, 5);
    motion.tick(5); // → Running (signal cleared)
    t = trainStore.require(TRAIN());
    expect(t.fsmState).toBe('Running');
  });
});

describe('TrainMotionService — platform stop', () => {
  it('stops at a platform listed in stopsAtPlatforms', () => {
    const platformId = asId<PlatformId>('P1');
    const platforms: ReadonlyMap<PlatformId, Platform> = new Map([
      [platformId, { id: platformId, name: 'Platform 1', sectionIds: [B()] }],
    ]);
    const f = buildFixture(platforms);
    spawn(f, { stopsAtPlatforms: [platformId] });
    setRoute(f);
    f.motion.tick(0); // → Entering
    f.motion.tick(1); // → Running
    f.motion.tick(2); // advance to E_W1_B; B is in P1 → stop
    const t = f.trainStore.require(TRAIN());
    expect(t.fsmState).toBe('StoppedAtPlatform');
    expect(t.heldAtPlatform).toBe(platformId);
    // Stay stopped while held.
    f.motion.tick(3);
    const t2 = f.trainStore.require(TRAIN());
    expect(t2.fsmState).toBe('StoppedAtPlatform');
  });

  it('releasePlatformStop transitions StoppedAtPlatform → Departing', () => {
    const f = buildFixture();
    spawn(f);
    f.motion.tick(0);
    f.motion.tick(1);
    f.motion.tick(2);
    f.motion.tick(3);
    f.motion.tick(4);
    f.motion.tick(5);
    // Forcibly set the state.
    f.trainStore.setState({
      id: TRAIN(),
      direction: 'forward',
      fsmState: 'StoppedAtPlatform',
      currentEdgeId: E_ENTRY(),
      edgePosition: 0,
      routeId: null,
      remainingEdges: [],
      heldAtPlatform: asId<PlatformId>('P1'),
      lastTickAtSimTime: 0,
      delaySeconds: 0,
    });
    const r = releasePlatformStop(f.trainStore, TRAIN(), 5);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.fsmState).toBe('Departing');
    }
    // Next tick: → Running
    f.motion.tick(6);
    const t = f.trainStore.require(TRAIN());
    expect(t.fsmState).toBe('Running');
  });

  it('releasePlatformStop is a no-op when the train is not in StoppedAtPlatform', () => {
    const f = buildFixture();
    spawn(f);
    const r = releasePlatformStop(f.trainStore, TRAIN(), 5);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.fsmState).toBe('WaitingForEntry');
    }
  });
});

describe('TrainMotionService — route cancelled mid-route', () => {
  it('transitions to LeavingControlledArea when the active route is cancelled', () => {
    const f = buildFixture();
    spawn(f);
    setRoute(f);
    f.motion.tick(0);
    f.motion.tick(1);
    f.motion.tick(2); // on E_W1_B
    const route = f.routeStore.getAll()[0]!;
    f.interlocking.cancelRoute(route.id, 2);
    f.motion.tick(3);
    const t = f.trainStore.require(TRAIN());
    expect(t.fsmState).toBe('LeavingControlledArea');
  });
});

describe('TrainMotionService — determinism', () => {
  it('replays the same scenario produce identical state and events', () => {
    const runOnce = () => {
      const f = buildFixture();
      spawn(f);
      setRoute(f);
      const trace: string[] = [];
      for (let t = 0; t < 6; t++) {
        const outcomes = f.motion.tick(t);
        for (const o of outcomes) {
          trace.push(`${t}:${o.before.fsmState}->${o.after.fsmState}`);
        }
      }
      return {
        trace,
        finalSize: f.trainStore.size(),
        sectionState: f.sectionStore.getAll().map((s) => [s.id, s.occupiedBy]),
      };
    };
    const a = runOnce();
    const b = runOnce();
    expect(a).toEqual(b);
  });
});

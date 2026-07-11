import { describe, it, expect, vi } from 'vitest';
import { CommandProcessor } from '../CommandProcessor';
import { TimeService } from '../TimeService';
import { RngService } from '../RngService';
import { EventBus } from '../EventBus';
import { TickLoop } from '../TickLoop';
import { SwitchStateStore } from '@/engine/switches';
import { InterlockingEngine } from '@/engine/interlocking';
import { Topology } from '@/engine/topology';
import { SignalStateStore } from '@/engine/signals';
import { SectionStateStore } from '@/engine/sections';
import { RouteStore } from '@/engine/routes';
import { TrainStateStore, TrainMotionService } from '@/engine/trains';
import { ScenarioService } from '@/engine/scenarios';
import { asId, type SwitchId, type EdgeId, type PlatformId } from '@/types/ids';
import type { Event } from '@/types/events';
import type { Scenario } from '@/types/scenario';
import type { TrainDefinition } from '@/types/trains';

const makeDeps = () => {
  const time = new TimeService();
  const rng = new RngService(1);
  const eventBus = new EventBus();
  const onTick = vi.fn();
  const tickLoop = new TickLoop({
    hz: 1,
    onTick,
    getSimTime: () => time.now(),
    scheduler: () => 0 as unknown as ReturnType<typeof setTimeout>,
    canceller: () => undefined,
  });
  const switchStore = new SwitchStateStore({
    switchIds: [asId<SwitchId>('SW1'), asId<SwitchId>('SW2')],
  });
  const signalStore = new SignalStateStore({ signalIds: [] });
  const sectionStore = new SectionStateStore({ sectionIds: [] });
  const routeStore = new RouteStore();
  const trainStore = new TrainStateStore();
  const scenarioService = new ScenarioService();
  const topology = new Topology({
    nodes: [{ kind: 'section', id: '__singleton__' as never }],
    edges: [],
  });
  const interlocking = new InterlockingEngine({
    topology,
    switchStore,
    signalStore,
    sectionStore,
    routeStore,
    enforcePlatformRule: false,
  });
  const trainMotion = new TrainMotionService({
    topology,
    trainStore,
    switchStore,
    signalStore,
    sectionStore,
    routeStore,
    eventBus,
    platforms: new Map(),
  });
  return {
    time,
    rng,
    eventBus,
    tickLoop,
    switchStore,
    interlocking,
    trainStore,
    trainMotion,
    scenarioService,
    onTick,
  };
};

const collect = (bus: EventBus): Event[] => {
  const out: Event[] = [];
  bus.subscribe((events) => {
    for (const e of events) out.push(e);
  });
  return out;
};

describe('CommandProcessor — clock commands', () => {
  it('PAUSE_SIMULATION pauses the tick loop and time, emits LOG', () => {
    const d = makeDeps();
    const seen = collect(d.eventBus);
    const cp = new CommandProcessor(d);
    d.tickLoop.start();
    cp.process({ type: 'PAUSE_SIMULATION' });
    d.eventBus.flush();
    expect(d.tickLoop.isPaused()).toBe(true);
    expect(d.time.isPaused()).toBe(true);
    expect(seen.find((e) => e.type === 'LOG' && e.message === 'Simulation paused')).toBeDefined();
    d.tickLoop.stop();
  });

  it('RESUME_SIMULATION resumes the tick loop and time, emits LOG', () => {
    const d = makeDeps();
    d.tickLoop.start();
    d.tickLoop.pause();
    const cp = new CommandProcessor(d);
    cp.process({ type: 'RESUME_SIMULATION' });
    d.eventBus.flush();
    expect(d.tickLoop.isPaused()).toBe(false);
    expect(d.time.isPaused()).toBe(false);
    d.tickLoop.stop();
  });

  it('SET_TICK_RATE changes the tick rate and emits LOG', () => {
    const d = makeDeps();
    const seen = collect(d.eventBus);
    const cp = new CommandProcessor(d);
    cp.process({ type: 'SET_TICK_RATE', hz: 4 });
    d.eventBus.flush();
    expect(d.tickLoop.getTickRate()).toBe(4);
    expect(
      seen.find((e) => e.type === 'LOG' && /Tick rate: 1 Hz → 4 Hz/.test(e.message)),
    ).toBeDefined();
  });

  it('SET_TICK_RATE validates the value via the tick loop', () => {
    const d = makeDeps();
    const cp = new CommandProcessor(d);
    expect(() => cp.process({ type: 'SET_TICK_RATE', hz: 0 })).toThrow();
  });

  it('TICK_NOW fires a tick immediately (when running and not paused)', () => {
    const d = makeDeps();
    d.tickLoop.start();
    const cp = new CommandProcessor(d);
    cp.process({ type: 'TICK_NOW' });
    expect(d.onTick).toHaveBeenCalledTimes(1);
    d.tickLoop.stop();
  });

  it('TICK_NOW is a no-op when paused', () => {
    const d = makeDeps();
    d.tickLoop.start();
    d.tickLoop.pause();
    const cp = new CommandProcessor(d);
    cp.process({ type: 'TICK_NOW' });
    expect(d.onTick).not.toHaveBeenCalled();
    d.tickLoop.stop();
  });

  it('END_SCENARIO stops the tick loop and logs', () => {
    const d = makeDeps();
    const seen = collect(d.eventBus);
    d.tickLoop.start();
    const cp = new CommandProcessor(d);
    cp.process({ type: 'END_SCENARIO' });
    d.eventBus.flush();
    expect(d.tickLoop.isRunning()).toBe(false);
    expect(seen.find((e) => e.type === 'LOG' && e.message === 'Scenario ended')).toBeDefined();
  });
});

describe('CommandProcessor — CHANGE_SWITCH', () => {
  it('successful change emits SWITCH_MOVED and a LOG with code SWITCH_CHANGED', () => {
    const d = makeDeps();
    const seen: Event[] = [];
    d.eventBus.subscribe((events) => {
      for (const e of events) seen.push(e);
    });
    const cp = new CommandProcessor(d);
    cp.process({
      type: 'CHANGE_SWITCH',
      switchId: asId<SwitchId>('SW1'),
      position: 'reverse',
    });
    d.eventBus.flush();
    const moved = seen.find((e) => e.type === 'SWITCH_MOVED');
    expect(moved).toBeDefined();
    if (moved && moved.type === 'SWITCH_MOVED') {
      expect(moved.switchId).toBe('SW1');
      expect(moved.position).toBe('reverse');
      expect(moved.fromPosition).toBe('normal');
    }
    const log = seen.find((e) => e.type === 'LOG' && e.code === 'SWITCH_CHANGED');
    expect(log).toBeDefined();
  });

  it('rejected change emits a LOG with the SWITCH_LOCKED reason code', () => {
    const d = makeDeps();
    // Lock SW1 first.
    d.switchStore.reserve(asId<SwitchId>('SW1'), 'R1' as never);
    d.switchStore.lock(asId<SwitchId>('SW1'), 'R1' as never);
    const seen: Event[] = [];
    d.eventBus.subscribe((events) => {
      for (const e of events) seen.push(e);
    });
    const cp = new CommandProcessor(d);
    cp.process({
      type: 'CHANGE_SWITCH',
      switchId: asId<SwitchId>('SW1'),
      position: 'reverse',
    });
    d.eventBus.flush();
    const log = seen.find((e) => e.type === 'LOG' && e.code === 'SWITCH_LOCKED');
    expect(log).toBeDefined();
    if (log && log.type === 'LOG') {
      expect(log.level).toBe('warning');
    }
    expect(seen.find((e) => e.type === 'SWITCH_MOVED')).toBeUndefined();
  });
});

describe('CommandProcessor — SPAWN_TRAIN', () => {
  it('spawns a train, logs TRAIN_SPAWNED, and emits TRAIN_REQUESTED_ENTRY', () => {
    const d = makeDeps();
    const seen: Event[] = [];
    d.eventBus.subscribe((events) => {
      for (const e of events) seen.push(e);
    });
    const cp = new CommandProcessor(d);
    const def: TrainDefinition = {
      id: asId('T1') as never,
      label: 'T1',
      lengthMeters: 200,
      maxSpeedKmh: 160,
      speedSectionsPerTick: 1,
      entryEdgeId: asId<EdgeId>('E_in'),
      exitEdgeId: asId<EdgeId>('E_out'),
    };
    cp.process({ type: 'SPAWN_TRAIN', train: def });
    d.eventBus.flush();
    const spawned = seen.find(
      (e) => e.type === 'LOG' && e.code === 'TRAIN_SPAWNED',
    );
    expect(spawned).toBeDefined();
    const entry = seen.find((e) => e.type === 'TRAIN_REQUESTED_ENTRY');
    expect(entry).toBeDefined();
    const state = d.trainStore.get(asId('T1') as never);
    expect(state).toBeDefined();
  });

  it('rejects duplicate IDs with TRAIN_ALREADY_EXISTS', () => {
    const d = makeDeps();
    const seen: Event[] = [];
    d.eventBus.subscribe((events) => {
      for (const e of events) seen.push(e);
    });
    const cp = new CommandProcessor(d);
    const def: TrainDefinition = {
      id: asId('T1') as never,
      label: 'T1',
      lengthMeters: 200,
      maxSpeedKmh: 160,
      speedSectionsPerTick: 1,
      entryEdgeId: asId<EdgeId>('E_in'),
      exitEdgeId: asId<EdgeId>('E_out'),
    };
    cp.process({ type: 'SPAWN_TRAIN', train: def });
    d.eventBus.flush();
    seen.length = 0;
    cp.process({ type: 'SPAWN_TRAIN', train: def });
    d.eventBus.flush();
    const reject = seen.find(
      (e) => e.type === 'LOG' && e.code === 'TRAIN_ALREADY_EXISTS',
    );
    expect(reject).toBeDefined();
  });
});

describe('CommandProcessor — DISPATCH_TRAIN', () => {
  it('transitions StoppedAtPlatform → Departing and logs TRAIN_DISPATCHED', () => {
    const d = makeDeps();
    const seen: Event[] = [];
    d.eventBus.subscribe((events) => {
      for (const e of events) seen.push(e);
    });
    const cp = new CommandProcessor(d);
    // Spawn the train first.
    const def: TrainDefinition = {
      id: asId('T1') as never,
      label: 'T1',
      lengthMeters: 200,
      maxSpeedKmh: 160,
      speedSectionsPerTick: 1,
      entryEdgeId: asId<EdgeId>('E_in'),
      exitEdgeId: asId<EdgeId>('E_out'),
    };
    cp.process({ type: 'SPAWN_TRAIN', train: def });
    d.eventBus.flush();
    seen.length = 0;
    // Force the train into StoppedAtPlatform.
    d.trainStore.setState({
      id: asId('T1') as never,
      direction: 'forward',
      fsmState: 'StoppedAtPlatform',
      currentEdgeId: asId<EdgeId>('E_in'),
      edgePosition: 0,
      routeId: null,
      remainingEdges: [],
      heldAtPlatform: asId<PlatformId>('P1'),
      lastTickAtSimTime: 0,
      delaySeconds: 0,
    });
    cp.process({ type: 'DISPATCH_TRAIN', trainId: asId('T1') as never });
    d.eventBus.flush();
    const dispatched = seen.find(
      (e) => e.type === 'LOG' && e.code === 'TRAIN_DISPATCHED',
    );
    expect(dispatched).toBeDefined();
    expect(d.trainStore.get(asId('T1') as never)?.fsmState).toBe('Departing');
  });

  it('warns when the train is not held at a platform', () => {
    const d = makeDeps();
    const seen: Event[] = [];
    d.eventBus.subscribe((events) => {
      for (const e of events) seen.push(e);
    });
    const cp = new CommandProcessor(d);
    const def: TrainDefinition = {
      id: asId('T1') as never,
      label: 'T1',
      lengthMeters: 200,
      maxSpeedKmh: 160,
      speedSectionsPerTick: 1,
      entryEdgeId: asId<EdgeId>('E_in'),
      exitEdgeId: asId<EdgeId>('E_out'),
    };
    cp.process({ type: 'SPAWN_TRAIN', train: def });
    d.eventBus.flush();
    seen.length = 0;
    cp.process({ type: 'DISPATCH_TRAIN', trainId: asId('T1') as never });
    d.eventBus.flush();
    const warn = seen.find(
      (e) => e.type === 'LOG' && e.code === 'TRAIN_INVALID_TRANSITION',
    );
    expect(warn).toBeDefined();
  });
});

describe('CommandProcessor — START_SCENARIO', () => {
  it('starts a registered scenario and emits SCENARIO_STARTED', () => {
    const d = makeDeps();
    const scenario: Scenario = {
      id: asId('tutorial') as never,
      name: 'Tutorial',
      infrastructure: { path: 'infra.json' },
      trains: [],
      timetable: [],
      objectives: [],
      startSimTime: 480,
      endSimTime: 540,
    };
    d.scenarioService.register(scenario);
    const seen: Event[] = [];
    d.eventBus.subscribe((events) => {
      for (const e of events) seen.push(e);
    });
    const cp = new CommandProcessor(d);
    cp.process({ type: 'START_SCENARIO', scenarioId: asId('tutorial') as never });
    d.eventBus.flush();
    const started = seen.find((e) => e.type === 'SCENARIO_STARTED');
    expect(started).toBeDefined();
    expect(d.scenarioService.activeScenario()?.id).toBe(asId('tutorial') as never);
  });

  it('rejects an unknown scenario with SCENARIO_UNKNOWN', () => {
    const d = makeDeps();
    const seen: Event[] = [];
    d.eventBus.subscribe((events) => {
      for (const e of events) seen.push(e);
    });
    const cp = new CommandProcessor(d);
    cp.process({ type: 'START_SCENARIO', scenarioId: asId('NOPE') as never });
    d.eventBus.flush();
    const log = seen.find(
      (e) => e.type === 'LOG' && e.code === 'SCENARIO_UNKNOWN',
    );
    expect(log).toBeDefined();
  });
});

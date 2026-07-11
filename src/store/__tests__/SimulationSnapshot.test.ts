import { describe, it, expect, vi } from 'vitest';
import {
  projectSnapshot,
  type EngineProjectionSource,
} from '../SimulationSnapshot';
import { asId, type NodeId, type SwitchId, type SignalId, type TrainId } from '@/types/ids';
import type { SwitchState } from '@/types/infrastructure';
import type { SignalState } from '@/types/infrastructure';
import type { SectionState } from '@/types/infrastructure';
import type { TrainState } from '@/types/trains';
import type { Route } from '@/types/routes';

const makeSwitch = (id: string, position: 'normal' | 'reverse' = 'normal'): SwitchState => ({
  id: asId<SwitchId>(id),
  position,
  lifecycle: 'free',
  lockedBy: null,
  occupiedBy: null,
});

const makeSignal = (id: string, aspect: 'stop' | 'proceed' = 'stop'): SignalState => ({
  id: asId<SignalId>(id),
  aspect,
  controlledBy: null,
  lastChangeReason: { kind: 'INITIAL' },
  lastChangeAtSimTime: 0,
});

const makeSection = (id: string): SectionState => ({
  id: asId<NodeId>(id),
  occupiedBy: null,
  reservedBy: null,
});

const makeTrain = (id: string): TrainState => ({
  id: asId<TrainId>(id),
  direction: 'forward',
  fsmState: 'WaitingForEntry',
  currentEdgeId: null,
  edgePosition: 0,
  routeId: null,
  remainingEdges: [],
  heldAtPlatform: null,
  lastTickAtSimTime: 0,
  delaySeconds: 0,
});

const makeEngine = (
  overrides: Partial<{
    time: number;
    paused: boolean;
    tickHz: number;
    isRunning: boolean;
    switches: readonly SwitchState[];
    signals: readonly SignalState[];
    sections: readonly SectionState[];
    routes: readonly Route[];
    trains: readonly TrainState[];
    topology: unknown;
  }> = {},
): EngineProjectionSource => {
  const topology = overrides.topology ?? { nodes: [], edges: [] };
  return {
    time: {
      now: () => overrides.time ?? 0,
      isPaused: () => overrides.paused ?? false,
    },
    tickLoop: {
      getTickRate: () => overrides.tickHz ?? 1,
      isRunning: () => overrides.isRunning ?? false,
    },
    topology: {
      serialize: () => ({ data: topology }),
    },
    switchStore: { getAll: () => overrides.switches ?? [] },
    signalStore: { getAll: () => overrides.signals ?? [] },
    sectionStore: { getAll: () => overrides.sections ?? [] },
    routeStore: { getAll: () => overrides.routes ?? [] },
    trainStore: { getAll: () => overrides.trains ?? [] },
    scenarioService: { getAll: () => [], activeScenario: () => null },
  };
};

describe('projectSnapshot — basics', () => {
  it('produces a snapshot with the engine time, paused state, and tick rate', () => {
    const eng = makeEngine({ time: 42, paused: true, tickHz: 2, isRunning: true });
    const snap = projectSnapshot(eng, new Map(), null, 'INITIAL', 0);
    expect(snap.simTime).toBe(42);
    expect(snap.paused).toBe(true);
    expect(snap.tickHz).toBe(2);
    expect(snap.isRunning).toBe(true);
  });

  it('maps engine stores into immutable maps keyed by id', () => {
    const eng = makeEngine({
      switches: [makeSwitch('W1'), makeSwitch('W2')],
      signals: [makeSignal('S1')],
      sections: [makeSection('T1')],
      trains: [makeTrain('T1')],
    });
    const snap = projectSnapshot(eng, new Map(), null, 'INITIAL', 0);
    expect(snap.switches.size).toBe(2);
    expect(snap.switches.get(asId<SwitchId>('W1'))?.position).toBe('normal');
    expect(snap.signals.size).toBe(1);
    expect(snap.sections.size).toBe(1);
    expect(snap.trains.size).toBe(1);
  });

  it('records the last event kind and last tick time', () => {
    const eng = makeEngine();
    const snap = projectSnapshot(eng, new Map(), null, 'TIME_TICK', 5);
    expect(snap.lastEventKind).toBe('TIME_TICK');
    expect(snap.lastTickAtSimTime).toBe(5);
  });
});

describe('projectSnapshot — stability', () => {
  it('reuses map references when the data has not changed', () => {
    const eng = makeEngine({
      switches: [makeSwitch('W1')],
      signals: [makeSignal('S1')],
    });
    const a = projectSnapshot(eng, new Map(), null, 'INITIAL', 0);
    const b = projectSnapshot(eng, new Map(), a, null, 0);
    expect(b.switches).toBe(a.switches);
    expect(b.signals).toBe(a.signals);
  });

  it('returns a new map when a switch position has changed', () => {
    const a = projectSnapshot(
      makeEngine({ switches: [makeSwitch('W1', 'normal')] }),
      new Map(),
      null,
      'INITIAL',
      0,
    );
    const b = projectSnapshot(
      makeEngine({ switches: [makeSwitch('W1', 'reverse')] }),
      new Map(),
      a,
      'SWITCH_MOVED',
      0,
    );
    expect(b.switches).not.toBe(a.switches);
    expect(b.switches.get(asId<SwitchId>('W1'))?.position).toBe('reverse');
  });

  it('returns a new map when a signal aspect has changed', () => {
    const a = projectSnapshot(
      makeEngine({ signals: [makeSignal('S1', 'stop')] }),
      new Map(),
      null,
      'INITIAL',
      0,
    );
    const b = projectSnapshot(
      makeEngine({ signals: [makeSignal('S1', 'proceed')] }),
      new Map(),
      a,
      'SIGNAL_ASPECT_CHANGED',
      0,
    );
    expect(b.signals).not.toBe(a.signals);
  });
});

describe('projectSnapshot — degraded state', () => {
  it('returns an empty snapshot when the topology cannot be serialised', () => {
    const eng: EngineProjectionSource = {
      time: { now: () => 0, isPaused: () => false },
      tickLoop: { getTickRate: () => 1, isRunning: () => false },
      topology: { serialize: () => ({}) },
      switchStore: { getAll: () => [] },
      signalStore: { getAll: () => [] },
      sectionStore: { getAll: () => [] },
      routeStore: { getAll: () => [] },
      trainStore: { getAll: () => [] },
      scenarioService: { getAll: () => [], activeScenario: () => null },
    };
    const snap = projectSnapshot(eng, new Map(), null, 'INITIAL', 0);
    expect(snap.topology.nodes).toEqual([]);
    expect(snap.topology.edges).toEqual([]);
  });
});

describe('projectSnapshot — determinism', () => {
  it('same engine state produces snapshots with the same scalar fields', () => {
    const w1 = makeSwitch('W1', 'reverse');
    const s1 = makeSignal('S1', 'proceed');
    const eng1 = makeEngine({
      time: 10,
      tickHz: 2,
      switches: [w1],
      signals: [s1],
    });
    const eng2 = makeEngine({
      time: 10,
      tickHz: 2,
      switches: [makeSwitch('W1', 'reverse')],
      signals: [makeSignal('S1', 'proceed')],
    });
    const a = projectSnapshot(eng1, new Map(), null, 'TIME_TICK', 10);
    const b = projectSnapshot(eng2, new Map(), null, 'TIME_TICK', 10);
    expect(a.simTime).toBe(b.simTime);
    expect(a.tickHz).toBe(b.tickHz);
    expect(a.switches.get(asId<SwitchId>('W1'))?.position).toBe(
      b.switches.get(asId<SwitchId>('W1'))?.position,
    );
    expect(a.signals.get(asId<SignalId>('S1'))?.aspect).toBe(
      b.signals.get(asId<SignalId>('S1'))?.aspect,
    );
  });

  it('the same engine projected twice reuses map references (stability)', () => {
    const eng = makeEngine({
      time: 10,
      tickHz: 2,
      switches: [makeSwitch('W1', 'reverse')],
      signals: [makeSignal('S1', 'proceed')],
    });
    const a = projectSnapshot(eng, new Map(), null, 'INITIAL', 0);
    const b = projectSnapshot(eng, new Map(), a, null, 0);
    expect(a.switches).toBe(b.switches);
    expect(a.signals).toBe(b.signals);
  });
});

// Avoid vi import being unused if all tests are filtered.
void vi;

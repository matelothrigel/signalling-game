import { describe, it, expect } from 'vitest';
import {
  asId,
  type TrainId,
  type EdgeId,
  type RouteId,
  type PlatformId,
  type NodeId,
  type SignalId,
  type ScenarioId,
  type ObjectiveId,
} from '../ids';
import type { TrainDefinition, TrainState } from '../trains';
import type { Route } from '../routes';
import type { Scenario, Objective, TimetableEvent } from '../scenario';
import type { Aspect, SwitchPosition } from '../primitives';

const t = (s: string) => asId<TrainId>(s);
const n = (s: string) => asId<NodeId>(s);
const e = (s: string) => asId<EdgeId>(s);
const rt = (s: string) => asId<RouteId>(s);
const sg = (s: string) => asId<SignalId>(s);
const pl = (s: string) => asId<PlatformId>(s);
const sc = (s: string) => asId<ScenarioId>(s);
const oid = (s: string) => asId<ObjectiveId>(s);

describe('TrainDefinition', () => {
  it('captures static properties used by scenarios', () => {
    const d: TrainDefinition = {
      id: t('IC101'),
      label: 'IC101',
      lengthMeters: 200,
      maxSpeedKmh: 160,
      speedSectionsPerTick: 1,
      entryEdgeId: e('E_in'),
      exitEdgeId: e('E_out'),
      stopsAtPlatforms: [pl('P2')],
    };
    expect(d.label).toBe('IC101');
    expect(d.maxSpeedKmh).toBe(160);
  });
});

describe('TrainState', () => {
  it('tracks edge-based position with t in [0, 1] and an FSM state', () => {
    const s: TrainState = {
      id: t('IC101'),
      direction: 'forward',
      fsmState: 'Running',
      currentEdgeId: e('E1'),
      edgePosition: 0.5,
      routeId: rt('R1'),
      remainingEdges: [e('E2'), e('E3')],
      heldAtPlatform: null,
      lastTickAtSimTime: 0,
      delaySeconds: 0,
    };
    expect(s.edgePosition).toBeGreaterThanOrEqual(0);
    expect(s.edgePosition).toBeLessThanOrEqual(1);
    expect(s.fsmState).toBe('Running');
  });
});

describe('Route', () => {
  it('lists the sections, edges, and locked switches', () => {
    const r: Route = {
      id: rt('R1'),
      entrySignalId: sg('S1'),
      exitSignalId: sg('S2'),
      sectionIds: [n('T1'), n('T2')],
      edgeIds: [e('E1'), e('E2')],
      lockedSwitchIds: [],
      active: true,
      entryAspect: 'proceed',
    };
    expect(r.active).toBe(true);
    expect(r.sectionIds).toHaveLength(2);
  });
});

describe('Scenario', () => {
  it('is a data-driven definition with timetable and objectives', () => {
    const evt: TimetableEvent = {
      type: 'SPAWN_TRAIN',
      atSimTime: 60,
      train: {
        id: t('IC101'),
        label: 'IC101',
        lengthMeters: 200,
        maxSpeedKmh: 160,
        speedSectionsPerTick: 1,
        entryEdgeId: e('E_in'),
        exitEdgeId: e('E_out'),
      },
    };
    const obj: Objective = {
      kind: 'ROUTE_TRAIN_TO_PLATFORM',
      id: oid('O1'),
      description: 'Route IC101 to platform 2',
      trainId: t('IC101'),
      platformId: pl('P2'),
      dueBySimTime: 300,
    };
    const scen: Scenario = {
      id: sc('tutorial'),
      name: 'Tutorial',
      infrastructure: { path: '../infrastructure/station01.json' },
      trains: [],
      timetable: [evt],
      objectives: [obj],
      startSimTime: 480,
      endSimTime: 540,
    };
    expect(scen.timetable).toHaveLength(1);
    expect(scen.objectives).toHaveLength(1);
  });
});

describe('primitive literal unions', () => {
  it('accepts only declared members', () => {
    const a: Aspect = 'proceed';
    const s: SwitchPosition = 'reverse';
    expect(a).toBe('proceed');
    expect(s).toBe('reverse');
  });
});

import { describe, it, expect } from 'vitest';
import { TrainStateStore } from '../TrainStateStore';
import {
  TrainReasonCode,
  trainReasonMessage,
  trainError,
} from '../TrainReasonCode';
import {
  asId,
  type TrainId,
  type EdgeId,
  type RouteId,
  type PlatformId,
} from '@/types/ids';
import type { TrainDefinition, TrainState } from '@/types/trains';

const t = (s: string) => asId<TrainId>(s);
const e = (s: string) => asId<EdgeId>(s);
const r = (s: string) => asId<RouteId>(s);
const pl = (s: string) => asId<PlatformId>(s);

const makeDefinition = (overrides: Partial<TrainDefinition> = {}): TrainDefinition => ({
  id: t('IC101'),
  label: 'IC101',
  lengthMeters: 200,
  maxSpeedKmh: 160,
  speedSectionsPerTick: 1,
  entryEdgeId: e('E_in'),
  exitEdgeId: e('E_out'),
  ...overrides,
});

describe('TrainStateStore — construction', () => {
  it('starts empty', () => {
    const s = new TrainStateStore();
    expect(s.size()).toBe(0);
    expect(s.getAll()).toEqual([]);
  });
});

describe('TrainStateStore — spawn', () => {
  it('creates a WaitingForEntry state on the definition entry edge', () => {
    const s = new TrainStateStore();
    const d = makeDefinition();
    const result = s.spawn(d, 100);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fsmState).toBe('WaitingForEntry');
      expect(result.value.currentEdgeId).toBe('E_in');
      expect(result.value.edgePosition).toBe(0);
      expect(result.value.routeId).toBeNull();
      expect(result.value.remainingEdges).toEqual([]);
      expect(result.value.heldAtPlatform).toBeNull();
      expect(result.value.lastTickAtSimTime).toBe(100);
      expect(result.value.delaySeconds).toBe(0);
    }
    expect(s.size()).toBe(1);
  });

  it('rejects duplicate IDs with TRAIN_ALREADY_EXISTS', () => {
    const s = new TrainStateStore();
    s.spawn(makeDefinition(), 0);
    const r2 = s.spawn(makeDefinition(), 1);
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error.code).toBe(TrainReasonCode.ALREADY_EXISTS);
    }
  });

  it('preserves the definition id, direction, length, and stops', () => {
    const s = new TrainStateStore();
    const d = makeDefinition({
      stopsAtPlatforms: [pl('P1'), pl('P2')],
    });
    const result = s.spawn(d, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('IC101');
      expect(result.value.direction).toBe('forward');
    }
  });
});

describe('TrainStateStore — setState / update', () => {
  it('setState replaces the state record and returns the new state', () => {
    const s = new TrainStateStore();
    s.spawn(makeDefinition(), 0);
    const next: TrainState = {
      id: t('IC101'),
      direction: 'forward',
      fsmState: 'Running',
      currentEdgeId: e('E1'),
      edgePosition: 0.5,
      routeId: r('R1'),
      remainingEdges: [e('E2')],
      heldAtPlatform: null,
      lastTickAtSimTime: 1,
      delaySeconds: 0,
    };
    const r2 = s.setState(next);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.value.fsmState).toBe('Running');
      expect(r2.value.currentEdgeId).toBe('E1');
      expect(r2.value.edgePosition).toBe(0.5);
    }
  });

  it('setState rejects unknown train with TRAIN_UNKNOWN', () => {
    const s = new TrainStateStore();
    const r2 = s.setState({
      id: t('NOPE'),
      direction: 'forward',
      fsmState: 'Running',
      currentEdgeId: e('E1'),
      edgePosition: 0,
      routeId: null,
      remainingEdges: [],
      heldAtPlatform: null,
      lastTickAtSimTime: 0,
      delaySeconds: 0,
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error.code).toBe(TrainReasonCode.UNKNOWN);
    }
  });

  it('update applies a mutator and returns the new state', () => {
    const s = new TrainStateStore();
    s.spawn(makeDefinition(), 0);
    const r2 = s.update(t('IC101'), (cur) => ({
      ...cur,
      fsmState: 'Running',
      lastTickAtSimTime: 5,
    }));
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.value.fsmState).toBe('Running');
      expect(r2.value.lastTickAtSimTime).toBe(5);
    }
  });

  it('update rejects unknown train', () => {
    const s = new TrainStateStore();
    const r2 = s.update(t('NOPE'), (cur) => cur);
    expect(r2.ok).toBe(false);
  });
});

describe('TrainStateStore — queries', () => {
  const seed = (): TrainStateStore => {
    const s = new TrainStateStore();
    s.spawn(makeDefinition({ id: t('A') }), 0);
    s.spawn(makeDefinition({ id: t('B') }), 0);
    s.spawn(makeDefinition({ id: t('C') }), 0);
    s.setState({
      id: t('A'),
      direction: 'forward',
      fsmState: 'Running',
      currentEdgeId: e('E1'),
      edgePosition: 0.5,
      routeId: r('R1'),
      remainingEdges: [],
      heldAtPlatform: null,
      lastTickAtSimTime: 0,
      delaySeconds: 0,
    });
    s.setState({
      id: t('B'),
      direction: 'forward',
      fsmState: 'StoppedAtPlatform',
      currentEdgeId: e('E2'),
      edgePosition: 0.5,
      routeId: r('R2'),
      remainingEdges: [],
      heldAtPlatform: pl('P2'),
      lastTickAtSimTime: 0,
      delaySeconds: 0,
    });
    s.setState({
      id: t('C'),
      direction: 'forward',
      fsmState: 'Running',
      currentEdgeId: e('E3'),
      edgePosition: 0.5,
      routeId: r('R2'),
      remainingEdges: [],
      heldAtPlatform: null,
      lastTickAtSimTime: 0,
      delaySeconds: 0,
    });
    return s;
  };

  it('findByState returns every train in the given state', () => {
    const s = seed();
    expect(s.findByState('Running').map((x) => x.id).sort()).toEqual(['A', 'C']);
    expect(s.findByState('StoppedAtPlatform').map((x) => x.id)).toEqual(['B']);
  });

  it('findByRoute returns every train on the given route', () => {
    const s = seed();
    expect(s.findByRoute(r('R1')).map((x) => x.id)).toEqual(['A']);
    expect(s.findByRoute(r('R2')).map((x) => x.id).sort()).toEqual(['B', 'C']);
  });

  it('findByEdge returns every train on the given edge', () => {
    const s = seed();
    expect(s.findByEdge(e('E1')).map((x) => x.id)).toEqual(['A']);
  });

  it('findHeldAtPlatform returns trains in StoppedAtPlatform with matching platform', () => {
    const s = seed();
    expect(s.findHeldAtPlatform(pl('P2')).map((x) => x.id)).toEqual(['B']);
    expect(s.findHeldAtPlatform(pl('P1'))).toEqual([]);
  });
});

describe('TrainStateStore — remove', () => {
  it('removes the train and returns the removed state', () => {
    const s = new TrainStateStore();
    s.spawn(makeDefinition(), 0);
    const r2 = s.remove(t('IC101'));
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.value.id).toBe('IC101');
    }
    expect(s.size()).toBe(0);
  });

  it('rejects unknown train with TRAIN_UNKNOWN', () => {
    const s = new TrainStateStore();
    const r2 = s.remove(t('NOPE'));
    expect(r2.ok).toBe(false);
  });
});

describe('TrainStateStore — serialization', () => {
  it('serialize / load round-trip preserves state', () => {
    const a = new TrainStateStore();
    a.spawn(makeDefinition(), 10);
    a.setState({
      id: t('IC101'),
      direction: 'forward',
      fsmState: 'Running',
      currentEdgeId: e('E1'),
      edgePosition: 0.5,
      routeId: r('R1'),
      remainingEdges: [e('E2')],
      heldAtPlatform: null,
      lastTickAtSimTime: 11,
      delaySeconds: 0,
    });
    const snap = a.serialize();

    const b = new TrainStateStore();
    const r2 = b.load(snap);
    expect(r2.ok).toBe(true);
    const got = b.get(t('IC101'));
    expect(got).toBeDefined();
    expect(got?.fsmState).toBe('Running');
    expect(got?.lastTickAtSimTime).toBe(11);
  });
});

describe('TrainReasonCode', () => {
  it('trainReasonMessage produces a human-readable message for known codes', () => {
    expect(trainReasonMessage(TrainReasonCode.UNKNOWN, { trainId: 'IC101' })).toMatch(/IC101/);
    expect(trainReasonMessage(TrainReasonCode.ALREADY_EXISTS, { trainId: 'IC101' })).toMatch(/IC101/);
    expect(trainReasonMessage(TrainReasonCode.NO_ROUTE, { trainId: 'IC101' })).toMatch(/IC101/);
  });

  it('trainError builds an EngineError with code, message, and context', () => {
    const e = trainError(TrainReasonCode.NO_ROUTE, { trainId: 'IC101' });
    expect(e.code).toBe('TRAIN_NO_ROUTE');
    expect(e.message).toMatch(/IC101/);
    expect(e.context).toEqual({ trainId: 'IC101' });
  });
});

import { describe, it, expect } from 'vitest';
import { ObjectiveChecker } from '../ObjectiveChecker';
import { EventBus } from '@/engine/core/EventBus';
import { asId, type TrainId, type PlatformId } from '@/types/ids';
import type { Objective } from '@/types/scenario';
import type { ObjectiveId } from '@/types/ids';
import type { TrainState } from '@/types/trains';

const TRAIN = (s: string) => asId<TrainId>(s);
const PLAT = (s: string) => asId<PlatformId>(s);
const OBJ = (s: string) => asId<ObjectiveId>(s);

const makeTrain = (overrides: Partial<TrainState> = {}): TrainState => ({
  id: TRAIN('T1'),
  direction: 'forward',
  fsmState: 'Running',
  currentEdgeId: null,
  edgePosition: 0,
  routeId: null,
  remainingEdges: [],
  heldAtPlatform: null,
  lastTickAtSimTime: 0,
  delaySeconds: 0,
  ...overrides,
});

const makeChecker = () => {
  const bus = new EventBus();
  const trains = new Map<TrainId, TrainState>();
  const source = {
    now: () => 0,
    getTrain: (id: TrainId) => trains.get(id),
    getTrainEdge: (id: TrainId) => trains.get(id)?.currentEdgeId ?? null,
  };
  const checker = new ObjectiveChecker(bus, source);
  return { bus, trains, source, checker };
};

const collectCompleted = (bus: EventBus): ObjectiveId[] => {
  const out: ObjectiveId[] = [];
  bus.subscribe((events) => {
    for (const e of events) {
      if (e.type === 'OBJECTIVE_COMPLETED') out.push(e.objectiveId);
    }
  });
  return out;
};

describe('ObjectiveChecker — setObjectives / clearObjectives', () => {
  it('returns empty views before any objectives are set', () => {
    const { checker } = makeChecker();
    expect(checker.getViews()).toEqual([]);
  });

  it('returns one view per objective in insertion order', () => {
    const { checker } = makeChecker();
    const objs: readonly Objective[] = [
      {
        kind: 'ROUTE_TRAIN_TO_PLATFORM',
        id: OBJ('O1'),
        description: 'first',
        trainId: TRAIN('T1'),
        platformId: PLAT('P1'),
        dueBySimTime: 100,
      },
      {
        kind: 'DISPATCH_TRAIN',
        id: OBJ('O2'),
        description: 'second',
        trainId: TRAIN('T1'),
        direction: 'outbound',
        dueBySimTime: 200,
      },
    ];
    checker.setObjectives(objs);
    const views = checker.getViews();
    expect(views).toHaveLength(2);
    expect(views[0]?.description).toBe('first');
    expect(views[1]?.description).toBe('second');
    expect(views[0]?.completed).toBe(false);
  });

  it('clears objectives', () => {
    const { checker } = makeChecker();
    checker.setObjectives([
      {
        kind: 'ROUTE_TRAIN_TO_PLATFORM',
        id: OBJ('O1'),
        description: 'first',
        trainId: TRAIN('T1'),
        platformId: PLAT('P1'),
        dueBySimTime: 100,
      },
    ]);
    checker.clearObjectives();
    expect(checker.getViews()).toEqual([]);
  });
});

describe('ObjectiveChecker — ROUTE_TRAIN_TO_PLATFORM', () => {
  it('completes when the train is in StoppedAtPlatform at the right platform', () => {
    const { bus, trains, checker } = makeChecker();
    trains.set(
      TRAIN('T1'),
      makeTrain({ fsmState: 'StoppedAtPlatform', heldAtPlatform: PLAT('P1') }),
    );
    checker.setObjectives([
      {
        kind: 'ROUTE_TRAIN_TO_PLATFORM',
        id: OBJ('O1'),
        description: 'route T1 to P1',
        trainId: TRAIN('T1'),
        platformId: PLAT('P1'),
        dueBySimTime: 100,
      },
    ]);
    const completed = collectCompleted(bus);
    checker.tick();
    bus.flush();
    expect(completed).toEqual([OBJ('O1')]);
    expect(checker.getViews()[0]?.completed).toBe(true);
  });

  it('does not complete when the train is at a different platform', () => {
    const { trains, checker } = makeChecker();
    trains.set(
      TRAIN('T1'),
      makeTrain({ fsmState: 'StoppedAtPlatform', heldAtPlatform: PLAT('P2') }),
    );
    checker.setObjectives([
      {
        kind: 'ROUTE_TRAIN_TO_PLATFORM',
        id: OBJ('O1'),
        description: 'route T1 to P1',
        trainId: TRAIN('T1'),
        platformId: PLAT('P1'),
        dueBySimTime: 100,
      },
    ]);
    expect(checker.tick()).toEqual([]);
  });
});

describe('ObjectiveChecker — DISPATCH_TRAIN', () => {
  it('completes when the train was at a platform and has been dispatched', () => {
    const { bus, trains, checker } = makeChecker();
    const id = TRAIN('T1');
    // Subscribe BEFORE the first tick so the events are
    // captured.
    const completed = collectCompleted(bus);
    // First, the train arrives at the platform.
    trains.set(
      id,
      makeTrain({ fsmState: 'StoppedAtPlatform', heldAtPlatform: PLAT('P1') }),
    );
    checker.setObjectives([
      {
        kind: 'DISPATCH_TRAIN',
        id: OBJ('O1'),
        description: 'dispatch T1',
        trainId: id,
        direction: 'outbound',
        dueBySimTime: 200,
      },
    ]);
    checker.tick(); // T1 is at platform → recorded as seen-at-platform
    bus.flush();
    // Then the train is dispatched (Departing / Running / etc.).
    trains.set(id, makeTrain({ id, fsmState: 'Departing' }));
    checker.tick();
    bus.flush();
    expect(completed).toEqual([OBJ('O1')]);
  });

  it('does not complete when the train never visited a platform', () => {
    const { trains, checker } = makeChecker();
    const id = TRAIN('T1');
    trains.set(id, makeTrain({ id, fsmState: 'Running' }));
    checker.setObjectives([
      {
        kind: 'DISPATCH_TRAIN',
        id: OBJ('O1'),
        description: 'dispatch T1',
        trainId: id,
        direction: 'outbound',
        dueBySimTime: 200,
      },
    ]);
    expect(checker.tick()).toEqual([]);
  });
});

describe('ObjectiveChecker — NO_CONFLICT_FOR_DURATION', () => {
  it('never completes (not implemented in milestone 1)', () => {
    const { checker } = makeChecker();
    checker.setObjectives([
      {
        kind: 'NO_CONFLICT_FOR_DURATION',
        id: OBJ('O1'),
        description: 'no conflict',
        durationSimTime: 60,
        dueBySimTime: 100,
      },
    ]);
    expect(checker.tick()).toEqual([]);
  });
});

describe('ObjectiveChecker — idempotency', () => {
  it('does not re-emit OBJECTIVE_COMPLETED on subsequent ticks', () => {
    const { bus, trains, checker } = makeChecker();
    trains.set(
      TRAIN('T1'),
      makeTrain({ fsmState: 'StoppedAtPlatform', heldAtPlatform: PLAT('P1') }),
    );
    checker.setObjectives([
      {
        kind: 'ROUTE_TRAIN_TO_PLATFORM',
        id: OBJ('O1'),
        description: 'route',
        trainId: TRAIN('T1'),
        platformId: PLAT('P1'),
        dueBySimTime: 100,
      },
    ]);
    let emitCount = 0;
    bus.subscribe((events) => {
      for (const e of events) {
        if (e.type === 'OBJECTIVE_COMPLETED') emitCount += 1;
      }
    });
    checker.tick();
    bus.flush();
    checker.tick();
    bus.flush();
    checker.tick();
    bus.flush();
    expect(emitCount).toBe(1);
  });
});

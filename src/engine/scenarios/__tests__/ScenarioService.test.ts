import { describe, it, expect } from 'vitest';
import { ScenarioService } from '../ScenarioService';
import { ScenarioReasonCode } from '../ScenarioReasonCode';
import {
  asId,
  type ScenarioId,
  type TrainId,
  type EdgeId,
  type PlatformId,
  type NodeId,
  type SignalId,
} from '@/types/ids';
import type { Scenario, TimetableEvent } from '@/types/scenario';
import type { TrainDefinition } from '@/types/trains';

const sid = (s: string) => asId<ScenarioId>(s);
const tid = (s: string) => asId<TrainId>(s);
const eid = (s: string) => asId<EdgeId>(s);
const pid = (s: string) => asId<PlatformId>(s);
const nid = (s: string) => asId<NodeId>(s);
const sgid = (s: string) => asId<SignalId>(s);

const makeTrain = (id: string, _at: number): TrainDefinition => ({
  id: tid(id),
  label: id,
  lengthMeters: 200,
  maxSpeedKmh: 160,
  speedSectionsPerTick: 1,
  entryEdgeId: eid(`E_in_${id}`),
  exitEdgeId: eid(`E_out_${id}`),
});

const makeScenario = (overrides: Partial<Scenario> = {}): Scenario => ({
  id: sid('tutorial'),
  name: 'Tutorial',
  infrastructure: { path: '../infrastructure/tutorial.json' },
  trains: [],
  timetable: [],
  objectives: [],
  startSimTime: 480,
  endSimTime: 540,
  ...overrides,
});

describe('ScenarioService — registration', () => {
  it('starts empty', () => {
    const s = new ScenarioService();
    expect(s.size()).toBe(0);
    expect(s.getAll()).toEqual([]);
  });

  it('registers a scenario', () => {
    const s = new ScenarioService();
    const r = s.register(makeScenario());
    expect(r.ok).toBe(true);
    expect(s.size()).toBe(1);
  });

  it('accepts an initial list of scenarios in the constructor', () => {
    const s = new ScenarioService({ scenarios: [makeScenario(), makeScenario({ id: sid('alt') })] });
    expect(s.size()).toBe(2);
  });

  it('unregisters a scenario by id', () => {
    const s = new ScenarioService({ scenarios: [makeScenario()] });
    const r = s.unregister(sid('tutorial'));
    expect(r.ok).toBe(true);
    expect(s.size()).toBe(0);
  });

  it('unregister rejects unknown id with SCENARIO_UNKNOWN', () => {
    const s = new ScenarioService();
    const r = s.unregister(sid('NOPE'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(ScenarioReasonCode.UNKNOWN);
    }
  });

  it('unregister of the active scenario ends the scenario', () => {
    const s = new ScenarioService({ scenarios: [makeScenario()] });
    s.start(sid('tutorial'));
    s.unregister(sid('tutorial'));
    expect(s.activeScenario()).toBeNull();
  });
});

describe('ScenarioService — start / end', () => {
  it('start marks a scenario as active', () => {
    const s = new ScenarioService({ scenarios: [makeScenario()] });
    const r = s.start(sid('tutorial'));
    expect(r.ok).toBe(true);
    expect(s.activeScenario()?.id).toBe(sid('tutorial'));
  });

  it('start rejects an unknown id with SCENARIO_UNKNOWN', () => {
    const s = new ScenarioService();
    const r = s.start(sid('NOPE'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(ScenarioReasonCode.UNKNOWN);
    }
  });

  it('end returns the ended scenario and clears the active state', () => {
    const s = new ScenarioService({ scenarios: [makeScenario()] });
    s.start(sid('tutorial'));
    const ended = s.end();
    expect(ended?.id).toBe(sid('tutorial'));
    expect(s.activeScenario()).toBeNull();
  });

  it('end is a no-op when no scenario is active', () => {
    const s = new ScenarioService();
    expect(s.end()).toBeNull();
  });
});

describe('ScenarioService — tick (timetable walk)', () => {
  it('emits a SPAWN_TRAIN command when the timetable is reached', () => {
    const train = makeTrain('IC101', 10);
    const events: TimetableEvent[] = [
      { type: 'SPAWN_TRAIN', atSimTime: 10, train },
    ];
    const s = new ScenarioService({
      scenarios: [makeScenario({ timetable: events })],
    });
    s.start(sid('tutorial'));
    const cmds = s.tick(10);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]?.type).toBe('SPAWN_TRAIN');
    if (cmds[0]?.type === 'SPAWN_TRAIN') {
      expect(cmds[0].train.id).toBe(tid('IC101'));
    }
  });

  it('does not emit a command before the timetable time', () => {
    const train = makeTrain('IC101', 10);
    const events: TimetableEvent[] = [
      { type: 'SPAWN_TRAIN', atSimTime: 10, train },
    ];
    const s = new ScenarioService({
      scenarios: [makeScenario({ timetable: events })],
    });
    s.start(sid('tutorial'));
    expect(s.tick(9)).toEqual([]);
  });

  it('catches up on multiple events in a single tick', () => {
    const t1 = makeTrain('IC101', 5);
    const t2 = makeTrain('IC102', 10);
    const t3 = makeTrain('IC103', 15);
    const events: TimetableEvent[] = [
      { type: 'SPAWN_TRAIN', atSimTime: 5, train: t1 },
      { type: 'SPAWN_TRAIN', atSimTime: 10, train: t2 },
      { type: 'SPAWN_TRAIN', atSimTime: 15, train: t3 },
    ];
    const s = new ScenarioService({
      scenarios: [makeScenario({ timetable: events })],
    });
    s.start(sid('tutorial'));
    const cmds = s.tick(20);
    expect(cmds).toHaveLength(3);
    expect(cmds[0]?.type).toBe('SPAWN_TRAIN');
    expect(cmds[1]?.type).toBe('SPAWN_TRAIN');
    expect(cmds[2]?.type).toBe('SPAWN_TRAIN');
  });

  it('emits events in timetable order even when ticked in larger jumps', () => {
    const t1 = makeTrain('A', 5);
    const t2 = makeTrain('B', 10);
    const events: TimetableEvent[] = [
      { type: 'SPAWN_TRAIN', atSimTime: 5, train: t1 },
      { type: 'SPAWN_TRAIN', atSimTime: 10, train: t2 },
    ];
    const s = new ScenarioService({
      scenarios: [makeScenario({ timetable: events })],
    });
    s.start(sid('tutorial'));
    const cmds = s.tick(10);
    expect(cmds).toHaveLength(2);
    if (cmds[0]?.type === 'SPAWN_TRAIN' && cmds[1]?.type === 'SPAWN_TRAIN') {
      expect(cmds[0].train.id).toBe(tid('A'));
      expect(cmds[1].train.id).toBe(tid('B'));
    }
  });

  it('returns an empty list when no scenario is active', () => {
    const s = new ScenarioService();
    expect(s.tick(100)).toEqual([]);
  });
});

describe('ScenarioService — determinism', () => {
  it('same scenario + same sim-time produces the same command sequence', () => {
    const t1 = makeTrain('A', 5);
    const t2 = makeTrain('B', 10);
    const events: TimetableEvent[] = [
      { type: 'SPAWN_TRAIN', atSimTime: 5, train: t1 },
      { type: 'SPAWN_TRAIN', atSimTime: 10, train: t2 },
    ];
    const run = () => {
      const s = new ScenarioService({
        scenarios: [makeScenario({ timetable: events })],
      });
      s.start(sid('tutorial'));
      const out: string[] = [];
      for (let t = 0; t <= 12; t++) {
        const cmds = s.tick(t);
        for (const c of cmds) {
          if (c.type === 'SPAWN_TRAIN') {
            out.push(`${t}:${c.train.id}`);
          }
        }
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe('ScenarioService — immutability', () => {
  it('timetable is not mutated by tick()', () => {
    const t1 = makeTrain('A', 5);
    const events: TimetableEvent[] = [
      { type: 'SPAWN_TRAIN', atSimTime: 5, train: t1 },
    ];
    const s = new ScenarioService({
      scenarios: [makeScenario({ timetable: events })],
    });
    s.start(sid('tutorial'));
    const before = s.get(sid('tutorial'))!.timetable;
    s.tick(100);
    const after = s.get(sid('tutorial'))!.timetable;
    expect(after).toBe(before);
  });
});

// Use the unused imports to satisfy the linter.
void pid;
void nid;
void sgid;

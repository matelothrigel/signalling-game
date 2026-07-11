import { describe, it, expect } from 'vitest';
import { assertNever } from '../result';
import type { Command } from '../commands';
import type { Event } from '../events';
import {
  asId,
  type SwitchId,
  type SignalId,
  type RouteId,
  type ScenarioId,
  type EdgeId,
  type TrainId,
  type NodeId,
  type ObjectiveId,
} from '../ids';

/**
 * Compile-time + runtime exhaustiveness check.
 *
 * The functions below switch over every variant of Command/Event.
 * If a new variant is added to either union without a corresponding
 * case, TypeScript will report an error in the `default:` branch
 * (the `assertNever` call requires a `never` argument).
 *
 * At runtime, we only need to verify the functions run without
 * throwing for the cases that are actually present.
 */

const handleCommand = (cmd: Command): string => {
  switch (cmd.type) {
    case 'SET_ROUTE':
      return `route ${cmd.origin}->${cmd.destination}`;
    case 'CANCEL_ROUTE':
      return `cancel ${cmd.routeId}`;
    case 'CHANGE_SWITCH':
      return `switch ${cmd.switchId}=${cmd.position}`;
    case 'START_SCENARIO':
      return `start ${cmd.scenarioId}`;
    case 'END_SCENARIO':
      return 'end';
    case 'PAUSE_SIMULATION':
      return 'pause';
    case 'RESUME_SIMULATION':
      return 'resume';
    case 'SET_TICK_RATE':
      return `rate=${cmd.hz}`;
    case 'TICK_NOW':
      return 'tick';
    case 'SPAWN_TRAIN':
      return `spawn ${cmd.train.id}`;
    case 'DISPATCH_TRAIN':
      return `dispatch ${cmd.trainId}`;
    case 'TRAIN_DISPATCH':
      return `dispatch ${cmd.trainId} via ${cmd.exitEdgeId}`;
    default:
      return assertNever(cmd);
  }
};

const handleEvent = (e: Event): string => {
  switch (e.type) {
    case 'TIME_TICK':
      return `t=${e.simTime}`;
    case 'TRAIN_ENTERED_SECTION':
      return `in ${e.trainId}->${e.sectionId}`;
    case 'TRAIN_LEFT_SECTION':
      return `out ${e.trainId}<-${e.sectionId}`;
    case 'TRAIN_REQUESTED_ENTRY':
      return `req ${e.trainId}@${e.entryEdgeId}`;
    case 'TRAIN_DEPARTED':
      return `dep ${e.trainId}`;
    case 'SIGNAL_ASPECT_CHANGED':
      return `sig ${e.signalId}=${e.aspect} (${e.fromAspect}→${e.aspect})`;
    case 'SWITCH_MOVED':
      return `sw ${e.switchId}=${e.position}`;
    case 'ROUTE_SET':
      return `rset ${e.routeId}`;
    case 'ROUTE_RELEASED':
      return `rrel ${e.routeId}`;
    case 'OBJECTIVE_COMPLETED':
      return `obj ${e.objectiveId}`;
    case 'SCENARIO_STARTED':
      return `scen+ ${e.scenarioId}`;
    case 'SCENARIO_ENDED':
      return `scen- ${e.scenarioId}`;
    case 'LOG':
      return `log[${e.level}] ${e.message}`;
    default:
      return assertNever(e);
  }
};

describe('Command exhaustiveness', () => {
  it('handles all current command variants', () => {
    expect(
      handleCommand({
        type: 'SET_ROUTE',
        origin: asId<SignalId>('S1'),
        destination: asId<SignalId>('S2'),
      }),
    ).toBe('route S1->S2');
    expect(
      handleCommand({ type: 'CANCEL_ROUTE', routeId: asId<RouteId>('R1') }),
    ).toBe('cancel R1');
    expect(
      handleCommand({
        type: 'CHANGE_SWITCH',
        switchId: asId<SwitchId>('SW1'),
        position: 'reverse',
      }),
    ).toBe('switch SW1=reverse');
    expect(
      handleCommand({ type: 'START_SCENARIO', scenarioId: asId<ScenarioId>('tut') }),
    ).toBe('start tut');
    expect(handleCommand({ type: 'END_SCENARIO' })).toBe('end');
    expect(handleCommand({ type: 'PAUSE_SIMULATION' })).toBe('pause');
    expect(handleCommand({ type: 'RESUME_SIMULATION' })).toBe('resume');
    expect(handleCommand({ type: 'SET_TICK_RATE', hz: 2 })).toBe('rate=2');
    expect(handleCommand({ type: 'TICK_NOW' })).toBe('tick');
    expect(
      handleCommand({
        type: 'SPAWN_TRAIN',
        train: {
          id: asId<TrainId>('T1'),
          label: 'T1',
          lengthMeters: 200,
          maxSpeedKmh: 160,
          speedSectionsPerTick: 1,
          entryEdgeId: asId<EdgeId>('E_in'),
          exitEdgeId: asId<EdgeId>('E_out'),
        },
      }),
    ).toBe('spawn T1');
    expect(
      handleCommand({ type: 'DISPATCH_TRAIN', trainId: asId<TrainId>('T1') }),
    ).toBe('dispatch T1');
    expect(
      handleCommand({
        type: 'TRAIN_DISPATCH',
        trainId: asId<TrainId>('IC101'),
        exitEdgeId: asId<EdgeId>('E_out'),
      }),
    ).toBe('dispatch IC101 via E_out');
  });
});

describe('Event exhaustiveness', () => {
  it('handles all current event variants', () => {
    expect(handleEvent({ type: 'TIME_TICK', simTime: 5 })).toBe('t=5');
    expect(
      handleEvent({
        type: 'TRAIN_ENTERED_SECTION',
        trainId: asId<TrainId>('T1'),
        sectionId: asId<NodeId>('SEC1'),
      }),
    ).toBe('in T1->SEC1');
    expect(handleEvent({ type: 'OBJECTIVE_COMPLETED', objectiveId: asId<ObjectiveId>('O1') })).toBe(
      'obj O1',
    );
  });
});

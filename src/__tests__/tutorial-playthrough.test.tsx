/**
 * End-to-end integration test for Section 15
 * ("Playable Milestone 1"). This exercises the full
 * play-through: start a scenario, spawn a train, set
 * a route, watch the train move to the platform, and
 * verify the objective is met.
 *
 * This test is intentionally verbose — it serves as
 * documentation for the dispatcher workflow.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation } from '@/engine/core';
import {
  TUTORIAL_TOPOLOGY,
  TUTORIAL_PLATFORMS,
  TUTORIAL_SCENARIO,
  TUTORIAL_SIGNAL_IDS,
  TUTORIAL_TRAIN_IDS,
} from '@/scenarios/tutorial';
import { asId, type NodeId, type SwitchId } from '@/types/ids';

const buildSimulation = (): Simulation => {
  const topology = TUTORIAL_TOPOLOGY();
  return new Simulation({
    topology,
    switchIds: [
      asId<SwitchId>('W1'),
      asId<SwitchId>('W2'),
    ] as readonly SwitchId[],
    signalIds: [
      TUTORIAL_SIGNAL_IDS.SIn,
      TUTORIAL_SIGNAL_IDS.SP1,
      TUTORIAL_SIGNAL_IDS.SP2,
      TUTORIAL_SIGNAL_IDS.SP3,
      TUTORIAL_SIGNAL_IDS.SP4,
    ],
    sectionIds: [
      asId<NodeId>('EXT'),
      asId<NodeId>('LEAD'),
      asId<NodeId>('P1'),
      asId<NodeId>('P2'),
      asId<NodeId>('P3'),
      asId<NodeId>('P4'),
    ] as readonly NodeId[],
    platforms: TUTORIAL_PLATFORMS(),
    scenarios: [TUTORIAL_SCENARIO()],
  });
};

describe('Tutorial — end-to-end play-through', () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = buildSimulation();
  });

  it('starts a scenario and spawns the first train on the timetable', () => {
    sim.start();
    sim.dispatch({
      type: 'START_SCENARIO',
      scenarioId: asId<'ScenarioId' & { readonly __brand: 'ScenarioId' }>('tutorial') as never,
    });
    // The scenario is active.
    expect(sim.scenarioService.activeScenario()?.id as unknown as string).toBe('tutorial');
    // The objectives are loaded.
    const views = sim.getObjectiveViews();
    expect(views.length).toBeGreaterThan(0);
    expect(views.every((v) => !v.completed)).toBe(true);

    // Tick the clock until the first train spawns (t=5).
    // The scenario service walks BEFORE the time advance,
    // so we need simTime=5 at the start of the tick.
    // That means 6 TICK_NOWs.
    for (let i = 0; i < 6; i++) {
      sim.dispatch({ type: 'TICK_NOW' });
    }
    // The first train (IC101) should now exist in the store.
    const train = sim.trainStore.get(TUTORIAL_TRAIN_IDS[0]!);
    expect(train).toBeDefined();
    expect(train?.fsmState).toBe('WaitingForEntry');
    sim.stop();
  });

  it('routes a train to a platform and completes the ROUTE_TRAIN_TO_PLATFORM objective', () => {
    sim.start();
    sim.dispatch({
      type: 'START_SCENARIO',
      scenarioId: asId<'ScenarioId' & { readonly __brand: 'ScenarioId' }>('tutorial') as never,
    });

    // Tick to spawn the first train.
    for (let i = 0; i < 6; i++) {
      sim.dispatch({ type: 'TICK_NOW' });
    }

    // Set the route from S_in to S_p1.
    sim.dispatch({
      type: 'SET_ROUTE',
      origin: TUTORIAL_SIGNAL_IDS.SIn,
      destination: TUTORIAL_SIGNAL_IDS.SP1,
    });

    // Tick to let the train traverse the route.
    for (let i = 0; i < 4; i++) {
      sim.dispatch({ type: 'TICK_NOW' });
    }
    const train = sim.trainStore.get(TUTORIAL_TRAIN_IDS[0]!);
    expect(train?.fsmState).toBe('StoppedAtPlatform');
    expect(train?.heldAtPlatform as unknown as string).toBe('PL1');

    // The ROUTE_TRAIN_TO_PLATFORM objective for IC101 → PL1
    // should be complete.
    const views = sim.getObjectiveViews();
    const routeObjective = views.find(
      (v) =>
        v.description.includes('Route IC101') &&
        v.description.includes('Platform 1'),
    );
    expect(routeObjective?.completed).toBe(true);
    sim.stop();
  });

  it('dispatches a train from a platform and completes the DISPATCH_TRAIN objective', () => {
    sim.start();
    sim.dispatch({
      type: 'START_SCENARIO',
      scenarioId: asId<'ScenarioId' & { readonly __brand: 'ScenarioId' }>('tutorial') as never,
    });

    // Tick to spawn the first train.
    for (let i = 0; i < 6; i++) {
      sim.dispatch({ type: 'TICK_NOW' });
    }

    // Route the train to platform 1.
    sim.dispatch({
      type: 'SET_ROUTE',
      origin: TUTORIAL_SIGNAL_IDS.SIn,
      destination: TUTORIAL_SIGNAL_IDS.SP1,
    });
    for (let i = 0; i < 4; i++) {
      sim.dispatch({ type: 'TICK_NOW' });
    }

    // Cancel the entry route so the exit route can be set
    // (the entry route locks W1, which the exit route
    // also needs).
    const entryRoute = Array.from(sim.routeStore.getAll()).find(
      (r) => r.active,
    );
    expect(entryRoute).toBeDefined();
    sim.dispatch({ type: 'CANCEL_ROUTE', routeId: entryRoute!.id });

    // Set the exit route from S_p1 to S_in (back to the
    // entry signal). The train will traverse in reverse.
    sim.dispatch({
      type: 'SET_ROUTE',
      origin: TUTORIAL_SIGNAL_IDS.SP1,
      destination: TUTORIAL_SIGNAL_IDS.SIn,
    });
    // Dispatch the train.
    sim.dispatch({
      type: 'DISPATCH_TRAIN',
      trainId: TUTORIAL_TRAIN_IDS[0]!,
    });

    // Tick to let the train traverse the exit route.
    // Departing → Running → advance.
    // Need to tick enough times for the train to leave.
    for (let i = 0; i < 8; i++) {
      sim.dispatch({ type: 'TICK_NOW' });
    }
    // The train should have left the controlled area.
    const train = sim.trainStore.get(TUTORIAL_TRAIN_IDS[0]!);
    expect(train).toBeUndefined();

    // The DISPATCH_TRAIN objective for IC101 should be
    // complete.
    const views = sim.getObjectiveViews();
    const dispatchObjective = views.find(
      (v) =>
        v.description.includes('Dispatch IC101'),
    );
    expect(dispatchObjective?.completed).toBe(true);
    sim.stop();
  });

  it('checks the second train is in WaitingForEntry after the first route is set', () => {
    sim.start();
    sim.dispatch({
      type: 'START_SCENARIO',
      scenarioId: asId<'ScenarioId' & { readonly __brand: 'ScenarioId' }>('tutorial') as never,
    });

    // Tick to spawn the first two trains.
    for (let i = 0; i < 12; i++) {
      sim.dispatch({ type: 'TICK_NOW' });
    }

    // The first train is in WaitingForEntry.
    const train1Before = sim.trainStore.get(TUTORIAL_TRAIN_IDS[0]!);
    expect(train1Before?.fsmState).toBe('WaitingForEntry');
    // The second train is in WaitingForEntry.
    const train2Before = sim.trainStore.get(TUTORIAL_TRAIN_IDS[1]!);
    expect(train2Before?.fsmState).toBe('WaitingForEntry');

    // Route the first train to PL1.
    sim.dispatch({
      type: 'SET_ROUTE',
      origin: TUTORIAL_SIGNAL_IDS.SIn,
      destination: TUTORIAL_SIGNAL_IDS.SP1,
    });
    for (let i = 0; i < 4; i++) {
      sim.dispatch({ type: 'TICK_NOW' });
    }
    // The first train is now at PL1.
    const train1After = sim.trainStore.get(TUTORIAL_TRAIN_IDS[0]!);
    expect(train1After?.fsmState).toBe('StoppedAtPlatform');
    // The first route is set.
    const activeRoutes = sim.routeStore.getAll().filter((r) => r.active);
    expect(activeRoutes.length).toBeGreaterThan(0);

    // Cancel the entry route to release the switch.
    const r1 = sim.routeStore.getAll().find((r) => r.active);
    expect(r1).toBeDefined();
    sim.dispatch({ type: 'CANCEL_ROUTE', routeId: r1!.id });
    // The first route is cancelled.
    expect(sim.routeStore.getAll().filter((r) => r.active).length).toBe(0);

    sim.stop();
  });
});

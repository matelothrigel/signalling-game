import { describe, it, expect } from 'vitest';
import { useSimulationStore } from '../simulationStore';
import { Simulation } from '@/engine/core';
import { Topology } from '@/engine/topology';
import {
  asId,
  type NodeId,
  type EdgeId,
  type SwitchId,
  type SignalId,
} from '@/types/ids';

const buildMiniTopology = (): Topology => {
  const a = asId<NodeId>('A');
  const b = asId<NodeId>('B');
  const c = asId<NodeId>('C');
  const w1 = asId<NodeId>('W1');
  const entry = asId<SignalId>('ENTRY');
  const exit = asId<SignalId>('EXIT');
  return new Topology({
    nodes: [
      { kind: 'section', id: a, label: 'A' },
      { kind: 'section', id: b, label: 'B' },
      { kind: 'section', id: c, label: 'C' },
      {
        kind: 'switch',
        id: w1,
        legs: [a, b, c],
        legMap: {
          normal: [
            { from: a, to: b },
            { from: b, to: a },
          ],
          reverse: [
            { from: a, to: c },
            { from: c, to: a },
          ],
        },
      },
    ],
    edges: [
      { id: asId<EdgeId>('E_A_W1'), from: a, to: w1, bidirectional: true },
      { id: asId<EdgeId>('E_W1_B'), from: w1, to: b, bidirectional: true },
      { id: asId<EdgeId>('E_B_C'), from: b, to: c, bidirectional: true },
      { id: asId<EdgeId>('E_entry'), from: a, to: w1, bidirectional: true, signalId: entry },
      { id: asId<EdgeId>('E_exit'), from: b, to: c, bidirectional: true, signalId: exit },
    ],
  });
};

describe('simulationStore — integration', () => {
  it('projects the initial state after setEngine', () => {
    const sim = new Simulation({
      topology: buildMiniTopology(),
      switchIds: [asId<SwitchId>('W1')],
      signalIds: [asId<SignalId>('ENTRY'), asId<SignalId>('EXIT')],
      sectionIds: [asId<NodeId>('A'), asId<NodeId>('B'), asId<NodeId>('C')],
    });
    useSimulationStore.getState().setEngine(sim);
    const snap = useSimulationStore.getState().snapshot;
    expect(snap.topology.nodes.length).toBe(4);
    expect(snap.switches.size).toBe(1);
    expect(snap.signals.size).toBe(2);
    expect(snap.sections.size).toBe(3);
    useSimulationStore.getState().detach();
  });

  it('reflects a SET_TICK_RATE command in the snapshot', () => {
    const sim = new Simulation({
      topology: buildMiniTopology(),
      switchIds: [asId<SwitchId>('W1')],
      signalIds: [asId<SignalId>('ENTRY'), asId<SignalId>('EXIT')],
      sectionIds: [asId<NodeId>('A'), asId<NodeId>('B'), asId<NodeId>('C')],
    });
    useSimulationStore.getState().setEngine(sim);
    useSimulationStore.getState().dispatch({ type: 'SET_TICK_RATE', hz: 4 });
    const snap = useSimulationStore.getState().snapshot;
    expect(snap.tickHz).toBe(4);
    useSimulationStore.getState().detach();
  });

  it('captures recent events in the log buffer', () => {
    const sim = new Simulation({
      topology: buildMiniTopology(),
      switchIds: [asId<SwitchId>('W1')],
      signalIds: [asId<SignalId>('ENTRY'), asId<SignalId>('EXIT')],
      sectionIds: [asId<NodeId>('A'), asId<NodeId>('B'), asId<NodeId>('C')],
    });
    useSimulationStore.getState().setEngine(sim);
    useSimulationStore.getState().dispatch({
      type: 'CHANGE_SWITCH',
      switchId: asId<SwitchId>('W1'),
      position: 'reverse',
    });
    const events = useSimulationStore.getState().recentEvents;
    const swMoved = events.find((e) => e.type === 'SWITCH_MOVED');
    expect(swMoved).toBeDefined();
    useSimulationStore.getState().detach();
  });

  it('updates simTime on every tick', () => {
    const sim = new Simulation({
      topology: buildMiniTopology(),
      switchIds: [asId<SwitchId>('W1')],
      signalIds: [asId<SignalId>('ENTRY'), asId<SignalId>('EXIT')],
      sectionIds: [asId<NodeId>('A'), asId<NodeId>('B'), asId<NodeId>('C')],
    });
    useSimulationStore.getState().setEngine(sim);
    expect(useSimulationStore.getState().snapshot.simTime).toBe(0);
    sim.start();
    sim.dispatch({ type: 'TICK_NOW' });
    sim.dispatch({ type: 'TICK_NOW' });
    expect(useSimulationStore.getState().snapshot.simTime).toBe(2);
    sim.stop();
    useSimulationStore.getState().detach();
  });
});

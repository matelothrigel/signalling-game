/**
 * App — top-level React component.
 *
 * Section 15 ("Playable Milestone 1") splits the UI into two
 * views:
 *  - "menu": the `MainMenu` where the user picks a scenario.
 *  - "play": the dispatcher canvas + sidebar + event log.
 *
 * The `Simulation` is constructed once when the user
 * selects a scenario. The store is wired to it via
 * `useSimulationStore.setEngine`. Selection state (signal
 * / switch / train) and the "pending route" arming live
 * in the `App` component and are passed down to the
 * canvas and inspectors.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSimulationStore } from '@/store';
import { Simulation } from '@/engine/core';
import {
  SimulationCanvas,
  CommandToolbar,
  StatusPanel,
  EventLog,
  ScenarioSelector,
  MainMenu,
  type Selection,
} from '@/ui';
import { SignalInspector } from './ui/SignalInspector';
import { SwitchInspector } from './ui/SwitchInspector';
import { TrainInspector } from './ui/TrainInspector';
import {
  asId,
  type NodeId,
  type SwitchId,
  type SignalId,
  type ScenarioId,
} from '@/types/ids';
import type { Scenario } from '@/types/scenario';
import {
  TUTORIAL_TOPOLOGY,
  TUTORIAL_PLATFORMS,
  TUTORIAL_SCENARIO,
} from './scenarios/tutorial';

const TUTORIAL_NODE_IDS: readonly NodeId[] = [
  asId<NodeId>('EXT'),
  asId<NodeId>('LEAD'),
  asId<NodeId>('P1'),
  asId<NodeId>('P2'),
  asId<NodeId>('P3'),
  asId<NodeId>('P4'),
];
const TUTORIAL_SWITCH_IDS: readonly SwitchId[] = [
  asId<SwitchId>('W1'),
  asId<SwitchId>('W2'),
];
const TUTORIAL_SIGNAL_IDS: readonly SignalId[] = [
  asId<SignalId>('S_in'),
  asId<SignalId>('S_p1'),
  asId<SignalId>('S_p2'),
  asId<SignalId>('S_p3'),
  asId<SignalId>('S_p4'),
];

export const App = (): JSX.Element => {
  const setEngine = useSimulationStore((s) => s.setEngine);
  const detach = useSimulationStore((s) => s.detach);
  const start = useSimulationStore((s) => s.dispatch);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [pendingRouteFrom, setPendingRouteFrom] = useState<SignalId | null>(null);

  // The simulation is constructed once per scenario. The
  // store keeps a reference to it; `setEngine` subscribes
  // the store to the engine's event stream.
  const engine = useMemo<Simulation | null>(() => {
    if (scenario === null) return null;
    const topology = TUTORIAL_TOPOLOGY();
    return new Simulation({
      topology,
      switchIds: TUTORIAL_SWITCH_IDS,
      signalIds: TUTORIAL_SIGNAL_IDS,
      sectionIds: TUTORIAL_NODE_IDS,
      platforms: TUTORIAL_PLATFORMS(),
      scenarios: [scenario],
    });
  }, [scenario]);

  useEffect(() => {
    if (engine === null) return;
    setEngine(engine, TUTORIAL_PLATFORMS());
    setIsStarted(false);
    return () => {
      detach();
    };
  }, [engine, setEngine, detach]);

  if (engine === null || scenario === null) {
    return (
      <MainMenu
        scenarios={[TUTORIAL_SCENARIO()]}
        onStart={(s) => {
          setScenario(s);
        }}
      />
    );
  }

  return (
    <div className="app-root">
      <CommandToolbar
        isStarted={isStarted}
        onStart={() => {
          if (!isStarted) {
            engine.start();
            setIsStarted(true);
          } else {
            engine.stop();
            setIsStarted(false);
          }
        }}
        onTickNow={() => start({ type: 'TICK_NOW' })}
        onPause={() => start({ type: 'PAUSE_SIMULATION' })}
        onResume={() => start({ type: 'RESUME_SIMULATION' })}
        onBackToMenu={() => {
          setScenario(null);
        }}
      />
      <div className="app-body">
        <div className="app-canvas">
          <SimulationCanvas
            selection={selection}
            pendingRouteFrom={pendingRouteFrom}
            onSelect={setSelection}
          />
          {selection?.kind === 'signal' ? (
            <div className="canvas-overlay top-right">
              <SignalInspector
                signalId={selection.id}
                pendingRouteFrom={pendingRouteFrom}
                onSetRouteFromHere={() => setPendingRouteFrom(selection.id)}
                onClose={() => {
                  setSelection(null);
                  setPendingRouteFrom(null);
                }}
              />
            </div>
          ) : selection?.kind === 'switch' ? (
            <div className="canvas-overlay top-right">
              <SwitchInspector
                switchId={selection.id}
                onClose={() => setSelection(null)}
              />
            </div>
          ) : selection?.kind === 'train' ? (
            <div className="canvas-overlay top-right">
              <TrainInspector
                trainId={selection.id}
                onClose={() => setSelection(null)}
              />
            </div>
          ) : null}
          {pendingRouteFrom !== null ? (
            <div className="canvas-overlay top-left">
              <div className="route-arm-banner">
                Set route: click an exit signal (from{' '}
                {pendingRouteFrom as unknown as string}).{' '}
                <button
                  type="button"
                  className="command-button"
                  onClick={() => setPendingRouteFrom(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="app-sidebar">
          <ScenarioSelector
            scenarios={[scenario]}
            onStartScenario={() => {
              start({
                type: 'START_SCENARIO',
                scenarioId: scenario.id as unknown as ScenarioId,
              });
            }}
            onEndScenario={() => start({ type: 'END_SCENARIO' })}
          />
          <StatusPanel />
        </div>
      </div>
      <EventLog />
    </div>
  );
};

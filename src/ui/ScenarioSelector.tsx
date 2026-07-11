/**
 * ScenarioSelector — small UI to start / end the active
 * scenario. Pure UI: dispatches `START_SCENARIO` and
 * `END_SCENARIO` through the store.
 *
 * Section 15: the parent provides the registered
 * scenarios. The selector picks one (or uses the only
 * one) and dispatches `START_SCENARIO`. The actual
 * start of the train motion is driven by the engine's
 * tick loop.
 */

import { useSimulationStore } from '@/store';
import { useState, useEffect } from 'react';
import type { Scenario } from '@/types/scenario';

export interface ScenarioSelectorProps {
  readonly scenarios: readonly Scenario[];
  readonly onStartScenario?: (scenario: Scenario) => void;
  readonly onEndScenario?: () => void;
}

export const ScenarioSelector = ({
  scenarios,
  onStartScenario,
  onEndScenario,
}: ScenarioSelectorProps): JSX.Element => {
  const dispatch = useSimulationStore((s) => s.dispatch);
  const activeScenario = useSimulationStore((s) => {
    const id = s.snapshot.activeScenarioId;
    if (id === null) return null;
    return s.snapshot.scenarios.get(id) ?? null;
  });
  const [selected, setSelected] = useState<string | null>(
    scenarios[0] !== undefined ? (scenarios[0].id as unknown as string) : null,
  );

  useEffect(() => {
    if (selected === null && scenarios[0] !== undefined) {
      setSelected(scenarios[0].id as unknown as string);
    }
  }, [selected, scenarios]);

  const handleStart = () => {
    if (selected === null) return;
    dispatch({
      type: 'START_SCENARIO',
      scenarioId: selected as never,
    });
    if (onStartScenario) {
      const scenario = scenarios.find(
        (s) => (s.id as unknown as string) === selected,
      );
      if (scenario) onStartScenario(scenario);
    }
  };

  const handleEnd = () => {
    dispatch({ type: 'END_SCENARIO' });
    if (onEndScenario) onEndScenario();
  };

  return (
    <div className="scenario-selector">
      <h2 className="scenario-selector-title">Scenarios</h2>
      <select
        className="scenario-selector-dropdown"
        value={selected ?? ''}
        onChange={(e) => setSelected(e.target.value)}
        size={Math.min(5, Math.max(2, scenarios.length))}
      >
        {scenarios.map((s) => (
          <option key={s.id} value={s.id as unknown as string}>
            {s.name}
          </option>
        ))}
      </select>
      <div className="scenario-selector-buttons">
        <button
          type="button"
          className="command-button"
          disabled={selected === null}
          onClick={handleStart}
        >
          Start
        </button>
        <button
          type="button"
          className="command-button"
          disabled={activeScenario === null}
          onClick={handleEnd}
        >
          End
        </button>
      </div>
    </div>
  );
};

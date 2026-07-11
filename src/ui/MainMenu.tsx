/**
 * MainMenu — the entry point of the application.
 *
 * Section 15 ("Playable Milestone 1") introduces a
 * main menu before the simulation starts. The user picks
 * a scenario (currently: only the tutorial), the engine
 * is constructed, the store is wired, and the app
 * transitions to the "play" view.
 *
 * The menu is **pure UI**: it receives a list of scenarios
 * and a callback. The App owns the engine, the store,
 * and the "play" view.
 */

import { useState } from 'react';
import type { Scenario } from '@/types/scenario';

export interface MainMenuScenarioEntry {
  readonly scenario: Scenario;
  readonly onStart: (scenario: Scenario) => void;
}

export interface MainMenuProps {
  readonly scenarios: readonly Scenario[];
  readonly onStart: (scenario: Scenario) => void;
}

export const MainMenu = ({
  scenarios,
  onStart,
}: MainMenuProps): JSX.Element => {
  const [selected, setSelected] = useState<string | null>(
    scenarios[0] !== undefined ? (scenarios[0].id as unknown as string) : null,
  );

  return (
    <div className="main-menu">
      <div className="main-menu-content">
        <h1 className="main-menu-title">Railway Traffic Control Simulator</h1>
        <p className="main-menu-subtitle">
          Section 15 — Playable Milestone 1
        </p>

        <div className="main-menu-section">
          <h2 className="main-menu-section-title">Available scenarios</h2>
          {scenarios.length === 0 ? (
            <div className="main-menu-empty">No scenarios registered</div>
          ) : (
            <ul className="main-menu-scenarios">
              {scenarios.map((s) => (
                <li
                  key={s.id}
                  className={
                    selected === (s.id as unknown as string)
                      ? 'main-menu-scenario selected'
                      : 'main-menu-scenario'
                  }
                  onClick={() => setSelected(s.id as unknown as string)}
                >
                  <span className="main-menu-scenario-name">{s.name}</span>
                  <span className="main-menu-scenario-id">{s.id}</span>
                  <span className="main-menu-scenario-detail">
                    {s.trains.length} trains · {s.objectives.length} objectives
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="main-menu-actions">
          <button
            type="button"
            className="command-button start"
            disabled={selected === null}
            onClick={() => {
              if (selected === null) return;
              const scenario = scenarios.find(
                (s) => (s.id as unknown as string) === selected,
              );
              if (scenario) onStart(scenario);
            }}
          >
            Start scenario
          </button>
        </div>

        <div className="main-menu-help">
          <h2 className="main-menu-section-title">Quick help</h2>
          <ul className="main-menu-help-list">
            <li>
              Click a signal to inspect it. Use "Set route from here",
              then click another signal to set the route.
            </li>
            <li>
              Click a switch to toggle it (if it is not locked).
            </li>
            <li>
              Trains spawn on the timetable. Set a route to bring
              them into a platform; click the held train and press
              "Dispatch" to send it back out.
            </li>
            <li>
              Watch the Objectives panel in the sidebar. The
              tutorial is complete when every objective is checked.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

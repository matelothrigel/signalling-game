/**
 * CommandToolbar — the top bar with clock controls and
 * a tick-now button. Pure UI: dispatches commands
 * through the store.
 *
 * Section 15: a "Main menu" button returns the user to the
 * start screen.
 */

import { useSimulationStore } from '@/store';

export interface CommandToolbarProps {
  readonly isStarted: boolean;
  readonly onStart: () => void;
  readonly onTickNow: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onBackToMenu?: () => void;
}

export const CommandToolbar = ({
  isStarted,
  onStart,
  onTickNow,
  onPause,
  onResume,
  onBackToMenu,
}: CommandToolbarProps): JSX.Element => {
  const snapshot = useSimulationStore((s) => s.snapshot);
  return (
    <div className="command-toolbar">
      <div className="command-toolbar-left">
        <h1 className="command-toolbar-title">Railway Traffic Control Simulator</h1>
        <span className="command-toolbar-subtitle">
          {snapshot.activeScenarioId !== null
            ? `Scenario: ${snapshot.activeScenarioId as unknown as string}`
            : 'Sections 11–15 — Playable Milestone 1'}
        </span>
      </div>
      <div className="command-toolbar-status">
        <div className="status-pill">
          <span className="status-pill-label">sim time</span>
          <span className="status-pill-value">{snapshot.simTime}</span>
        </div>
        <div className="status-pill">
          <span className="status-pill-label">tick rate</span>
          <span className="status-pill-value">{snapshot.tickHz} Hz</span>
        </div>
        <div className="status-pill">
          <span className="status-pill-label">paused</span>
          <span className="status-pill-value">{snapshot.paused ? 'yes' : 'no'}</span>
        </div>
      </div>
      <div className="command-toolbar-buttons">
        <button
          type="button"
          onClick={onStart}
          className={`command-button ${isStarted ? 'stop' : 'start'}`}
        >
          {isStarted ? 'Stop' : 'Start'}
        </button>
        <button type="button" onClick={onTickNow} className="command-button">
          Tick
        </button>
        <button type="button" onClick={onPause} className="command-button">
          Pause
        </button>
        <button type="button" onClick={onResume} className="command-button">
          Resume
        </button>
        {onBackToMenu && (
          <button
            type="button"
            onClick={onBackToMenu}
            className="command-button"
          >
            Main menu
          </button>
        )}
      </div>
    </div>
  );
};

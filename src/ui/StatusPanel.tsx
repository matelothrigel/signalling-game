/**
 * StatusPanel — the right-hand panel showing the
 * currently active scenario, the list of active
 * routes, the list of trains with their FSM
 * state, and the scenario objectives. Pure UI:
 * reads everything from the store.
 */

import { useSimulationStore } from '@/store';
import type { TrainFsmState } from '@/engine/trains';

const stateColor = (state: TrainFsmState): string => {
  switch (state) {
    case 'Running':
    case 'Entering':
    case 'ApproachingSignal':
    case 'Departing':
      return '#4ec9b0';
    case 'StoppedAtSignal':
    case 'LeavingControlledArea':
      return '#c0a020';
    case 'StoppedAtPlatform':
      return '#a060c0';
    case 'Finished':
    case 'WaitingForEntry':
    default:
      return '#808080';
  }
};

export const StatusPanel = (): JSX.Element => {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const activeScenario = snapshot.activeScenarioId
    ? snapshot.scenarios.get(snapshot.activeScenarioId)
    : null;
  const routes = Array.from(snapshot.routes.values());
  const trains = Array.from(snapshot.trains.values());
  const objectives = snapshot.objectives;
  const completedCount = objectives.filter((o) => o.completed).length;
  return (
    <div className="status-panel">
      <div className="status-section">
        <h2 className="status-section-title">Scenario</h2>
        {activeScenario ? (
          <div className="status-row">
            <span className="status-row-label">{activeScenario.name}</span>
            <span className="status-row-value">{snapshot.activeScenarioId}</span>
          </div>
        ) : (
          <div className="status-empty">No scenario active</div>
        )}
      </div>

      <div className="status-section">
        <h2 className="status-section-title">
          Objectives ({completedCount}/{objectives.length})
        </h2>
        {objectives.length === 0 ? (
          <div className="status-empty">No objectives</div>
        ) : (
          <ul className="status-objectives">
            {objectives.map((o) => (
              <li
                key={o.id}
                className={
                  o.completed
                    ? 'status-objective complete'
                    : 'status-objective'
                }
              >
                <span
                  className="status-objective-marker"
                  style={{
                    color: o.completed ? '#20c060' : '#808080',
                  }}
                >
                  {o.completed ? '✓' : '○'}
                </span>
                <span className="status-objective-desc">
                  {o.description}
                </span>
                {o.completedAtSimTime !== null && (
                  <span className="status-objective-time">
                    @t={o.completedAtSimTime}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="status-section">
        <h2 className="status-section-title">Active routes ({routes.length})</h2>
        {routes.length === 0 ? (
          <div className="status-empty">No active routes</div>
        ) : (
          <ul className="status-list">
            {routes.map((r) => (
              <li key={r.id} className="status-list-item">
                <span className="status-list-id">{r.id}</span>
                <span className="status-list-detail">
                  {r.entrySignalId} → {r.exitSignalId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="status-section">
        <h2 className="status-section-title">Trains ({trains.length})</h2>
        {trains.length === 0 ? (
          <div className="status-empty">No trains in the controlled area</div>
        ) : (
          <ul className="status-list">
            {trains.map((t) => (
              <li key={t.id} className="status-list-item">
                <span className="status-list-id">{t.id}</span>
                <span
                  className="status-list-detail"
                  style={{ color: stateColor(t.fsmState) }}
                >
                  {t.fsmState}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

/**
 * EventLog — bottom strip showing the most recent
 * engine events. Pure UI: reads from the store's
 * `recentEvents` buffer (capped).
 */

import { useSimulationStore } from '@/store';
import type { LogLevel } from '@/types/primitives';

const levelColor = (level: LogLevel): string => {
  switch (level) {
    case 'error':
      return '#c02020';
    case 'warning':
      return '#c0a020';
    case 'debug':
      return '#808080';
    case 'info':
    default:
      return '#e0e0e0';
  }
};

const formatEvent = (e: import('@/types/events').Event): string => {
  switch (e.type) {
    case 'TIME_TICK':
      return `tick t=${e.simTime}`;
    case 'TRAIN_ENTERED_SECTION':
      return `train ${e.trainId} → section ${e.sectionId}`;
    case 'TRAIN_LEFT_SECTION':
      return `train ${e.trainId} ← section ${e.sectionId}`;
    case 'TRAIN_REQUESTED_ENTRY':
      return `train ${e.trainId} requested entry @ ${e.entryEdgeId}`;
    case 'TRAIN_DEPARTED':
      return `train ${e.trainId} departed`;
    case 'SIGNAL_ASPECT_CHANGED':
      return `signal ${e.signalId} → ${e.aspect}`;
    case 'SWITCH_MOVED':
      return `switch ${e.switchId} → ${e.position}`;
    case 'ROUTE_SET':
      return `route ${e.routeId} set`;
    case 'ROUTE_RELEASED':
      return `route ${e.routeId} released`;
    case 'OBJECTIVE_COMPLETED':
      return `objective ${e.objectiveId} completed`;
    case 'SCENARIO_STARTED':
      return `scenario ${e.scenarioId} started`;
    case 'SCENARIO_ENDED':
      return `scenario ${e.scenarioId} ended`;
    case 'LOG':
      return e.message;
    default:
      return `unknown: ${JSON.stringify(e)}`;
  }
};

export const EventLog = (): JSX.Element => {
  const events = useSimulationStore((s) => s.recentEvents);
  // Show the most recent first, with a cap on the visible
  // rows. The store already caps the buffer.
  const recent = events.slice(-50).reverse();
  return (
    <div className="event-log">
      <h2 className="event-log-title">Event log ({events.length})</h2>
      <ul className="event-log-list">
        {recent.map((e, i) => (
          <li
            key={events.length - i}
            className="event-log-item"
            style={{
              color:
                e.type === 'LOG'
                  ? levelColor(e.level)
                  : '#e0e0e0',
            }}
          >
            {formatEvent(e)}
          </li>
        ))}
      </ul>
    </div>
  );
};

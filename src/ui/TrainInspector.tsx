/**
 * TrainInspector — popover for a selected train. The
 * dispatcher can release a train held at a platform
 * (`DISPATCH_TRAIN`). Other actions are placeholders
 * for future sections.
 */

import { useSimulationStore } from '@/store';
import type { TrainId } from '@/types/ids';

export interface TrainInspectorProps {
  readonly trainId: TrainId;
  readonly onClose: () => void;
}

export const TrainInspector = ({
  trainId,
  onClose,
}: TrainInspectorProps): JSX.Element | null => {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const dispatch = useSimulationStore((s) => s.dispatch);
  const train = snapshot.trains.get(trainId);
  if (!train) return null;
  const canDispatch = train.fsmState === 'StoppedAtPlatform';

  return (
    <div className="train-inspector">
      <div className="signal-inspector-header">
        <span className="signal-inspector-id">{trainId}</span>
        <span
          className="signal-inspector-aspect"
          style={{ color: stateColor(train.fsmState) }}
        >
          {train.fsmState}
        </span>
        <button
          type="button"
          className="signal-inspector-close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="signal-inspector-body">
        <div className="signal-inspector-row">
          <span className="signal-inspector-label">Edge</span>
          <span className="signal-inspector-value">
            {train.currentEdgeId !== null
              ? (train.currentEdgeId as unknown as string)
              : '—'}
          </span>
        </div>
        <div className="signal-inspector-row">
          <span className="signal-inspector-label">Position t</span>
          <span className="signal-inspector-value">
            {train.edgePosition.toFixed(2)}
          </span>
        </div>
        <div className="signal-inspector-row">
          <span className="signal-inspector-label">Route</span>
          <span className="signal-inspector-value">
            {train.routeId !== null ? (train.routeId as unknown as string) : '—'}
          </span>
        </div>
        <div className="signal-inspector-row">
          <span className="signal-inspector-label">Held at</span>
          <span className="signal-inspector-value">
            {train.heldAtPlatform !== null
              ? (train.heldAtPlatform as unknown as string)
              : '—'}
          </span>
        </div>
        <div className="signal-inspector-actions">
          <button
            type="button"
            className="command-button"
            disabled={!canDispatch}
            onClick={() => dispatch({ type: 'DISPATCH_TRAIN', trainId })}
          >
            Dispatch
          </button>
        </div>
      </div>
    </div>
  );
};

const stateColor = (state: import('@/engine/trains').TrainFsmState): string => {
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

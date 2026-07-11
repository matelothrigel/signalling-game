/**
 * SwitchInspector — popover for a selected switch.
 * Pure UI: dispatches `CHANGE_SWITCH` to toggle the
 * position. The change is denied (with a `LOG` event)
 * by the engine if the switch is locked or occupied.
 */

import { useSimulationStore } from '@/store';
import type { SwitchId } from '@/types/ids';
import type { SwitchPosition } from '@/types/primitives';

export interface SwitchInspectorProps {
  readonly switchId: SwitchId;
  readonly onClose: () => void;
}

export const SwitchInspector = ({
  switchId,
  onClose,
}: SwitchInspectorProps): JSX.Element | null => {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const dispatch = useSimulationStore((s) => s.dispatch);
  const sw = snapshot.switches.get(switchId);
  if (!sw) return null;
  const next: SwitchPosition = sw.position === 'normal' ? 'reverse' : 'normal';
  const locked = sw.lifecycle === 'locked' || sw.lifecycle === 'occupied';

  return (
    <div className="switch-inspector">
      <div className="signal-inspector-header">
        <span className="signal-inspector-id">{switchId}</span>
        <span className="signal-inspector-aspect">{sw.position.toUpperCase()}</span>
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
          <span className="signal-inspector-label">Lifecycle</span>
          <span className="signal-inspector-value">{sw.lifecycle}</span>
        </div>
        <div className="signal-inspector-row">
          <span className="signal-inspector-label">Locked by</span>
          <span className="signal-inspector-value">
            {sw.lockedBy !== null ? (sw.lockedBy as unknown as string) : '—'}
          </span>
        </div>
        <div className="signal-inspector-actions">
          <button
            type="button"
            className="command-button"
            disabled={locked}
            onClick={() =>
              dispatch({
                type: 'CHANGE_SWITCH',
                switchId,
                position: next,
              })
            }
          >
            Move to {next}
          </button>
        </div>
      </div>
    </div>
  );
};

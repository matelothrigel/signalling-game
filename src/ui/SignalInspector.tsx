/**
 * SignalInspector — the popover shown when the
 * dispatcher selects a signal. Pure UI: reads the
 * signal state from the snapshot, dispatches
 * `SET_ROUTE` when the user picks a second signal,
 * and dispatches `CANCEL_ROUTE` for the route the
 * signal belongs to.
 *
 * Route setting flow:
 *  1. User clicks signal A (entry).
 *  2. Inspector opens for A. The "Set route from here"
 *     button arms the selection; the canvas stores A
 *     in `pendingRouteFrom`.
 *  3. User clicks signal B (exit). The canvas calls
 *     `dispatch({ type: 'SET_ROUTE', origin: A, destination: B })`.
 *  4. On success, the entry signal A becomes `proceed`
 *     and the inspector closes.
 */

import { useSimulationStore } from '@/store';
import type { SignalId, RouteId } from '@/types/ids';

export interface SignalInspectorProps {
  readonly signalId: SignalId;
  /** When set, the next signal click sets a route from `from` to the clicked signal. */
  readonly pendingRouteFrom: SignalId | null;
  readonly onSetRouteFromHere: () => void;
  readonly onClose: () => void;
}

export const SignalInspector = ({
  signalId,
  pendingRouteFrom,
  onSetRouteFromHere,
  onClose,
}: SignalInspectorProps): JSX.Element | null => {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const dispatch = useSimulationStore((s) => s.dispatch);
  const signal = snapshot.signals.get(signalId);
  if (!signal) return null;
  const aspectLabel = signal.aspect.toUpperCase();
  const controllingRoute: RouteId | null = signal.controlledBy;
  const route = controllingRoute !== null ? snapshot.routes.get(controllingRoute) : null;

  // The current block has whatever train occupies the
  // section the signal guards.
  const edge = snapshot.topology.edges.find(
    (e) => (e.signalId as unknown as string) === (signalId as unknown as string),
  );
  const blockSectionId = edge?.to;
  const blockTrain =
    blockSectionId !== undefined
      ? Array.from(snapshot.trains.values()).find(
          (t) => t.currentEdgeId !== null && edge !== undefined && (t.currentEdgeId as unknown as string) === (edge.id as unknown as string),
        )
      : undefined;

  return (
    <div className="signal-inspector">
      <div className="signal-inspector-header">
        <span className="signal-inspector-id">{signalId}</span>
        <span
          className="signal-inspector-aspect"
          style={{
            color:
              signal.aspect === 'proceed'
                ? '#20c060'
                : signal.aspect === 'stop'
                  ? '#c02020'
                  : '#c0a020',
          }}
        >
          {aspectLabel}
        </span>
        <button
          type="button"
          className="signal-inspector-close"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {/*
        Read-only indicator lights, not controls: in this engine
        the aspect is computed by the interlocking from route and
        occupancy state (see ARCHITECTURE §7) — a dispatcher can't
        force an aspect directly, so unlike a real physical panel
        these aren't buttons. "C" (caution / preliminary caution)
        is greyed out because the engine only models a two-aspect
        stop/proceed signal today; a genuine multi-aspect model
        needs interlocking changes, not just a paint job here.
      */}
      <div className="signal-inspector-aspect-lights">
        <div
          className={`signal-aspect-light ${signal.aspect === 'stop' ? 'lit-danger' : ''}`}
          title="Danger (stop)"
        >
          D
        </div>
        <div
          className="signal-aspect-light unsupported"
          title="Caution — not modelled by this engine yet (two-aspect signalling only)"
        >
          C
        </div>
        <div
          className={`signal-aspect-light ${signal.aspect === 'proceed' ? 'lit-proceed' : ''}`}
          title="Proceed"
        >
          P
        </div>
      </div>
      <div className="signal-inspector-auto-tag">Auto — engine controlled</div>

      <div className="signal-inspector-body">
        <div className="signal-inspector-row">
          <span className="signal-inspector-label">Block</span>
          <span className="signal-inspector-value">
            {blockSectionId !== undefined ? (blockSectionId as unknown as string) : '—'}
          </span>
        </div>
        <div className="signal-inspector-row">
          <span className="signal-inspector-label">Train in block</span>
          <span className="signal-inspector-value">
            {blockTrain ? (blockTrain.id as unknown as string) : 'none'}
          </span>
        </div>
        <div className="signal-inspector-row">
          <span className="signal-inspector-label">Route</span>
          <span className="signal-inspector-value">
            {route ? (route.id as unknown as string) : 'none'}
          </span>
        </div>

        <div className="signal-inspector-actions">
          <button
            type="button"
            className="command-button"
            onClick={onSetRouteFromHere}
            disabled={pendingRouteFrom !== null}
          >
            {pendingRouteFrom !== null
              ? `Pick exit (from ${pendingRouteFrom as unknown as string})`
              : 'Set route from here'}
          </button>
          {route !== null && route !== undefined && (
            <button
              type="button"
              className="command-button"
              onClick={() =>
                dispatch({
                  type: 'CANCEL_ROUTE',
                  routeId: route.id,
                })
              }
            >
              Cancel route
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * TrainGlyph — renders a train as a small marker on its
 * current edge. Pure renderer; reads the train's
 * position, route, and FSM state from the snapshot.
 *
 * The glyph is positioned by interpolating between the
 * two endpoints of the train's `currentEdgeId` using
 * `edgePosition`. Future sections may add a smoother
 * rAF interpolation between two snapshots, but milestone
 * 1 snaps the train to the current `edgePosition`.
 */

import type { NodePosition } from '../layout/computeLayout';
import type { EdgeId } from '@/types/ids';
import type { TrainState } from '@/types/trains';

export interface TrainGlyphProps {
  readonly train: TrainState;
  readonly edgeLayouts: ReadonlyMap<EdgeId, { readonly from: NodePosition; readonly to: NodePosition }>;
  /** Edge id of the next edge in the route, used to position
   *  the train visually when it has just advanced. */
  readonly label?: string;
}

const COLOR_RUNNING = '#4ec9b0';
const COLOR_STOPPED = '#c0a020';
const COLOR_FINISHED = '#808080';
const COLOR_HOLDING = '#a060c0';

const colorFor = (state: TrainState['fsmState']): string => {
  switch (state) {
    case 'Running':
    case 'Entering':
    case 'ApproachingSignal':
    case 'Departing':
      return COLOR_RUNNING;
    case 'StoppedAtSignal':
    case 'LeavingControlledArea':
      return COLOR_STOPPED;
    case 'StoppedAtPlatform':
      return COLOR_HOLDING;
    case 'Finished':
    case 'WaitingForEntry':
    default:
      return COLOR_FINISHED;
  }
};

export const TrainGlyph = ({
  train,
  edgeLayouts,
  label,
}: TrainGlyphProps): JSX.Element | null => {
  if (train.currentEdgeId === null) return null;
  const layout = edgeLayouts.get(train.currentEdgeId);
  if (!layout) return null;
  // Linear interpolation along the edge.
  const t = Math.max(0, Math.min(1, train.edgePosition));
  const x = layout.from.x + (layout.to.x - layout.from.x) * t;
  const y = layout.from.y + (layout.to.y - layout.from.y) * t;
  const fill = colorFor(train.fsmState);
  return (
    <g>
      <rect
        x={x - 5}
        y={y - 3}
        width={10}
        height={6}
        fill={fill}
        stroke="#000"
        strokeWidth={1}
        rx={1}
      />
      {label !== undefined && (
        <text
          x={x + 7}
          y={y + 3}
          fill={fill}
          fontSize={9}
          fontFamily="monospace"
        >
          {label}
        </text>
      )}
    </g>
  );
};

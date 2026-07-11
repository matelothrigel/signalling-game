/**
 * EdgeGlyph — renders a topology edge as an SVG line.
 *
 * Pure renderer: given a layout, the edge's `from` and
 * `to` positions, and the route / signal / occupation
 * state, the glyph decides its colour. The renderer
 * never queries the engine directly.
 */

import type { Aspect } from '@/types/primitives';
import type { EdgeLayout } from '../layout/computeLayout';

export interface EdgeGlyphProps {
  readonly layout: EdgeLayout;
  /** Is the edge part of an active route? */
  readonly inActiveRoute: boolean;
  /** The signal aspect at the `to` end (if any). */
  readonly signalAspect: Aspect | null;
  /** True when the edge is currently occupied by a train. */
  readonly occupied: boolean;
}

const COLOR_INACTIVE = '#3a3a3a';
const COLOR_OCCUPIED = '#d0a040';
const COLOR_ROUTE = '#4ec9b0';
const COLOR_ROUTE_OCCUPIED = '#80d8c0';

export const EdgeGlyph = ({
  layout,
  inActiveRoute,
  signalAspect,
  occupied,
}: EdgeGlyphProps): JSX.Element => {
  let stroke = COLOR_INACTIVE;
  let width = 2;
  if (inActiveRoute) {
    stroke = occupied ? COLOR_ROUTE_OCCUPIED : COLOR_ROUTE;
    width = 4;
  } else if (occupied) {
    stroke = COLOR_OCCUPIED;
    width = 3;
  }
  // A signal's red aspect draws a short red stub at the
  // `to` end. The full signal glyph is drawn separately
  // at the same position.
  if (signalAspect === 'stop' && inActiveRoute) {
    stroke = '#a04040';
  }
  return (
    <line
      data-edge-id={layout.signalId !== null ? 'with-signal' : 'plain'}
      x1={layout.from.x}
      y1={layout.from.y}
      x2={layout.to.x}
      y2={layout.to.y}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
};

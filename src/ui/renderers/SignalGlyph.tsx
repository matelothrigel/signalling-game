/**
 * SignalGlyph — renders a signal as a coloured dot.
 * Pure renderer; reads the aspect from the snapshot.
 *
 * Aspect → colour mapping (milestone 1):
 *
 *   stop     → red
 *   proceed  → green
 *
 * Future aspects (`caution`, `approach`, `shunting`,
 * `call-on`, `flashing`, national variants) extend the
 * `Aspect` union; the renderer falls through to a neutral
 * yellow for unknown values so a new aspect never breaks
 * the UI.
 */

import type { Aspect } from '@/types/primitives';

export interface SignalGlyphProps {
  readonly cx: number;
  readonly cy: number;
  readonly aspect: Aspect;
  /** Optional signal label (e.g. "S1"). Drawn next to the dot. */
  readonly label?: string;
  /** True when the user has selected this signal. */
  readonly selected?: boolean;
  /** Click handler — wired by the dispatcher UI. */
  readonly onClick?: () => void;
}

const COLOR_STOP = '#c02020';
const COLOR_PROCEED = '#20c060';
const COLOR_NEUTRAL = '#c0a020';

const colorFor = (aspect: Aspect): string => {
  switch (aspect) {
    case 'stop':
      return COLOR_STOP;
    case 'proceed':
      return COLOR_PROCEED;
    default:
      return COLOR_NEUTRAL;
  }
};

export const SignalGlyph = ({
  cx,
  cy,
  aspect,
  label,
  selected,
  onClick,
}: SignalGlyphProps): JSX.Element => {
  const fill = colorFor(aspect);
  return (
    <g
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      role={onClick ? 'button' : undefined}
    >
      <circle
        cx={cx}
        cy={cy}
        r={selected ? 6 : 4}
        fill={fill}
        stroke={selected ? '#ffffff' : fill}
        strokeWidth={selected ? 2 : 1}
      />
      {label !== undefined && (
        <text
          x={cx + 8}
          // Drawn *below* the dot, not above — the node's own
          // label and (for platform sections) the platform bar
          // both live in the space above the node. Sharing that
          // space caused signal labels to print on top of them.
          y={cy + 16}
          fill="#808080"
          fontSize={9}
          fontFamily="monospace"
        >
          {label}
        </text>
      )}
    </g>
  );
};

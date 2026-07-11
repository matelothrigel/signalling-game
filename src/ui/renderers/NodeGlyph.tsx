/**
 * NodeGlyph — renders a topology node (section or switch)
 * as a small shape. Pure renderer; reads its position
 * from the layout and its state from the simulation
 * snapshot.
 */

import type { NodePosition } from '../layout/computeLayout';
import type { SwitchState } from '@/types/infrastructure';
import type { SectionState } from '@/types/infrastructure';

export type NodeKind = 'section' | 'switch';

export interface NodeGlyphProps {
  readonly kind: NodeKind;
  readonly position: NodePosition;
  readonly switchState?: SwitchState | undefined;
  readonly sectionState?: SectionState | undefined;
  /** Optional label, drawn next to the node. */
  readonly label?: string | undefined;
  /** Whether the node is currently selected. */
  readonly selected?: boolean | undefined;
}

const COLOR_SECTION_FREE = '#3a3a3a';
const COLOR_SECTION_OCCUPIED = '#d0a040';
const COLOR_SECTION_RESERVED = '#4ec9b0';
const COLOR_SWITCH_FREE = '#5a5a5a';
const COLOR_SWITCH_LOCKED = '#a06030';
const COLOR_SWITCH_OCCUPIED = '#d0a040';
const COLOR_SELECTED = '#4ec9b0';

export const NodeGlyph = ({
  kind,
  position,
  switchState,
  sectionState,
  label,
  selected,
}: NodeGlyphProps): JSX.Element => {
  const fill = (() => {
    if (kind === 'switch') {
      if (switchState?.lifecycle === 'occupied') return COLOR_SWITCH_OCCUPIED;
      if (switchState?.lifecycle === 'locked' || switchState?.lifecycle === 'reserved') {
        return COLOR_SWITCH_LOCKED;
      }
      return COLOR_SWITCH_FREE;
    }
    if (sectionState?.occupiedBy) return COLOR_SECTION_OCCUPIED;
    if (sectionState?.reservedBy) return COLOR_SECTION_RESERVED;
    return COLOR_SECTION_FREE;
  })();
  const stroke = selected ? COLOR_SELECTED : fill;
  const strokeWidth = selected ? 3 : 1;
  return (
    <g>
      {kind === 'switch' ? (
        <circle
          cx={position.x}
          cy={position.y}
          r={6}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : (
        <rect
          x={position.x - 6}
          y={position.y - 6}
          width={12}
          height={12}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )}
      {label !== undefined && (
        <text
          x={position.x + 10}
          y={position.y - 10}
          fill="#808080"
          fontSize={10}
          fontFamily="monospace"
        >
          {label}
        </text>
      )}
    </g>
  );
};

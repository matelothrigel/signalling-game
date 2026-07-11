/**
 * PlatformGlyph — renders a platform as a labelled
 * rectangle. Pure renderer; reads the platform
 * definition and the section id from the snapshot.
 *
 * The glyph spans every section the platform covers.
 * The renderer uses the section's layout position to
 * draw the platform bar above (or below) the section
 * line.
 */

import type { Platform } from '@/types/infrastructure';
import type { NodePosition } from '../layout/computeLayout';
import type { PlatformId } from '@/types/ids';

export interface PlatformGlyphProps {
  readonly platform: Platform;
  readonly id: PlatformId;
  readonly sectionPositions: ReadonlyMap<string, NodePosition>;
  /** True when a train is currently held at this platform. */
  readonly occupied: boolean;
}

const COLOR_PLATFORM = '#3a3a3a';
const COLOR_BORDER = '#6a6a6a';
const COLOR_OCCUPIED = '#d0a040';
const HEIGHT = 18;

export const PlatformGlyph = ({
  platform,
  sectionPositions,
  occupied,
}: PlatformGlyphProps): JSX.Element | null => {
  if (platform.sectionIds.length === 0) return null;
  const positions: NodePosition[] = [];
  for (const sid of platform.sectionIds) {
    const p = sectionPositions.get(sid as unknown as string);
    if (p) positions.push(p);
  }
  if (positions.length === 0) return null;

  // Draw the bar at the average y of the covered sections,
  // shifted up by HEIGHT.
  const avgY =
    positions.reduce((acc, p) => acc + p.y, 0) / positions.length;
  const minX = Math.min(...positions.map((p) => p.x));
  const maxX = Math.max(...positions.map((p) => p.x));
  const width = Math.max(maxX - minX + 16, 24);
  const x = minX - 8 + (maxX - minX - width + 16) / 2;
  const y = avgY - HEIGHT - 4;

  const fill = occupied ? COLOR_OCCUPIED : COLOR_PLATFORM;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={HEIGHT}
        fill={fill}
        stroke={COLOR_BORDER}
        strokeWidth={1}
        rx={2}
      />
      <text
        x={x + width / 2}
        y={y + HEIGHT / 2 + 3}
        fill="#e0e0e0"
        fontSize={10}
        fontFamily="monospace"
        textAnchor="middle"
      >
        {platform.name}
      </text>
    </g>
  );
};

/**
 * Camera — pan / zoom wrapper for the SVG canvas.
 *
 * The camera owns its own state (translation + scale) and
 * is **purely presentational**: it does not read or write
 * any engine state. The `SimulationCanvas` draws the
 * topology; the `Camera` wraps it in a `<g transform>`
 * that applies the pan / zoom.
 *
 * ## Interactions
 *
 * - **Mouse wheel**: zoom in / out around the cursor.
 *   Wheel up zooms in, wheel down zooms out. The zoom
 *   is clamped to `[MIN_SCALE, MAX_SCALE]`.
 * - **Mouse drag** (left button): pan.
 *
 * Both are implemented as native React event handlers
 * so no extra dependencies are required.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.1;

export interface CameraProps {
  readonly children: ReactNode;
  readonly width: number;
  readonly height: number;
}

export const Camera = ({ children, width, height }: CameraProps): JSX.Element => {
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [scale, setScale] = useState(1);
  const dragState = useRef<{ x: number; y: number } | null>(null);

  const onWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const rect = event.currentTarget.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      // Keep the cursor's world point fixed: translate so
      // that (cursorX, cursorY) maps to the same point
      // before and after the scale change.
      setScale((prevScale) => {
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prevScale * factor));
        const ratio = next / prevScale;
        setTx((prevTx) => prevTx - (cursorX - prevTx) * (ratio - 1));
        setTy((prevTy) => prevTy - (cursorY - prevTy) * (ratio - 1));
        return next;
      });
    },
    [],
  );

  const onMouseDown = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragState.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onMouseMove = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (dragState.current === null) return;
    const dx = event.clientX - dragState.current.x;
    const dy = event.clientY - dragState.current.y;
    dragState.current = { x: event.clientX, y: event.clientY };
    setTx((prev) => prev + dx);
    setTy((prev) => prev + dy);
  }, []);

  const onMouseUp = useCallback(() => {
    dragState.current = null;
  }, []);

  const onMouseLeave = useCallback(() => {
    dragState.current = null;
  }, []);

  const reset = useCallback(() => {
    setTx(0);
    setTy(0);
    setScale(1);
  }, []);

  const transform = useMemo(
    () => `translate(${tx} ${ty}) scale(${scale})`,
    [tx, ty, scale],
  );

  return (
    <div className="camera-root" style={{ width: '100%', height: '100%' }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        style={{
          display: 'block',
          background: '#000',
          cursor: dragState.current !== null ? 'grabbing' : 'grab',
        }}
      >
        <g transform={transform}>{children}</g>
      </svg>
      <div className="camera-overlay">
        <button
          type="button"
          className="command-button"
          onClick={reset}
        >
          Reset view
        </button>
        <span className="camera-overlay-readout">
          zoom {Math.round(scale * 100)}%
        </span>
      </div>
    </div>
  );
};

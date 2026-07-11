import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EdgeGlyph } from '../EdgeGlyph';
import { NodeGlyph } from '../NodeGlyph';
import { SignalGlyph } from '../SignalGlyph';
import { PlatformGlyph } from '../PlatformGlyph';
import { TrainGlyph } from '../TrainGlyph';
import { asId, type PlatformId, type TrainId, type EdgeId } from '@/types/ids';
import type { TrainState } from '@/types/trains';
import type { Platform } from '@/types/infrastructure';

describe('EdgeGlyph', () => {
  it('renders an SVG line between two points', () => {
    const { container } = render(
      <svg>
        <EdgeGlyph
          layout={{
            from: { x: 0, y: 0 },
            to: { x: 10, y: 10 },
            signalId: null,
          }}
          inActiveRoute={false}
          signalAspect={null}
          occupied={false}
        />
      </svg>,
    );
    const line = container.querySelector('line');
    expect(line).not.toBeNull();
  });

  it('uses a thicker stroke for an in-active-route edge', () => {
    const { container: a } = render(
      <svg>
        <EdgeGlyph
          layout={{ from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, signalId: null }}
          inActiveRoute={false}
          signalAspect={null}
          occupied={false}
        />
      </svg>,
    );
    const { container: b } = render(
      <svg>
        <EdgeGlyph
          layout={{ from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, signalId: null }}
          inActiveRoute={true}
          signalAspect={null}
          occupied={false}
        />
      </svg>,
    );
    const widthA = a.querySelector('line')?.getAttribute('stroke-width');
    const widthB = b.querySelector('line')?.getAttribute('stroke-width');
    expect(Number(widthB)).toBeGreaterThan(Number(widthA));
  });
});

describe('NodeGlyph', () => {
  it('renders a section as a rect', () => {
    const { container } = render(
      <svg>
        <NodeGlyph kind="section" position={{ x: 5, y: 5 }} />
      </svg>,
    );
    expect(container.querySelector('rect')).not.toBeNull();
  });

  it('renders a switch as a circle', () => {
    const { container } = render(
      <svg>
        <NodeGlyph kind="switch" position={{ x: 5, y: 5 }} />
      </svg>,
    );
    expect(container.querySelector('circle')).not.toBeNull();
  });

  it('draws a label when provided', () => {
    const { container } = render(
      <svg>
        <NodeGlyph kind="section" position={{ x: 5, y: 5 }} label="Hello" />
      </svg>,
    );
    const text = container.querySelector('text');
    expect(text?.textContent).toBe('Hello');
  });
});

describe('SignalGlyph', () => {
  it('renders a circle with a stop colour', () => {
    const { container } = render(
      <svg>
        <SignalGlyph cx={10} cy={10} aspect="stop" />
      </svg>,
    );
    const circle = container.querySelector('circle');
    expect(circle?.getAttribute('fill')).toBe('#c02020');
  });

  it('renders a circle with a proceed colour', () => {
    const { container } = render(
      <svg>
        <SignalGlyph cx={10} cy={10} aspect="proceed" />
      </svg>,
    );
    const circle = container.querySelector('circle');
    expect(circle?.getAttribute('fill')).toBe('#20c060');
  });

  it('grows the radius when selected', () => {
    const { container: a } = render(
      <svg>
        <SignalGlyph cx={10} cy={10} aspect="stop" />
      </svg>,
    );
    const { container: b } = render(
      <svg>
        <SignalGlyph cx={10} cy={10} aspect="stop" selected />
      </svg>,
    );
    const ra = a.querySelector('circle')?.getAttribute('r');
    const rb = b.querySelector('circle')?.getAttribute('r');
    expect(Number(rb)).toBeGreaterThan(Number(ra));
  });
});

describe('PlatformGlyph', () => {
  it('renders nothing when the platform has no sections', () => {
    const platform: Platform = {
      id: asId<PlatformId>('P1'),
      name: 'P1',
      sectionIds: [],
    };
    const { container } = render(
      <svg>
        <PlatformGlyph
          id={asId<PlatformId>('P1')}
          platform={platform}
          sectionPositions={new Map()}
          occupied={false}
        />
      </svg>,
    );
    expect(container.querySelector('rect')).toBeNull();
  });

  it('renders a rect with the platform name when sections are mapped', () => {
    const platform: Platform = {
      id: asId<PlatformId>('P1'),
      name: 'Platform 1',
      sectionIds: ['S1' as never],
    };
    const positions = new Map<string, { x: number; y: number }>([
      ['S1', { x: 50, y: 50 }],
    ]);
    const { container } = render(
      <svg>
        <PlatformGlyph
          id={asId<PlatformId>('P1')}
          platform={platform}
          sectionPositions={positions}
          occupied={false}
        />
      </svg>,
    );
    const rect = container.querySelector('rect');
    const text = container.querySelector('text');
    expect(rect).not.toBeNull();
    expect(text?.textContent).toBe('Platform 1');
  });
});

describe('TrainGlyph', () => {
  it('renders nothing when the train has no current edge', () => {
    const train: TrainState = {
      id: asId<TrainId>('T1'),
      direction: 'forward',
      fsmState: 'WaitingForEntry',
      currentEdgeId: null,
      edgePosition: 0,
      routeId: null,
      remainingEdges: [],
      heldAtPlatform: null,
      lastTickAtSimTime: 0,
      delaySeconds: 0,
    };
    const { container } = render(
      <svg>
        <TrainGlyph
          train={train}
          edgeLayouts={new Map()}
          label="T1"
        />
      </svg>,
    );
    expect(container.querySelector('rect')).toBeNull();
  });

  it('renders a rect on the train’s current edge', () => {
    const train: TrainState = {
      id: asId<TrainId>('T1'),
      direction: 'forward',
      fsmState: 'Running',
      currentEdgeId: asId<EdgeId>('E1'),
      edgePosition: 0.5,
      routeId: null,
      remainingEdges: [],
      heldAtPlatform: null,
      lastTickAtSimTime: 0,
      delaySeconds: 0,
    };
    const edges = new Map<EdgeId, { from: { x: number; y: number }; to: { x: number; y: number } }>([
      [asId<EdgeId>('E1'), { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } }],
    ]);
    const { container } = render(
      <svg>
        <TrainGlyph train={train} edgeLayouts={edges} label="T1" />
      </svg>,
    );
    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
  });
});

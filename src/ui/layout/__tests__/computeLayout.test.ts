import { describe, it, expect } from 'vitest';
import { computeLayout } from '../computeLayout';
import type { TopologyData } from '@/engine/topology';

describe('computeLayout', () => {
  it('places a single node at the origin', () => {
    const topology: TopologyData = {
      nodes: [{ kind: 'section', id: 'A' as never }],
      edges: [],
    };
    const layout = computeLayout(topology);
    expect(layout.nodes.size).toBe(1);
    expect(layout.nodes.get('A' as never)).toEqual({ x: 40, y: 40 });
  });

  it('places two connected nodes at the same y, different x', () => {
    const topology: TopologyData = {
      nodes: [
        { kind: 'section', id: 'A' as never },
        { kind: 'section', id: 'B' as never },
      ],
      edges: [
        {
          id: 'E' as never,
          from: 'A' as never,
          to: 'B' as never,
          bidirectional: true,
        },
      ],
    };
    const layout = computeLayout(topology);
    const a = layout.nodes.get('A' as never)!;
    const b = layout.nodes.get('B' as never)!;
    expect(b.x).toBeGreaterThan(a.x);
  });

  it('is deterministic for the same input', () => {
    const topology: TopologyData = {
      nodes: [
        { kind: 'section', id: 'A' as never },
        { kind: 'switch', id: 'W' as never, legs: ['A' as never, 'B' as never, 'C' as never], legMap: { normal: [], reverse: [] } },
        { kind: 'section', id: 'B' as never },
        { kind: 'section', id: 'C' as never },
      ],
      edges: [
        { id: 'E1' as never, from: 'A' as never, to: 'W' as never, bidirectional: true },
        { id: 'E2' as never, from: 'W' as never, to: 'B' as never, bidirectional: true },
        { id: 'E3' as never, from: 'W' as never, to: 'C' as never, bidirectional: true },
      ],
    };
    const a = computeLayout(topology);
    const b = computeLayout(topology);
    expect(a.nodes).toEqual(b.nodes);
    expect(a.edges).toEqual(b.edges);
    expect(a.width).toBe(b.width);
  });

  it('records signal id on edge layouts', () => {
    const topology: TopologyData = {
      nodes: [
        { kind: 'section', id: 'A' as never },
        { kind: 'section', id: 'B' as never },
      ],
      edges: [
        {
          id: 'E' as never,
          from: 'A' as never,
          to: 'B' as never,
          bidirectional: true,
          signalId: 'S1' as never,
        },
      ],
    };
    const layout = computeLayout(topology);
    const e = layout.edges.get('E' as never)!;
    expect(e.signalId).toBe('S1' as never);
  });

  it('produces a finite width and height', () => {
    const topology: TopologyData = {
      nodes: [
        { kind: 'section', id: 'A' as never },
        { kind: 'section', id: 'B' as never },
        { kind: 'section', id: 'C' as never },
      ],
      edges: [
        { id: 'E1' as never, from: 'A' as never, to: 'B' as never, bidirectional: true },
        { id: 'E2' as never, from: 'B' as never, to: 'C' as never, bidirectional: true },
      ],
    };
    const layout = computeLayout(topology);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});

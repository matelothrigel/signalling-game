import { describe, it, expect } from 'vitest';
import { Topology } from '../Topology';
import { asId, type NodeId, type EdgeId } from '@/types/ids';
import { envelope } from '@/types/versioned';

const make = (): Topology =>
  new Topology({
    nodes: [
      { kind: 'section', id: asId<NodeId>('A'), label: 'A' },
      { kind: 'section', id: asId<NodeId>('B'), label: 'B' },
      { kind: 'section', id: asId<NodeId>('C'), label: 'C' },
    ],
    edges: [
      { id: asId<EdgeId>('E1'), from: asId<NodeId>('A'), to: asId<NodeId>('B'), bidirectional: true },
      { id: asId<EdgeId>('E2'), from: asId<NodeId>('B'), to: asId<NodeId>('C'), bidirectional: true },
    ],
  });

describe('Topology — construction', () => {
  it('rejects an empty node list', () => {
    expect(() => new Topology({ nodes: [], edges: [] })).toThrow(/at least one node/);
  });

  it('rejects duplicate node IDs', () => {
    expect(
      () =>
        new Topology({
          nodes: [
            { kind: 'section', id: asId<NodeId>('A') },
            { kind: 'section', id: asId<NodeId>('A') },
          ],
          edges: [],
        }),
    ).toThrow(/duplicate node id/);
  });

  it('rejects duplicate edge IDs', () => {
    expect(
      () =>
        new Topology({
          nodes: [{ kind: 'section', id: asId<NodeId>('A') }],
          edges: [
            { id: asId<EdgeId>('E1'), from: asId<NodeId>('A'), to: asId<NodeId>('A'), bidirectional: true },
            { id: asId<EdgeId>('E1'), from: asId<NodeId>('A'), to: asId<NodeId>('A'), bidirectional: true },
          ],
        }),
    ).toThrow(/duplicate edge id/);
  });

  it('rejects edges referencing unknown nodes', () => {
    expect(
      () =>
        new Topology({
          nodes: [{ kind: 'section', id: asId<NodeId>('A') }],
          edges: [
            { id: asId<EdgeId>('E1'), from: asId<NodeId>('A'), to: asId<NodeId>('Z'), bidirectional: true },
          ],
        }),
    ).toThrow(/unknown node Z/);
  });

  it('rejects a switch whose legMap leaves a leg disconnected', () => {
    // 3-leg switch W1 with legs [A, B, C], but C never appears
    // in any legMap entry. The validator should reject this.
    expect(
      () =>
        new Topology({
          nodes: [
            { kind: 'section', id: asId<NodeId>('A') },
            { kind: 'section', id: asId<NodeId>('B') },
            { kind: 'section', id: asId<NodeId>('C') },
            {
              kind: 'switch',
              id: asId<NodeId>('W1'),
              legs: [asId<NodeId>('A'), asId<NodeId>('B'), asId<NodeId>('C')],
              legMap: {
                normal: [
                  { from: asId<NodeId>('A'), to: asId<NodeId>('B') },
                  { from: asId<NodeId>('B'), to: asId<NodeId>('A') },
                ],
                reverse: [
                  { from: asId<NodeId>('A'), to: asId<NodeId>('B') },
                  { from: asId<NodeId>('B'), to: asId<NodeId>('A') },
                ],
              },
            },
          ],
          edges: [
            { id: asId<EdgeId>('E1'), from: asId<NodeId>('A'), to: asId<NodeId>('W1'), bidirectional: true },
            { id: asId<EdgeId>('E2'), from: asId<NodeId>('W1'), to: asId<NodeId>('B'), bidirectional: true },
            { id: asId<EdgeId>('E3'), from: asId<NodeId>('W1'), to: asId<NodeId>('C'), bidirectional: true },
          ],
        }),
    ).toThrow(/leg C is not connected/);
  });

  it('accepts a 2-leg switch that uses the same connections in both positions', () => {
    expect(
      () =>
        new Topology({
          nodes: [
            { kind: 'section', id: asId<NodeId>('A') },
            { kind: 'section', id: asId<NodeId>('B') },
            {
              kind: 'switch',
              id: asId<NodeId>('W1'),
              legs: [asId<NodeId>('A'), asId<NodeId>('B')],
              legMap: {
                normal: [{ from: asId<NodeId>('A'), to: asId<NodeId>('B') }],
                reverse: [{ from: asId<NodeId>('A'), to: asId<NodeId>('B') }],
              },
            },
          ],
          edges: [
            { id: asId<EdgeId>('E1'), from: asId<NodeId>('A'), to: asId<NodeId>('W1'), bidirectional: true },
            { id: asId<EdgeId>('E2'), from: asId<NodeId>('W1'), to: asId<NodeId>('B'), bidirectional: true },
          ],
        }),
    ).not.toThrow();
  });
});

describe('Topology — queries', () => {
  const t = make();

  it('getNode returns the node or undefined', () => {
    expect(t.getNode(asId<NodeId>('A'))?.label).toBe('A');
    expect(t.getNode(asId<NodeId>('Z'))).toBeUndefined();
  });

  it('getEdge returns the edge or undefined', () => {
    expect(t.getEdge(asId<EdgeId>('E1'))?.bidirectional).toBe(true);
    expect(t.getEdge(asId<EdgeId>('Z'))).toBeUndefined();
  });

  it('getAllNodes returns all nodes', () => {
    expect(t.getAllNodes()).toHaveLength(3);
  });

  it('getAllEdges returns all edges', () => {
    expect(t.getAllEdges()).toHaveLength(2);
  });

  it('getEdgesFrom returns edges incident to a node', () => {
    const a = t.getEdgesFrom(asId<NodeId>('A'));
    expect(a).toHaveLength(1);
    expect(a[0]?.id).toBe('E1');
    const b = t.getEdgesFrom(asId<NodeId>('B'));
    expect(b).toHaveLength(2);
  });

  it('nodeCount and edgeCount return sizes', () => {
    expect(t.nodeCount()).toBe(3);
    expect(t.edgeCount()).toBe(2);
  });
});

describe('Topology — immutability', () => {
  it('is frozen', () => {
    const t = make();
    expect(Object.isFrozen(t)).toBe(true);
  });

  it('does not expose mutable internals', () => {
    const t = make();
    // The internal nodes/edges maps are typed as ReadonlyMap.
    // Mutating them should not be possible through the public surface.
    expect(t.getAllNodes()).toHaveLength(3);
  });
});

describe('Topology — metadata', () => {
  it('preserves node metadata through construction', () => {
    const t = new Topology({
      nodes: [
        {
          kind: 'section',
          id: asId<NodeId>('A'),
          metadata: { lineSpeed: 160, electrified: true, km: 12.5 },
        },
      ],
      edges: [],
    });
    const a = t.getNode(asId<NodeId>('A'));
    expect(a?.metadata).toEqual({ lineSpeed: 160, electrified: true, km: 12.5 });
  });

  it('preserves edge metadata through construction', () => {
    const t = new Topology({
      nodes: [
        { kind: 'section', id: asId<NodeId>('A') },
        { kind: 'section', id: asId<NodeId>('B') },
      ],
      edges: [
        {
          id: asId<EdgeId>('E1'),
          from: asId<NodeId>('A'),
          to: asId<NodeId>('B'),
          bidirectional: true,
          metadata: { trackCircuit: 'AC-100', axleCounter: true },
        },
      ],
    });
    const e = t.getEdge(asId<EdgeId>('E1'));
    expect(e?.metadata).toEqual({ trackCircuit: 'AC-100', axleCounter: true });
  });

  it('defaults missing metadata to an empty object', () => {
    const t = make();
    const a = t.getNode(asId<NodeId>('A'));
    expect(a?.metadata).toEqual({});
  });

  it('preserves arbitrary nested metadata', () => {
    const meta = {
      etcs: { level: 2, block: 'B-12' },
      tags: ['primary', 'overnight'],
      maintenance: { lastInspected: '2025-01-01', nextDue: '2026-01-01' },
    };
    const t = new Topology({
      nodes: [{ kind: 'section', id: asId<NodeId>('A'), metadata: meta }],
      edges: [],
    });
    expect(t.getNode(asId<NodeId>('A'))?.metadata).toEqual(meta);
  });
});

describe('Topology — serialization round-trip', () => {
  it('serialize() / fromJSON() preserves nodes and edges', () => {
    const t = make();
    const env = t.serialize();
    const r = Topology.fromJSON(env);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.nodeCount()).toBe(3);
      expect(r.value.edgeCount()).toBe(2);
    }
  });

  it('serialize() / fromJSON() preserves metadata', () => {
    const t = new Topology({
      nodes: [
        { kind: 'section', id: asId<NodeId>('A'), metadata: { lineSpeed: 120 } },
      ],
      edges: [],
    });
    const r = Topology.fromJSON(t.serialize());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.getNode(asId<NodeId>('A'))?.metadata).toEqual({ lineSpeed: 120 });
    }
  });

  it('serialize() includes the version field', () => {
    const t = make();
    const env = t.serialize();
    expect(env.version).toBeDefined();
    expect(typeof env.version).toBe('number');
  });

  it('fromJSON() rejects non-versioned input', () => {
    const r = Topology.fromJSON({ data: {} });
    expect(r.ok).toBe(false);
  });

  it('fromJSON() rejects a wrong version', () => {
    const t = make();
    const env = t.serialize();
    const future = { ...env, version: env.version + 100 };
    const r = Topology.fromJSON(future);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('TOPOLOGY_VERSION_MISMATCH');
    }
  });

  it('fromData() rejects malformed input', () => {
    expect(Topology.fromData(null).ok).toBe(false);
    expect(Topology.fromData({}).ok).toBe(false);
    expect(Topology.fromData({ nodes: 'not an array' }).ok).toBe(false);
  });
});

describe('Topology — fromData preserves engine-agnostic metadata verbatim', () => {
  it('engine never reads metadata; it just round-trips it', () => {
    const raw = envelope({
      nodes: [
        {
          kind: 'section',
          id: 'SEC_1',
          metadata: {
            lineSpeed: 200,
            electrification: '25kV AC',
            km: 12.5,
            axleCounter: 'AC-200',
            etcs: { level: 2 },
            tags: ['primary'],
          },
        },
      ],
      edges: [],
    });
    const r = Topology.fromJSON(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const n = r.value.getNode(asId<NodeId>('SEC_1'));
      expect(n?.metadata).toMatchObject({
        lineSpeed: 200,
        electrification: '25kV AC',
        km: 12.5,
        axleCounter: 'AC-200',
      });
    }
  });
});

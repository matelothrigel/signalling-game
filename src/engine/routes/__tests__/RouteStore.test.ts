import { describe, it, expect } from 'vitest';
import { RouteStore } from '../RouteStore';
import { asId, type RouteId, type SignalId, type NodeId, type EdgeId, type SwitchId } from '@/types/ids';
import type { Route } from '@/types/routes';
import type { Aspect } from '@/types/primitives';

const rid = (s: string): RouteId => asId<RouteId>(s);
const sid = (s: string): SignalId => asId<SignalId>(s);
const nid = (s: string): NodeId => asId<NodeId>(s);
const eid = (s: string): EdgeId => asId<EdgeId>(s);
const swid = (s: string): SwitchId => asId<SwitchId>(s);

const makeRoute = (id: string, sections: string[], switches: string[] = []): Route => ({
  id: rid(id),
  entrySignalId: sid('S_entry'),
  exitSignalId: sid('S_exit'),
  sectionIds: sections.map(nid),
  edgeIds: sections.slice(0, -1).map((_, i) => eid(`E${i}`)),
  lockedSwitchIds: switches.map(swid),
  active: true,
  entryAspect: 'proceed' as Aspect,
});

describe('RouteStore — add / get / remove', () => {
  it('adds and retrieves a route', () => {
    const s = new RouteStore();
    const r = makeRoute('R1', ['T1', 'T2']);
    s.add(r);
    expect(s.get(rid('R1'))).toEqual(r);
  });

  it('rejects a duplicate route id', () => {
    const s = new RouteStore();
    s.add(makeRoute('R1', ['T1', 'T2']));
    const r = s.add(makeRoute('R1', ['T1', 'T2', 'T3']));
    expect(r.ok).toBe(false);
  });

  it('take returns the removed route', () => {
    const s = new RouteStore();
    s.add(makeRoute('R1', ['T1', 'T2']));
    const taken = s.take(rid('R1'));
    expect(taken?.id).toBe(rid('R1'));
    expect(s.size()).toBe(0);
  });

  it('take on unknown id returns undefined', () => {
    const s = new RouteStore();
    expect(s.take(rid('NOPE'))).toBeUndefined();
  });
});

describe('RouteStore — queries', () => {
  it('findByNode returns routes traversing the given node', () => {
    const s = new RouteStore();
    s.add(makeRoute('R1', ['T1', 'T2', 'T3']));
    s.add(makeRoute('R2', ['T4', 'T5']));
    expect(s.findByNode(nid('T2'))?.id).toBe(rid('R1'));
    expect(s.findByNode(nid('T4'))?.id).toBe(rid('R2'));
    expect(s.findByNode(nid('T9'))).toBeUndefined();
  });

  it('findByAnyNode returns every route that shares a node with the given set', () => {
    const s = new RouteStore();
    s.add(makeRoute('R1', ['T1', 'T2']));
    s.add(makeRoute('R2', ['T3', 'T4']));
    s.add(makeRoute('R3', ['T5', 'T6']));
    const result = s.findByAnyNode([nid('T2'), nid('T5')]);
    const ids = result.map((r) => r.id);
    expect(ids).toContain(rid('R1'));
    expect(ids).toContain(rid('R3'));
    expect(ids).not.toContain(rid('R2'));
  });

  it('hasEdge is true when a route traverses the edge', () => {
    const s = new RouteStore();
    s.add(makeRoute('R1', ['T1', 'T2']));
    expect(s.hasEdge(eid('E0'))).toBe(true);
    expect(s.hasEdge(eid('E99'))).toBe(false);
  });

  it('findByEntrySignal returns the route with that signal', () => {
    const s = new RouteStore();
    s.add(makeRoute('R1', ['T1', 'T2']));
    expect(s.findByEntrySignal(sid('S_entry'))?.id).toBe(rid('R1'));
    expect(s.findByEntrySignal(sid('S_other'))).toBeUndefined();
  });
});

describe('RouteStore — serialization', () => {
  it('serialize / load round-trip preserves all routes', () => {
    const s = new RouteStore();
    s.add(makeRoute('R1', ['T1', 'T2']));
    s.add(makeRoute('R2', ['T3', 'T4'], ['SW1']));
    const snap = s.serialize();
    const t = new RouteStore();
    const r = t.load(snap);
    expect(r.ok).toBe(true);
    expect(t.size()).toBe(2);
    expect(t.get(rid('R1'))).toEqual(s.get(rid('R1')));
    expect(t.get(rid('R2'))?.lockedSwitchIds).toEqual([rid('SW1')]);
  });
});

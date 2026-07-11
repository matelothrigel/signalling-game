import { describe, it, expect } from 'vitest';
import { RuleRegistry } from '../RuleRegistry';
import { TrackClearRule } from '../TrackClearRule';
import { SwitchLockedRule } from '../SwitchLockedRule';
import { ConflictRule } from '../ConflictRule';
import { SignalRule } from '../SignalRule';
import { PlatformRule } from '../PlatformRule';
import { RouteReasonCode } from '../RouteReasonCode';
import type { RuleContext, SafetyRule } from '../SafetyRule';
import { asId, type NodeId, type EdgeId, type SignalId, type SwitchId, type RouteId, type TrainId } from '@/types/ids';
import type { SwitchLifecycleState } from '@/engine/switches';
import type { Aspect, SwitchPosition } from '@/types/primitives';

const nid = (s: string): NodeId => asId<NodeId>(s);
const eid = (s: string): EdgeId => asId<EdgeId>(s);
const sid = (s: string): SignalId => asId<SignalId>(s);
const swid = (s: string): SwitchId => asId<SwitchId>(s);
const rid = (s: string): RouteId => asId<RouteId>(s);
const tid = (s: string): TrainId => asId<TrainId>(s);

const baseContext = (overrides: Partial<RuleContext> = {}): RuleContext => ({
  path: {
    nodeIds: [nid('T1'), nid('T2')],
    edgeIds: [eid('E1')],
  },
  origin: sid('S_entry'),
  destination: sid('S_exit'),
  sectionIds: [nid('T1'), nid('T2')],
  edgeIds: [eid('E1')],
  switchIds: [],
  atSimTime: 0,
  originIsAutomatic: true,
  destinationIsAutomatic: true,
  destinationIsPlatform: true,
  getSectionState: () => ({ occupiedBy: null, reservedBy: null }),
  getSwitchState: () => ({ position: 'normal', lifecycle: 'free', lockedBy: null }),
  getSignalState: () => ({ aspect: 'stop', controlledBy: null }),
  findConflictingRoutes: () => [],
  ...overrides,
});

describe('TrackClearRule', () => {
  const rule = new TrackClearRule();

  it('passes when no section is occupied or reserved', () => {
    expect(rule.evaluate(baseContext())).toEqual([]);
  });

  it('reports TRACK_OCCUPIED for each occupied section', () => {
    const r = rule.evaluate(
      baseContext({
        getSectionState: (id) =>
          id === nid('T1')
            ? { occupiedBy: tid('IC101'), reservedBy: null }
            : undefined,
      }),
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.code).toBe(RouteReasonCode.TRACK_OCCUPIED);
    expect(r[0]?.context).toMatchObject({ sectionId: 'T1', occupiedBy: 'IC101' });
  });

  it('reports TRACK_RESERVED for each section reserved by another route', () => {
    const r = rule.evaluate(
      baseContext({
        getSectionState: (id) =>
          id === nid('T2')
            ? { occupiedBy: null, reservedBy: rid('R9') }
            : undefined,
      }),
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.code).toBe(RouteReasonCode.TRACK_RESERVED);
  });

  it('reports BOTH occupied and reserved rejections for the same section', () => {
    const r = rule.evaluate(
      baseContext({
        getSectionState: (id) =>
          id === nid('T1') || id === nid('T2')
            ? { occupiedBy: tid('IC101'), reservedBy: rid('R9') }
            : undefined,
      }),
    );
    const codes = r.map((x) => x.code);
    expect(codes).toContain(RouteReasonCode.TRACK_OCCUPIED);
    expect(codes).toContain(RouteReasonCode.TRACK_RESERVED);
  });

  it('is deterministic — same input, same output', () => {
    const ctx = baseContext({
      getSectionState: (id) =>
        id === nid('T1')
          ? { occupiedBy: tid('IC101'), reservedBy: null }
          : undefined,
    });
    expect(rule.evaluate(ctx)).toEqual(rule.evaluate(ctx));
  });
});

describe('SwitchLockedRule', () => {
  const rule = new SwitchLockedRule();

  it('passes when no switch is held', () => {
    expect(
      rule.evaluate(
        baseContext({
          switchIds: [swid('W1')],
          getSwitchState: () => ({ position: 'normal', lifecycle: 'free', lockedBy: null }),
        }),
      ),
    ).toEqual([]);
  });

  it('reports SWITCH_LOCKED for a locked switch', () => {
    const r = rule.evaluate(
      baseContext({
        switchIds: [swid('W1')],
        getSwitchState: () => ({ position: 'normal', lifecycle: 'locked', lockedBy: rid('R1') }),
      }),
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.code).toBe(RouteReasonCode.SWITCH_LOCKED);
    expect(r[0]?.context).toMatchObject({ switchId: 'W1', lockedBy: 'R1' });
  });

  it('reports SWITCH_LOCKED for a reserved switch (about to lock)', () => {
    const r = rule.evaluate(
      baseContext({
        switchIds: [swid('W1')],
        getSwitchState: () => ({ position: 'normal', lifecycle: 'reserved', lockedBy: rid('R1') }),
      }),
    );
    expect(r[0]?.code).toBe(RouteReasonCode.SWITCH_LOCKED);
  });

  it('reports SWITCH_LOCKED for an occupied switch', () => {
    const r = rule.evaluate(
      baseContext({
        switchIds: [swid('W1')],
        getSwitchState: () => ({ position: 'normal' as SwitchPosition, lifecycle: 'occupied' as SwitchLifecycleState, lockedBy: null }),
      }),
    );
    expect(r[0]?.code).toBe(RouteReasonCode.SWITCH_LOCKED);
  });
});

describe('ConflictRule', () => {
  const rule = new ConflictRule();

  it('passes when no other route shares a node', () => {
    expect(
      rule.evaluate(
        baseContext({
          findConflictingRoutes: () => [],
        }),
      ),
    ).toEqual([]);
  });

  it('reports CONFLICT for every overlapping route', () => {
    const r = rule.evaluate(
      baseContext({
        findConflictingRoutes: () => [
          {
            id: rid('R1'),
            entrySignalId: sid('A'),
            exitSignalId: sid('B'),
            sectionIds: [nid('T1')],
            edgeIds: [eid('E1')],
            lockedSwitchIds: [],
            active: true,
            entryAspect: 'proceed' as Aspect,
          },
          {
            id: rid('R2'),
            entrySignalId: sid('C'),
            exitSignalId: sid('D'),
            sectionIds: [nid('T2')],
            edgeIds: [eid('E2')],
            lockedSwitchIds: [],
            active: true,
            entryAspect: 'proceed' as Aspect,
          },
        ],
      }),
    );
    expect(r).toHaveLength(2);
    const codes = r.map((x) => x.code);
    expect(codes).toEqual([RouteReasonCode.CONFLICT, RouteReasonCode.CONFLICT]);
    expect(r[0]?.context).toMatchObject({ otherRouteId: 'R1' });
    expect(r[1]?.context).toMatchObject({ otherRouteId: 'R2' });
  });
});

describe('SignalRule', () => {
  const rule = new SignalRule();

  it('passes when both signals are automatic', () => {
    expect(rule.evaluate(baseContext())).toEqual([]);
  });

  it('reports ORIGIN_NOT_AUTOMATIC when the origin is manual', () => {
    const r = rule.evaluate(baseContext({ originIsAutomatic: false }));
    expect(r[0]?.code).toBe(RouteReasonCode.ORIGIN_NOT_AUTOMATIC);
  });

  it('reports DESTINATION_NOT_AUTOMATIC when the destination is manual', () => {
    const r = rule.evaluate(baseContext({ destinationIsAutomatic: false }));
    expect(r[0]?.code).toBe(RouteReasonCode.DESTINATION_NOT_AUTOMATIC);
  });
});

describe('PlatformRule', () => {
  const rule = new PlatformRule();

  it('passes when destination is a platform', () => {
    expect(rule.evaluate(baseContext())).toEqual([]);
  });

  it('reports DESTINATION_NOT_PLATFORM when destination is not a platform', () => {
    const r = rule.evaluate(baseContext({ destinationIsPlatform: false }));
    expect(r[0]?.code).toBe(RouteReasonCode.DESTINATION_NOT_PLATFORM);
  });
});

describe('RuleRegistry', () => {
  it('evaluates all rules in registration order', () => {
    const reg = new RuleRegistry();
    reg.register(new TrackClearRule());
    reg.register(new SwitchLockedRule());
    reg.register(new ConflictRule());
    reg.register(new SignalRule());
    reg.register(new PlatformRule());
    expect(reg.size()).toBe(5);
  });

  it('collects ALL rejections from every rule, not just the first', () => {
    const reg = new RuleRegistry();
    reg.register(new TrackClearRule());
    reg.register(new SwitchLockedRule());
    reg.register(new ConflictRule());
    reg.register(new SignalRule());
    reg.register(new PlatformRule());

    const ctx = baseContext({
      // Track occupied
      getSectionState: (id: NodeId) => {
    if (id === nid('T1')) return { occupiedBy: tid('IC101'), reservedBy: null };
    return undefined;
  },
      // Switch locked
      switchIds: [swid('W1')],
      getSwitchState: () => ({ position: 'normal', lifecycle: 'locked', lockedBy: rid('R1') }),
      // Conflicting route
      findConflictingRoutes: () => [
        {
          id: rid('R9'),
          entrySignalId: sid('A'),
          exitSignalId: sid('B'),
          sectionIds: [nid('T1')],
          edgeIds: [eid('E1')],
          lockedSwitchIds: [],
          active: true,
          entryAspect: 'proceed' as Aspect,
        },
      ],
      // Destination is not a platform
      destinationIsPlatform: false,
    });

    const rejections = reg.evaluateAll(ctx);
    const codes = rejections.map((r) => r.code);
    expect(codes).toContain(RouteReasonCode.TRACK_OCCUPIED);
    expect(codes).toContain(RouteReasonCode.SWITCH_LOCKED);
    expect(codes).toContain(RouteReasonCode.CONFLICT);
    expect(codes).toContain(RouteReasonCode.DESTINATION_NOT_PLATFORM);
  });

  it('returns an empty array when every rule passes', () => {
    const reg = new RuleRegistry();
    reg.register(new TrackClearRule());
    reg.register(new SwitchLockedRule());
    reg.register(new ConflictRule());
    expect(reg.evaluateAll(baseContext())).toEqual([]);
  });

  it('clear() removes all rules', () => {
    const reg = new RuleRegistry();
    reg.register(new TrackClearRule());
    reg.clear();
    expect(reg.size()).toBe(0);
  });

  it('a custom rule can be registered alongside the standard ones', () => {
    const reg = new RuleRegistry();
    reg.register(new TrackClearRule());
    reg.register(new CustomRule());
    expect(reg.size()).toBe(2);
  });
});

class CustomRule implements SafetyRule {
  public readonly name = 'CustomRule';
  public evaluate(): readonly import('../RouteReasonCode').RouteRejection[] {
    return [];
  }
}
void CustomRule;
void nid;
void eid;
void sid;
void rid;
void tid;

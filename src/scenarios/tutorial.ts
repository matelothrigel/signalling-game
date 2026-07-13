/**
 * Tutorial scenario — the canonical "first dispatch"
 * exercise for the dispatcher.
 *
 * The station is a small yard:
 *
 * ```
 *                S_in                S_out
 *                 |                    |
 *   EXT --(E_ext_lead)-- LEAD
 *                          |
 *                  E_lead_w1
 *                          |
 *                          W1 (3-leg)
 *                         / \
 *              E_w1_p1 /   \ E_w1_p2
 *                       /     \
 *                      P1      P2
 *                      (S_p1)  (S_p2)
 *
 *                  E_lead_w2
 *                          |
 *                          W2 (3-leg)
 *                         / \
 *              E_w2_p3 /   \ E_w2_p4
 *                       /     \
 *                      P3      P4
 *                      (S_p3)  (S_p4)
 * ```
 *
 * Trains enter from `S_in` (on the entry edge) and exit
 * via `S_out` (on the same edge, going back). Each
 * platform has a single signal that the dispatcher uses
 * to both route the train in and route it back out.
 *
 * Workflow (per train):
 *  1. Dispatcher issues `SET_ROUTE { origin: S_in,
 *     destination: S_pN }`. The route's path is
 *     `LEAD → W1/W2 → PN`.
 *  2. Train enters, traverses the route, stops at the
 *     platform.
 *  3. Dispatcher issues `SET_ROUTE { origin: S_pN,
 *     destination: S_out }`. The route's path is
 *     `PN → W1/W2 → LEAD → EXT`.
 *  4. Dispatcher issues `DISPATCH_TRAIN`. The train
 *     traverses the exit route and is removed.
 *
 * Objectives verify both the route-setting and the
 * dispatch. They are checked on every tick by the
 * `ObjectiveChecker` service.
 */

import { asId, type NodeId, type EdgeId, type SignalId, type PlatformId, type TrainId, type ObjectiveId } from '@/types/ids';
import type { Scenario, TimetableEvent, Objective } from '@/types/scenario';
import type { TrainDefinition } from '@/types/trains';
import { Topology } from '@/engine/topology';
import type { Platform } from '@/types/infrastructure';

const buildTutorialTopology = (): Topology =>
  new Topology({
    nodes: [
      {
        kind: 'section',
        id: asId<NodeId>('EXT'),
        label: 'External',
        metadata: { position: { x: 40, y: 150 } },
      },
      {
        kind: 'section',
        id: asId<NodeId>('LEAD'),
        label: 'Lead',
        metadata: { position: { x: 180, y: 150 } },
      },
      {
        kind: 'section',
        id: asId<NodeId>('P1'),
        label: 'P1',
        metadata: { position: { x: 520, y: 60 } },
      },
      {
        kind: 'section',
        id: asId<NodeId>('P2'),
        label: 'P2',
        metadata: { position: { x: 520, y: 120 } },
      },
      {
        kind: 'section',
        id: asId<NodeId>('P3'),
        label: 'P3',
        metadata: { position: { x: 520, y: 200 } },
      },
      {
        kind: 'section',
        id: asId<NodeId>('P4'),
        label: 'P4',
        metadata: { position: { x: 520, y: 260 } },
      },
      {
        kind: 'switch',
        id: asId<NodeId>('W1'),
        legs: [asId<NodeId>('LEAD'), asId<NodeId>('P1'), asId<NodeId>('P2')],
        metadata: { position: { x: 320, y: 90 } },
        legMap: {
          normal: [
            { from: asId<NodeId>('LEAD'), to: asId<NodeId>('P1') },
            { from: asId<NodeId>('P1'), to: asId<NodeId>('LEAD') },
          ],
          reverse: [
            { from: asId<NodeId>('LEAD'), to: asId<NodeId>('P2') },
            { from: asId<NodeId>('P2'), to: asId<NodeId>('LEAD') },
          ],
        },
      },
      {
        kind: 'switch',
        id: asId<NodeId>('W2'),
        legs: [asId<NodeId>('LEAD'), asId<NodeId>('P3'), asId<NodeId>('P4')],
        metadata: { position: { x: 320, y: 230 } },
        legMap: {
          normal: [
            { from: asId<NodeId>('LEAD'), to: asId<NodeId>('P3') },
            { from: asId<NodeId>('P3'), to: asId<NodeId>('LEAD') },
          ],
          reverse: [
            { from: asId<NodeId>('LEAD'), to: asId<NodeId>('P4') },
            { from: asId<NodeId>('P4'), to: asId<NodeId>('LEAD') },
          ],
        },
      },
    ],
    edges: [
      {
        id: asId<EdgeId>('E_ext_lead'),
        from: asId<NodeId>('EXT'),
        to: asId<NodeId>('LEAD'),
        bidirectional: true,
        signalId: asId<SignalId>('S_in'),
      },
      {
        id: asId<EdgeId>('E_lead_w1'),
        from: asId<NodeId>('LEAD'),
        to: asId<NodeId>('W1'),
        bidirectional: true,
      },
      {
        id: asId<EdgeId>('E_lead_w2'),
        from: asId<NodeId>('LEAD'),
        to: asId<NodeId>('W2'),
        bidirectional: true,
      },
      {
        id: asId<EdgeId>('E_w1_p1'),
        from: asId<NodeId>('W1'),
        to: asId<NodeId>('P1'),
        bidirectional: true,
        signalId: asId<SignalId>('S_p1'),
      },
      {
        id: asId<EdgeId>('E_w1_p2'),
        from: asId<NodeId>('W1'),
        to: asId<NodeId>('P2'),
        bidirectional: true,
        signalId: asId<SignalId>('S_p2'),
      },
      {
        id: asId<EdgeId>('E_w2_p3'),
        from: asId<NodeId>('W2'),
        to: asId<NodeId>('P3'),
        bidirectional: true,
        signalId: asId<SignalId>('S_p3'),
      },
      {
        id: asId<EdgeId>('E_w2_p4'),
        from: asId<NodeId>('W2'),
        to: asId<NodeId>('P4'),
        bidirectional: true,
        signalId: asId<SignalId>('S_p4'),
      },
    ],
  });

const buildTutorialPlatforms = (): ReadonlyMap<PlatformId, Platform> => {
  const map = new Map<PlatformId, Platform>();
  map.set(asId<PlatformId>('PL1'), {
    id: asId<PlatformId>('PL1'),
    name: 'Platform 1',
    sectionIds: [asId<NodeId>('P1')],
  });
  map.set(asId<PlatformId>('PL2'), {
    id: asId<PlatformId>('PL2'),
    name: 'Platform 2',
    sectionIds: [asId<NodeId>('P2')],
  });
  map.set(asId<PlatformId>('PL3'), {
    id: asId<PlatformId>('PL3'),
    name: 'Platform 3',
    sectionIds: [asId<NodeId>('P3')],
  });
  map.set(asId<PlatformId>('PL4'), {
    id: asId<PlatformId>('PL4'),
    name: 'Platform 4',
    sectionIds: [asId<NodeId>('P4')],
  });
  return map;
};

const buildTutorialTrains = (): readonly TrainDefinition[] => [
  {
    id: asId<TrainId>('IC101'),
    label: 'IC101',
    lengthMeters: 200,
    maxSpeedKmh: 160,
    speedSectionsPerTick: 1,
    entryEdgeId: asId<EdgeId>('E_ext_lead'),
    exitEdgeId: asId<EdgeId>('E_ext_lead'),
    stopsAtPlatforms: [asId<PlatformId>('PL1')],
  },
  {
    id: asId<TrainId>('IC102'),
    label: 'IC102',
    lengthMeters: 200,
    maxSpeedKmh: 160,
    speedSectionsPerTick: 1,
    entryEdgeId: asId<EdgeId>('E_ext_lead'),
    exitEdgeId: asId<EdgeId>('E_ext_lead'),
    stopsAtPlatforms: [asId<PlatformId>('PL2')],
  },
  {
    id: asId<TrainId>('REG201'),
    label: 'REG201',
    lengthMeters: 150,
    maxSpeedKmh: 120,
    speedSectionsPerTick: 1,
    entryEdgeId: asId<EdgeId>('E_ext_lead'),
    exitEdgeId: asId<EdgeId>('E_ext_lead'),
    stopsAtPlatforms: [asId<PlatformId>('PL3')],
  },
  {
    id: asId<TrainId>('FRG301'),
    label: 'FRG301',
    lengthMeters: 300,
    maxSpeedKmh: 100,
    speedSectionsPerTick: 1,
    entryEdgeId: asId<EdgeId>('E_ext_lead'),
    exitEdgeId: asId<EdgeId>('E_ext_lead'),
    stopsAtPlatforms: [asId<PlatformId>('PL4')],
  },
];

const buildTutorialTimetable = (): readonly TimetableEvent[] => [
  { type: 'SPAWN_TRAIN', atSimTime: 5, train: buildTutorialTrains()[0]! },
  { type: 'SPAWN_TRAIN', atSimTime: 10, train: buildTutorialTrains()[1]! },
  { type: 'SPAWN_TRAIN', atSimTime: 15, train: buildTutorialTrains()[2]! },
  { type: 'SPAWN_TRAIN', atSimTime: 20, train: buildTutorialTrains()[3]! },
];

const buildTutorialObjectives = (): readonly Objective[] => [
  {
    kind: 'ROUTE_TRAIN_TO_PLATFORM',
    id: asId<ObjectiveId>('O_route_IC101'),
    description: 'Route IC101 to Platform 1',
    trainId: asId<TrainId>('IC101'),
    platformId: asId<PlatformId>('PL1'),
    dueBySimTime: 60,
  },
  {
    kind: 'DISPATCH_TRAIN',
    id: asId<ObjectiveId>('O_dispatch_IC101'),
    description: 'Dispatch IC101 from Platform 1',
    trainId: asId<TrainId>('IC101'),
    direction: 'outbound',
    dueBySimTime: 180,
  },
  {
    kind: 'ROUTE_TRAIN_TO_PLATFORM',
    id: asId<ObjectiveId>('O_route_IC102'),
    description: 'Route IC102 to Platform 2',
    trainId: asId<TrainId>('IC102'),
    platformId: asId<PlatformId>('PL2'),
    dueBySimTime: 60,
  },
  {
    kind: 'DISPATCH_TRAIN',
    id: asId<ObjectiveId>('O_dispatch_IC102'),
    description: 'Dispatch IC102 from Platform 2',
    trainId: asId<TrainId>('IC102'),
    direction: 'outbound',
    dueBySimTime: 180,
  },
  {
    kind: 'ROUTE_TRAIN_TO_PLATFORM',
    id: asId<ObjectiveId>('O_route_REG201'),
    description: 'Route REG201 to Platform 3',
    trainId: asId<TrainId>('REG201'),
    platformId: asId<PlatformId>('PL3'),
    dueBySimTime: 60,
  },
  {
    kind: 'DISPATCH_TRAIN',
    id: asId<ObjectiveId>('O_dispatch_REG201'),
    description: 'Dispatch REG201 from Platform 3',
    trainId: asId<TrainId>('REG201'),
    direction: 'outbound',
    dueBySimTime: 180,
  },
  {
    kind: 'ROUTE_TRAIN_TO_PLATFORM',
    id: asId<ObjectiveId>('O_route_FRG301'),
    description: 'Route FRG301 to Platform 4',
    trainId: asId<TrainId>('FRG301'),
    platformId: asId<PlatformId>('PL4'),
    dueBySimTime: 60,
  },
  {
    kind: 'DISPATCH_TRAIN',
    id: asId<ObjectiveId>('O_dispatch_FRG301'),
    description: 'Dispatch FRG301 from Platform 4',
    trainId: asId<TrainId>('FRG301'),
    direction: 'outbound',
    dueBySimTime: 180,
  },
];

export const buildTutorialScenario = (): Scenario => {
  const trains = buildTutorialTrains();
  const timetable = buildTutorialTimetable();
  const objectives = buildTutorialObjectives();
  return {
    id: asId<'ScenarioId' & { readonly __brand: 'ScenarioId' }>('tutorial') as never,
    name: 'Tutorial',
    infrastructure: { path: 'tutorial.json' },
    trains,
    timetable,
    objectives,
    startSimTime: 0,
    endSimTime: 600,
  };
};

export const TUTORIAL_TOPOLOGY = buildTutorialTopology;
export const TUTORIAL_PLATFORMS = buildTutorialPlatforms;
export const TUTORIAL_SCENARIO = buildTutorialScenario;

/** Names exported for tests. */
export const TUTORIAL_TRAIN_IDS = [
  asId<TrainId>('IC101'),
  asId<TrainId>('IC102'),
  asId<TrainId>('REG201'),
  asId<TrainId>('FRG301'),
];

export const TUTORIAL_PLATFORM_IDS = [
  asId<PlatformId>('PL1'),
  asId<PlatformId>('PL2'),
  asId<PlatformId>('PL3'),
  asId<PlatformId>('PL4'),
];

export const TUTORIAL_SIGNAL_IDS = {
  SIn: asId<SignalId>('S_in'),
  SP1: asId<SignalId>('S_p1'),
  SP2: asId<SignalId>('S_p2'),
  SP3: asId<SignalId>('S_p3'),
  SP4: asId<SignalId>('S_p4'),
} as const;

export const TUTORIAL_EDGE_IDS = {
  ExtLead: asId<EdgeId>('E_ext_lead'),
  LeadW1: asId<EdgeId>('E_lead_w1'),
  LeadW2: asId<EdgeId>('E_lead_w2'),
  W1P1: asId<EdgeId>('E_w1_p1'),
  W1P2: asId<EdgeId>('E_w1_p2'),
  W2P3: asId<EdgeId>('E_w2_p3'),
  W2P4: asId<EdgeId>('E_w2_p4'),
} as const;

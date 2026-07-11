/**
 * Scenario domain model.
 *
 * A scenario is the data-driven definition of a dispatching session.
 * It contains the infrastructure (or a reference to it), the trains
 * to spawn, the timetable of events, and the objectives to complete.
 *
 * Scenarios are loaded from JSON via {@link import('./versioned').Versioned}.
 * No gameplay is hardcoded — the engine reads scenarios.
 */

import type {
  ScenarioId,
  ObjectiveId,
  TrainId,
  EdgeId,
  PlatformId,
} from './ids';
import type { TrainDefinition } from './trains';
import type { Aspect, SwitchPosition } from './primitives';

/** A single step in a scenario's timetable. */
export type TimetableEvent =
  | {
      readonly type: 'SPAWN_TRAIN';
      readonly atSimTime: number;
      readonly train: TrainDefinition;
    }
  | {
      readonly type: 'SIGNAL_COMMAND';
      readonly atSimTime: number;
      readonly signalId: string;
      readonly aspect: Aspect;
    }
  | {
      readonly type: 'SWITCH_COMMAND';
      readonly atSimTime: number;
      readonly switchId: string;
      readonly position: SwitchPosition;
    }
  | {
      readonly type: 'TRAIN_REQUEST_ENTRY';
      readonly atSimTime: number;
      readonly trainId: TrainId;
      readonly entryEdgeId: EdgeId;
    }
  | {
      readonly type: 'TRAIN_DEPART_PLATFORM';
      readonly atSimTime: number;
      readonly trainId: TrainId;
      readonly platformId: PlatformId;
    }
  | {
      readonly type: 'OBJECTIVE_DUE';
      readonly atSimTime: number;
      readonly objectiveId: ObjectiveId;
    };

/** A scenario objective, checked against simulation state. */
export type Objective =
  | {
      readonly kind: 'ROUTE_TRAIN_TO_PLATFORM';
      readonly id: ObjectiveId;
      readonly description: string;
      readonly trainId: TrainId;
      readonly platformId: PlatformId;
      readonly dueBySimTime: number;
    }
  | {
      readonly kind: 'DISPATCH_TRAIN';
      readonly id: ObjectiveId;
      readonly description: string;
      readonly trainId: TrainId;
      readonly direction: 'eastbound' | 'westbound' | 'inbound' | 'outbound';
      readonly dueBySimTime: number;
    }
  | {
      readonly kind: 'NO_CONFLICT_FOR_DURATION';
      readonly id: ObjectiveId;
      readonly description: string;
      readonly durationSimTime: number;
      readonly dueBySimTime: number;
    };

/** A reference to an external infrastructure file. */
export interface InfrastructureRef {
  /** Path relative to the scenario file, e.g. `"../infrastructure/station01.json"`. */
  readonly path: string;
}

/** The full scenario definition. */
export interface Scenario {
  readonly id: ScenarioId;
  readonly name: string;
  readonly description?: string;
  /** Reference to the infrastructure file. */
  readonly infrastructure: InfrastructureRef;
  /** Optional initial state overrides (e.g. starting switch positions). */
  readonly initialSwitchPositions?: Readonly<Record<string, SwitchPosition>>;
  /** Trains defined in the scenario. */
  readonly trains: readonly TrainDefinition[];
  /** Timetable events, executed in `atSimTime` order. */
  readonly timetable: readonly TimetableEvent[];
  /** Objectives the dispatcher must complete. */
  readonly objectives: readonly Objective[];
  /** Scenario start time in simulated HHMM (e.g. `800` = 08:00). */
  readonly startSimTime: number;
  /** Scenario end time in simulated HHMM. */
  readonly endSimTime: number;
}

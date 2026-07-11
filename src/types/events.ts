/**
 * Event catalog — the typed stream emitted by the engine.
 *
 * The UI subscribes to this stream via the Zustand store and reacts
 * (re-render, log line, sound). The same stream can be persisted
 * for replay, sent over a wire for multiplayer, or analysed for
 * scoring.
 *
 * To extend: add a new variant to the `Event` union. The
 * `assertNever` helper in `result.ts` will surface unhandled cases
 * in subscribers.
 */

import type {
  SwitchId,
  SignalId,
  RouteId,
  ScenarioId,
  ObjectiveId,
  TrainId,
  NodeId,
  EdgeId,
} from './ids';
import type { SwitchPosition, Aspect, LogLevel } from './primitives';

export type EventType = Event['type'];

/** The exhaustive list of all events the engine emits. */
export type Event =
  /** A simulation tick has occurred. `simTime` is the new time. */
  | { readonly type: 'TIME_TICK'; readonly simTime: number }
  /** A train entered a new section. */
  | {
      readonly type: 'TRAIN_ENTERED_SECTION';
      readonly trainId: TrainId;
      readonly sectionId: NodeId;
    }
  /** A train left a section (rear of the train cleared it). */
  | {
      readonly type: 'TRAIN_LEFT_SECTION';
      readonly trainId: TrainId;
      readonly sectionId: NodeId;
    }
  /** A train requested entry to the controlled area. */
  | {
      readonly type: 'TRAIN_REQUESTED_ENTRY';
      readonly trainId: TrainId;
      readonly entryEdgeId: EdgeId;
    }
  /** A train has departed the controlled area. */
  | { readonly type: 'TRAIN_DEPARTED'; readonly trainId: TrainId }
  /**
   * A signal aspect changed.
   *
   * Signals are derived views: the interlocking engine computes
   * the new aspect and the `reason`, then publishes this event.
   * `from` and `to` capture the transition; `reason` is a
   * structured value (`@/engine/signals/SignalAspectChangeReason`)
   * that explains why the change happened.
   */
  | {
      readonly type: 'SIGNAL_ASPECT_CHANGED';
      readonly signalId: SignalId;
      readonly aspect: Aspect;
      /** The aspect the signal had before the change. */
      readonly fromAspect: Aspect;
      /** The structured reason for the change. */
      readonly reason: import('@/engine/signals').SignalAspectChangeReason;
      readonly atSimTime: number;
    }
  /** A switch moved to a new position. */
  | {
      readonly type: 'SWITCH_MOVED';
      readonly switchId: SwitchId;
      readonly position: SwitchPosition;
      /**
       * The position the switch came from. Omitted if the move
       * was a no-op (already in the requested position) or
       * if the producer does not know the previous position.
       * Future animation logic can tween between the two.
       */
      readonly fromPosition?: SwitchPosition;
    }
  /** A route was successfully established. */
  | { readonly type: 'ROUTE_SET'; readonly routeId: RouteId }
  /** A route was released (manually or automatically). */
  | { readonly type: 'ROUTE_RELEASED'; readonly routeId: RouteId }
  /** An objective was completed. */
  | { readonly type: 'OBJECTIVE_COMPLETED'; readonly objectiveId: ObjectiveId }
  /** A scenario started. */
  | { readonly type: 'SCENARIO_STARTED'; readonly scenarioId: ScenarioId }
  /** A scenario ended. */
  | { readonly type: 'SCENARIO_ENDED'; readonly scenarioId: ScenarioId }
  /** A log entry. The UI formats and displays these in the event log panel. */
  | {
      readonly type: 'LOG';
      readonly level: LogLevel;
      /**
       * Machine-readable reason code for rejected commands
       * (e.g. `"SWITCH_LOCKED"`, `"ROUTE_CONFLICT"`). Optional:
       * informational log entries may omit it. When present,
       * the human-readable message is generated from the code
       * via the engine's message catalogue, so localising UIs
       * can map codes to translations without parsing English.
       */
      readonly code?: string;
      readonly message: string;
      readonly atSimTime: number;
    };

/**
 * Command catalog — the typed surface for player input and
 * lifecycle control.
 *
 * Every command that mutates simulation state goes through
 * `Simulation.dispatch(command)`. The engine returns the events
 * produced. The engine **never** throws on the UI; denied actions
 * produce a `LOG` event instead.
 *
 * To extend: add a new variant to the `Command` union. The
 * `assertNever` helper in `result.ts` will surface unhandled cases
 * at the dispatch site during development.
 */

import type {
  SwitchId,
  SignalId,
  RouteId,
  ScenarioId,
  EdgeId,
} from './ids';
import type { SwitchPosition } from './primitives';

export type CommandType = Command['type'];

/**
 * The exhaustive list of all commands the engine accepts.
 *
 * Add new variants here. The `unknown` catch-all is intentionally
 * absent — we want TypeScript to flag any unhandled case.
 */
export type Command =
  /** Reserve a route from `origin` signal to `destination` signal. */
  | { readonly type: 'SET_ROUTE'; readonly origin: SignalId; readonly destination: SignalId }
  /** Cancel an active route by ID. */
  | { readonly type: 'CANCEL_ROUTE'; readonly routeId: RouteId }
  /**
   * Move a switch to the given position. Denied (with a `LOG` event)
   * if the switch is locked or occupied.
   */
  | {
      readonly type: 'CHANGE_SWITCH';
      readonly switchId: SwitchId;
      readonly position: SwitchPosition;
    }
  /** Start a scenario by ID. The engine resets state and loads the scenario. */
  | { readonly type: 'START_SCENARIO'; readonly scenarioId: ScenarioId }
  /** End the current scenario. */
  | { readonly type: 'END_SCENARIO' }
  /** Pause the simulation tick. */
  | { readonly type: 'PAUSE_SIMULATION' }
  /** Resume the simulation tick. */
  | { readonly type: 'RESUME_SIMULATION' }
  /** Set the tick rate (simulation seconds per real second). */
  | { readonly type: 'SET_TICK_RATE'; readonly hz: number }
  /**
   * Force the next tick immediately. Useful for testing and for
   * dev-tools shortcuts; the engine still respects pause state.
   */
  | { readonly type: 'TICK_NOW' }
  /**
   * Spawn a train at its entry edge. The train enters the
   * controlled area in the `WaitingForEntry` state. The engine
   * registers the train's definition, occupies the entry edge's
   * target node, and emits `TRAIN_REQUESTED_ENTRY`.
   */
  | { readonly type: 'SPAWN_TRAIN'; readonly train: import('./trains').TrainDefinition }
  /**
   * Release a train held at a platform. Transitions the train
   * from `StoppedAtPlatform` to `Departing`; the motion service
   * sets it to `Running` on the next tick. The dispatcher
   * issues this when the platform service is complete (e.g.
   * the passengers have boarded).
   */
  | { readonly type: 'DISPATCH_TRAIN'; readonly trainId: import('./ids').TrainId }
  /**
   * Tell the engine that a train has reached the end of its planned
   * path and is leaving the controlled area. Emitted by the
   * scenario scheduler or by a player command for dispatcher-driven
   * dispatch. (In milestone 1 trains depart on their own when their
   * route is complete and a `DISPATCH_TRAIN` objective is met.)
   */
  | { readonly type: 'TRAIN_DISPATCH'; readonly trainId: import('./ids').TrainId; readonly exitEdgeId: EdgeId };

/**
 * SwitchTransition — describes a single change to a switch.
 *
 * Even when movement is instantaneous (milestone 1), every
 * position change is recorded as a transition with explicit
 * `from` and `to` states. This shape leaves room for future
 * features without redesigning the API:
 *
 *   - **Transition time**: a `moving` lifecycle state and a
 *     `startedAt` field can be added; the `to` state becomes a
 *     future target, the `from` is the current state.
 *   - **Failure during movement**: the transition can be marked
 *     `failed: true` and the `to` state becomes the actual end
 *     state (e.g. `faulted`).
 *   - **Animation**: the `from` and `to` positions drive a UI
 *     tween between two known points.
 *   - **Replay**: the event log records transitions; replays
 *     rebuild state by applying them in order.
 */

import type { SwitchId, RouteId, TrainId } from '@/types/ids';
import type { SwitchPosition } from '@/types/primitives';
import type { SwitchLifecycleState } from './SwitchLifecycleState';

export type SwitchTransitionReason =
  | 'PLAYER_COMMAND'
  | 'ROUTE_RESERVE'
  | 'ROUTE_LOCK'
  | 'ROUTE_RELEASE'
  | 'TRAIN_ENTER'
  | 'TRAIN_EXIT'
  | 'INITIAL';

export interface SwitchTransition {
  readonly switchId: SwitchId;
  readonly from: SwitchTransitionState;
  readonly to: SwitchTransitionState;
  readonly reason: SwitchTransitionReason;
  /** ID of the route that triggered the transition, if any. */
  readonly routeId: RouteId | null;
  /** ID of the train that triggered the transition, if any. */
  readonly trainId: TrainId | null;
}

export interface SwitchTransitionState {
  readonly position: SwitchPosition;
  readonly lifecycle: SwitchLifecycleState;
}

/**
 * Switches engine — public surface.
 */

export { SwitchStateStore, isLocked, isOccupied } from './SwitchStateStore';
export type { SwitchStateStoreInit, SwitchStateStoreSerialized } from './SwitchStateStore';

export { SwitchReasonCode, switchReasonMessage, switchError } from './SwitchReasonCode';
export type { SwitchReasonCode as SwitchReasonCodeType } from './SwitchReasonCode';

export { isSwitchLifecycleState } from './SwitchLifecycleState';
export type { SwitchLifecycleState } from './SwitchLifecycleState';

export type { SwitchTransition, SwitchTransitionReason, SwitchTransitionState } from './SwitchTransition';

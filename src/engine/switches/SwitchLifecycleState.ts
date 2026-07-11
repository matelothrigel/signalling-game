/**
 * Switch lifecycle state.
 *
 * Every switch has a *lifecycle* in addition to its physical
 * position. The lifecycle is the source of truth for whether
 * the switch can be moved, reserved, or traversed.
 *
 * Milestone 1 uses four states:
 *
 *   - `free`     — not reserved, not locked, not occupied.
 *   - `reserved` — a route has reserved the switch but is not
 *                  yet active. The position must hold.
 *   - `locked`   — an active route holds the switch. The
 *                  position must hold. Cannot be moved.
 *   - `occupied` — a train is on the switch. Cannot be moved.
 *
 * Future states (not implemented in milestone 1):
 *
 *   - `faulted`     — the switch has failed (e.g. points won't
 *                     move to the requested position).
 *   - `maintenance` — the switch is under maintenance work.
 *   - `moving`      — the switch is in the middle of a position
 *                     change (when transition time is added).
 *
 * Adding new states is a deliberate, type-visible change. The
 * `SwitchStateStore` validates every transition.
 */

export type SwitchLifecycleState =
  | 'free'
  | 'reserved'
  | 'locked'
  | 'occupied';

export const isSwitchLifecycleState = (s: unknown): s is SwitchLifecycleState =>
  s === 'free' || s === 'reserved' || s === 'locked' || s === 'occupied';

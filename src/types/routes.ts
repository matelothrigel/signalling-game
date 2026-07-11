/**
 * Route domain model.
 *
 * A route is a reserved path from an origin signal to a destination
 * signal. The interlocking layer builds routes by finding a path
 * through the topology graph subject to safety constraints.
 *
 * - Sections listed in `sectionIds` are reserved (no other route may
 *   reserve them).
 * - Switches listed in `lockedSwitchIds` are locked (cannot be moved).
 * - The entry signal (in `entrySignalId`) is cleared to `proceed`.
 *
 * The route releases automatically as the train traverses it (the
 * trailing edge of the train becomes free) or manually via the
 * `CANCEL_ROUTE` command.
 */

import type {
  NodeId,
  EdgeId,
  SwitchId,
  SignalId,
  RouteId,
} from './ids';
import type { Aspect } from './primitives';

/**
 * A route is active while a train is using it. The route remains
 * reserved after the train has cleared the rear portion, so that the
 * trailing switches do not flop underneath a passing train.
 */
export interface Route {
  readonly id: RouteId;
  /** Signal that protects entry to the route. */
  readonly entrySignalId: SignalId;
  /** Signal at the far end of the route. */
  readonly exitSignalId: SignalId;
  /** Sequence of section nodes the route passes through (in order). */
  readonly sectionIds: readonly NodeId[];
  /** Sequence of edges the route passes through (in order). */
  readonly edgeIds: readonly EdgeId[];
  /** Switches locked for the duration of the route. */
  readonly lockedSwitchIds: readonly SwitchId[];
  /** `true` while the route is in active service. */
  readonly active: boolean;
  /** Aspect shown by `entrySignalId` while the route is active. */
  readonly entryAspect: Aspect;
}

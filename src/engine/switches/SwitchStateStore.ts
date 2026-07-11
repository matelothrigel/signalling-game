/**
 * SwitchStateStore — runtime state of every switch in the
 * controlled area.
 *
 * The store holds one {@link SwitchState} per `SwitchId`. It
 * exposes explicit **transition methods** rather than property
 * setters, so that every change is validated against the
 * current lifecycle and produces a {@link SwitchTransition}
 * record on success.
 *
 * The transition model is the same one that future movement
 * time, failure handling, and animations will build on. In
 * milestone 1 transitions are atomic — the `from` and `to`
 * snapshots are produced and applied in the same call. Future
 * versions may insert a `moving` intermediate state and a
 * `startedAt` field without changing the public surface.
 *
 * All transition methods return a `Result<SwitchTransition, EngineError>`.
 * The error's `code` is one of the stable
 * {@link SwitchReasonCode} values; the message is generated
 * from the code by `switchReasonMessage`.
 *
 * Lifecycle summary:
 *
 *   free ──reserve──▶ reserved ──lock──▶ locked
 *     ▲                  │                  │
 *     │                  └──release────┐     │
 *     │                                ▼     │
 *     └────release──────────────────free ◀──┘
 *
 *   free / reserved ──occupy──▶ occupied ──vacate──▶ free
 *
 *   locked switches cannot be moved, reserved, or occupied.
 */

import {
  type SwitchId,
  type RouteId,
  type TrainId,
  asId,
} from '@/types/ids';
import type { SwitchPosition } from '@/types/primitives';
import { type Result, ok, err } from '@/types/result';
import type { SwitchState } from '@/types/infrastructure';
import type { SwitchTransition, SwitchTransitionReason } from './SwitchTransition';
import { SwitchReasonCode, switchError } from './SwitchReasonCode';

export interface SwitchStateStoreInit {
  readonly switchIds: readonly SwitchId[];
  readonly initialPositions?: ReadonlyMap<SwitchId, SwitchPosition>;
}

export interface SwitchStateStoreSerialized {
  readonly switches: Readonly<Record<string, SwitchState>>;
}

export class SwitchStateStore {
  private readonly states: Map<SwitchId, SwitchState>;

  constructor(init: SwitchStateStoreInit) {
    this.states = new Map();
    for (const id of init.switchIds) {
      const position: SwitchPosition = init.initialPositions?.get(id) ?? 'normal';
      this.states.set(id, {
        id,
        position,
        lifecycle: 'free',
        lockedBy: null,
        occupiedBy: null,
      });
    }
  }

  /* ------------------------------------------------------------ */
  /* Queries                                                       */
  /* ------------------------------------------------------------ */

  public get(id: SwitchId): SwitchState | undefined {
    return this.states.get(id);
  }

  public require(id: SwitchId): SwitchState {
    const s = this.states.get(id);
    if (!s) throw new Error(`SwitchStateStore: unknown switch ${id}`);
    return s;
  }

  public getAll(): readonly SwitchState[] {
    return Array.from(this.states.values());
  }

  public size(): number {
    return this.states.size;
  }

  /* ------------------------------------------------------------ */
  /* Transitions                                                   */
  /* ------------------------------------------------------------ */

  /**
   * Request a position change. Validates that the switch is not
   * locked or occupied. If the switch is already in the requested
   * position, the call is a successful no-op (still produces a
   * transition record so the caller can log the attempt).
   */
  public changePosition(
    id: SwitchId,
    newPosition: SwitchPosition,
  ): Result<SwitchTransition, import('@/types/result').EngineError> {
    const current = this.states.get(id);
    if (!current) {
      return err(switchError(SwitchReasonCode.UNKNOWN, { switchId: id }));
    }
    if (current.lifecycle === 'locked') {
      return err(
        switchError(SwitchReasonCode.LOCKED, {
          switchId: id,
          heldBy: current.lockedBy ?? '?',
          current: current.lifecycle,
        }),
      );
    }
    if (current.lifecycle === 'occupied') {
      return err(
        switchError(SwitchReasonCode.OCCUPIED, {
          switchId: id,
          occupiedBy: current.occupiedBy ?? '?',
          current: current.lifecycle,
        }),
      );
    }

    if (current.position === newPosition) {
      return ok(this.buildTransition(current, current, 'PLAYER_COMMAND', null, null));
    }

    const next: SwitchState = { ...current, position: newPosition };
    this.states.set(id, next);
    return ok(this.buildTransition(current, next, 'PLAYER_COMMAND', null, null));
  }

  /** Reserve a switch for a route. `free → reserved`. */
  public reserve(id: SwitchId, routeId: RouteId): Result<SwitchTransition, import('@/types/result').EngineError> {
    const current = this.states.get(id);
    if (!current) {
      return err(switchError(SwitchReasonCode.UNKNOWN, { switchId: id }));
    }
    if (current.lifecycle !== 'free') {
      if (current.lifecycle === 'reserved' || current.lifecycle === 'locked') {
        return err(
          switchError(SwitchReasonCode.ALREADY_RESERVED, {
            switchId: id,
            heldBy: current.lockedBy ?? '?',
            current: current.lifecycle,
          }),
        );
      }
      return err(
        switchError(SwitchReasonCode.NOT_FREE, {
          switchId: id,
          current: current.lifecycle,
        }),
      );
    }
    const next: SwitchState = {
      ...current,
      lifecycle: 'reserved',
      lockedBy: routeId,
    };
    this.states.set(id, next);
    return ok(this.buildTransition(current, next, 'ROUTE_RESERVE', routeId, null));
  }

  /** Promote a reserved switch to locked. `reserved → locked`. */
  public lock(id: SwitchId, routeId: RouteId): Result<SwitchTransition, import('@/types/result').EngineError> {
    const current = this.states.get(id);
    if (!current) {
      return err(switchError(SwitchReasonCode.UNKNOWN, { switchId: id }));
    }
    if (current.lifecycle !== 'reserved') {
      if (current.lifecycle === 'free') {
        return err(
          switchError(SwitchReasonCode.NOT_RESERVED, {
            switchId: id,
            current: current.lifecycle,
          }),
        );
      }
      if (current.lifecycle === 'occupied') {
        return err(switchError(SwitchReasonCode.INVALID_TRANSITION, { switchId: id, current: current.lifecycle }));
      }
      return err(
        switchError(SwitchReasonCode.RESERVED_BY_ANOTHER, {
          switchId: id,
          heldBy: current.lockedBy ?? '?',
        }),
      );
    }
    if (current.lockedBy !== routeId) {
      return err(
        switchError(SwitchReasonCode.RESERVED_BY_ANOTHER, {
          switchId: id,
          heldBy: current.lockedBy ?? '?',
        }),
      );
    }
    const next: SwitchState = { ...current, lifecycle: 'locked' };
    this.states.set(id, next);
    return ok(this.buildTransition(current, next, 'ROUTE_LOCK', routeId, null));
  }

  /**
   * Release a switch held by `routeId`. `reserved → free` or
   * `locked → free`.
   */
  public release(id: SwitchId, routeId: RouteId): Result<SwitchTransition, import('@/types/result').EngineError> {
    const current = this.states.get(id);
    if (!current) {
      return err(switchError(SwitchReasonCode.UNKNOWN, { switchId: id }));
    }
    if (current.lifecycle !== 'reserved' && current.lifecycle !== 'locked') {
      return err(
        switchError(SwitchReasonCode.NOT_HELD, {
          switchId: id,
          current: current.lifecycle,
        }),
      );
    }
    if (current.lockedBy !== routeId) {
      return err(
        switchError(SwitchReasonCode.HELD_BY_ANOTHER, {
          switchId: id,
          heldBy: current.lockedBy ?? '?',
        }),
      );
    }
    const next: SwitchState = {
      ...current,
      lifecycle: 'free',
      lockedBy: null,
    };
    this.states.set(id, next);
    return ok(this.buildTransition(current, next, 'ROUTE_RELEASE', routeId, null));
  }

  /**
   * Mark a switch as occupied by a train. `free → occupied` or
   * `reserved → occupied`. Locked switches cannot be occupied.
   */
  public occupy(id: SwitchId, trainId: TrainId): Result<SwitchTransition, import('@/types/result').EngineError> {
    const current = this.states.get(id);
    if (!current) {
      return err(switchError(SwitchReasonCode.UNKNOWN, { switchId: id }));
    }
    if (current.lifecycle === 'locked') {
      return err(
        switchError(SwitchReasonCode.CANNOT_OCCUPY_LOCKED, {
          switchId: id,
          current: current.lifecycle,
        }),
      );
    }
    if (current.lifecycle === 'occupied') {
      return err(
        switchError(SwitchReasonCode.OCCUPIED, {
          switchId: id,
          occupiedBy: current.occupiedBy ?? '?',
          current: current.lifecycle,
        }),
      );
    }
    const next: SwitchState = { ...current, lifecycle: 'occupied', occupiedBy: trainId };
    this.states.set(id, next);
    return ok(this.buildTransition(current, next, 'TRAIN_ENTER', null, trainId));
  }

  /** Free a switch previously occupied by `trainId`. `occupied → free`. */
  public vacate(id: SwitchId, trainId: TrainId): Result<SwitchTransition, import('@/types/result').EngineError> {
    const current = this.states.get(id);
    if (!current) {
      return err(switchError(SwitchReasonCode.UNKNOWN, { switchId: id }));
    }
    if (current.lifecycle !== 'occupied') {
      return err(
        switchError(SwitchReasonCode.NOT_OCCUPIED, {
          switchId: id,
          current: current.lifecycle,
        }),
      );
    }
    if (current.occupiedBy !== trainId) {
      return err(
        switchError(SwitchReasonCode.OCCUPIED_BY_ANOTHER, {
          switchId: id,
          occupiedBy: current.occupiedBy ?? '?',
        }),
      );
    }
    const next: SwitchState = { ...current, lifecycle: 'free', occupiedBy: null };
    this.states.set(id, next);
    return ok(this.buildTransition(current, next, 'TRAIN_EXIT', null, trainId));
  }

  /* ------------------------------------------------------------ */
  /* Serialization                                                 */
  /* ------------------------------------------------------------ */

  public serialize(): SwitchStateStoreSerialized {
    const switches: Record<string, SwitchState> = {};
    for (const [id, state] of this.states) {
      switches[id] = state;
    }
    return { switches };
  }

  /**
   * Restore from a snapshot. Switches in the snapshot not in
   * the store are added (defaulting position to `normal` if
   * not present); switches in the store not in the snapshot
   * are dropped.
   */
  public load(snap: SwitchStateStoreSerialized): Result<void, import('@/types/result').EngineError> {
    this.states.clear();
    for (const [rawId, state] of Object.entries(snap.switches)) {
      this.states.set(asId<SwitchId>(rawId), state);
    }
    return ok(undefined);
  }

  /* ------------------------------------------------------------ */
  /* Internal helpers                                              */
  /* ------------------------------------------------------------ */

  private buildTransition(
    from: SwitchState,
    to: SwitchState,
    reason: SwitchTransitionReason,
    routeId: RouteId | null,
    trainId: TrainId | null,
  ): SwitchTransition {
    return {
      switchId: from.id,
      from: { position: from.position, lifecycle: from.lifecycle },
      to: { position: to.position, lifecycle: to.lifecycle },
      reason,
      routeId,
      trainId,
    };
  }
}

/** Convenience type guard: is the given lifecycle state `locked`? */
export const isLocked = (s: SwitchState): boolean => s.lifecycle === 'locked';

/** Convenience type guard: is the given lifecycle state `occupied`? */
export const isOccupied = (s: SwitchState): boolean => s.lifecycle === 'occupied';

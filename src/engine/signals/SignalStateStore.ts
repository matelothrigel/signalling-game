/**
 * SignalStateStore — runtime state of every signal in the
 * controlled area.
 *
 * **Signals are derived views of the interlocking state.**
 * The store never decides what aspect a signal should show.
 * The interlocking engine (Section 7) computes the permitted
 * aspect and the `reason` for the change, then calls
 * `setAspect` to record the decision. The store:
 *
 *   1. Validates the signal exists (returns a structured
 *      `EngineError` with code `SIGNAL_UNKNOWN` otherwise).
 *   2. Records the new aspect and the `lastChangeReason` /
 *      `lastChangeAtSimTime` on the signal state.
 *   3. Returns a {@link SignalAspectChange} record describing
 *      the transition. The caller is responsible for emitting
 *      events (e.g. `SIGNAL_ASPECT_CHANGED`, `LOG`).
 *
 * Keeping the store passive means the same store can be used
 * by any interlocking strategy without code changes — the
 * strategy is the brain, the store is the notepad.
 *
 * A no-op (the requested aspect is already the current one)
 * still returns a `SignalAspectChange` so the caller can
 * decide whether to emit a "no change" event.
 */

import { type Result, ok, err } from '@/types/result';
import type { SignalState } from '@/types/infrastructure';
import type { Aspect } from '@/types/primitives';
import { asId, type SignalId } from '@/types/ids';
import { type SignalAspectChangeReason } from './SignalAspectChangeReason';
import { signalError, SignalReasonCode } from './SignalReasonCode';

export interface SignalStateStoreInit {
  /** The signal IDs to track. Order is preserved in `getAll()`. */
  readonly signalIds: readonly SignalId[];
  /** Optional initial aspects keyed by `SignalId`. Defaults to `stop`. */
  readonly initialAspects?: ReadonlyMap<SignalId, Aspect>;
}

/** Description of a single aspect transition. Returned by `setAspect`. */
export interface SignalAspectChange {
  readonly signalId: SignalId;
  readonly from: Aspect;
  readonly to: Aspect;
  readonly reason: SignalAspectChangeReason;
  readonly atSimTime: number;
  /** True when the aspect actually changed (false on a no-op). */
  readonly changed: boolean;
}

/** Serialised form of the signal state store. */
export interface SignalStateStoreSerialized {
  readonly signals: Readonly<Record<string, SignalState>>;
}

export class SignalStateStore {
  private readonly states: Map<SignalId, SignalState>;

  constructor(init: SignalStateStoreInit) {
    this.states = new Map();
    for (const id of init.signalIds) {
      const aspect: Aspect = init.initialAspects?.get(id) ?? 'stop';
      this.states.set(id, {
        id,
        aspect,
        controlledBy: null,
        lastChangeReason: { kind: 'INITIAL' },
        lastChangeAtSimTime: 0,
      });
    }
  }

  /* ------------------------------------------------------------ */
  /* Queries                                                       */
  /* ------------------------------------------------------------ */

  public get(id: SignalId): SignalState | undefined {
    return this.states.get(id);
  }

  public require(id: SignalId): SignalState {
    const s = this.states.get(id);
    if (!s) throw new Error(`SignalStateStore: unknown signal ${id}`);
    return s;
  }

  public getAll(): readonly SignalState[] {
    return Array.from(this.states.values());
  }

  public size(): number {
    return this.states.size;
  }

  /* ------------------------------------------------------------ */
  /* The only mutator                                              */
  /* ------------------------------------------------------------ */

  /**
   * Record the interlocking engine's decision about a signal's
   * aspect. The store does not validate whether the aspect is
   * "permitted" — the engine has already done that. The store
   * just records the new state, the reason, and the time.
   *
   * Returns a {@link SignalAspectChange} describing the
   * transition. The `changed` flag is `true` only when the
   * aspect actually moved; the caller uses it to decide
   * whether to emit events.
   */
  public setAspect(
    id: SignalId,
    newAspect: Aspect,
    reason: SignalAspectChangeReason,
    atSimTime: number,
  ): Result<SignalAspectChange, import('@/types/result').EngineError> {
    const current = this.states.get(id);
    if (!current) {
      return err(
        signalError(SignalReasonCode.UNKNOWN, {
          signalId: id,
          current: 'undefined',
        }),
      );
    }

    const changed = current.aspect !== newAspect;
    if (changed) {
      const next: SignalState = {
        ...current,
        aspect: newAspect,
        lastChangeReason: reason,
        lastChangeAtSimTime: atSimTime,
      };
      this.states.set(id, next);
    }

    return ok({
      signalId: id,
      from: current.aspect,
      to: newAspect,
      reason,
      atSimTime,
      changed,
    });
  }

  /**
   * Update the route that controls a signal. Used by the
   * interlocking engine when a route is set or released.
   * Does not emit events; the caller decides what to publish.
   */
  public setControlledBy(
    id: SignalId,
    routeId: import('@/types/ids').RouteId | null,
  ): Result<void, import('@/types/result').EngineError> {
    const current = this.states.get(id);
    if (!current) {
      return err(
        signalError(SignalReasonCode.UNKNOWN, { signalId: id }),
      );
    }
    this.states.set(id, { ...current, controlledBy: routeId });
    return ok(undefined);
  }

  /* ------------------------------------------------------------ */
  /* Serialization                                                 */
  /* ------------------------------------------------------------ */

  public serialize(): SignalStateStoreSerialized {
    const signals: Record<string, SignalState> = {};
    for (const [id, state] of this.states) {
      signals[id] = state;
    }
    return { signals };
  }

  public load(snap: SignalStateStoreSerialized): Result<void, import('@/types/result').EngineError> {
    this.states.clear();
    for (const [rawId, state] of Object.entries(snap.signals)) {
      this.states.set(asId<SignalId>(rawId), state);
    }
    return ok(undefined);
  }
}

/**
 * SectionStateStore — runtime state of every track section in
 * the controlled area.
 *
 * Each section carries two pieces of runtime state:
 *
 *   - `occupiedBy`: the train currently on the section, if any.
 *     Set by the train-motion code (Section 8); read by the
 *     interlocking engine's `TrackClearRule`.
 *   - `reservedBy`: the route that has reserved the section,
 *     if any. Set by the interlocking engine when a route is
 *     set; cleared when the route is released.
 *
 * The store is a passive data structure; the only mutators are
 * `setOccupied` and `setReserved`, both returning
 * `Result<void, EngineError>` on validation failures.
 */

import { type Result, ok, err } from '@/types/result';
import { asId, type NodeId, type RouteId, type TrainId } from '@/types/ids';
import { sectionError, SectionReasonCode } from './SectionReasonCode';
import type { SectionState } from '@/types/infrastructure';

export interface SectionStateStoreInit {
  /** The section IDs to track. Order is preserved in `getAll()`. */
  readonly sectionIds: readonly NodeId[];
}

export interface SectionStateStoreSerialized {
  readonly sections: Readonly<Record<string, SectionState>>;
}

export class SectionStateStore {
  private readonly states: Map<NodeId, SectionState>;

  constructor(init: SectionStateStoreInit) {
    this.states = new Map();
    for (const id of init.sectionIds) {
      this.states.set(id, {
        id,
        occupiedBy: null,
        reservedBy: null,
      });
    }
  }

  /* ------------------------------------------------------------ */
  /* Queries                                                       */
  /* ------------------------------------------------------------ */

  public get(id: NodeId): SectionState | undefined {
    return this.states.get(id);
  }

  public require(id: NodeId): SectionState {
    const s = this.states.get(id);
    if (!s) throw new Error(`SectionStateStore: unknown section ${id}`);
    return s;
  }

  public getAll(): readonly SectionState[] {
    return Array.from(this.states.values());
  }

  public size(): number {
    return this.states.size;
  }

  /* ------------------------------------------------------------ */
  /* Mutators                                                      */
  /* ------------------------------------------------------------ */

  /**
   * Mark a section as occupied by a train. The interlocking
   * engine's `TrackClearRule` rejects routes that would
   * traverse an occupied section. The train-motion code calls
   * this on entry and `setOccupied(id, null)` on exit.
   */
  public setOccupied(
    id: NodeId,
    trainId: TrainId | null,
  ): Result<void, import('@/types/result').EngineError> {
    const current = this.states.get(id);
    if (!current) {
      return err(sectionError(SectionReasonCode.UNKNOWN, { sectionId: id }));
    }
    this.states.set(id, { ...current, occupiedBy: trainId });
    return ok(undefined);
  }

  /**
   * Mark a section as reserved by a route. The interlocking
   * engine calls this when a route is set, and `setReserved(id,
   * null)` when the route is released. `TrackClearRule` rejects
   * routes that would traverse a section reserved by another
   * route.
   */
  public setReserved(
    id: NodeId,
    routeId: RouteId | null,
  ): Result<void, import('@/types/result').EngineError> {
    const current = this.states.get(id);
    if (!current) {
      return err(sectionError(SectionReasonCode.UNKNOWN, { sectionId: id }));
    }
    this.states.set(id, { ...current, reservedBy: routeId });
    return ok(undefined);
  }

  /* ------------------------------------------------------------ */
  /* Serialization                                                 */
  /* ------------------------------------------------------------ */

  public serialize(): SectionStateStoreSerialized {
    const sections: Record<string, SectionState> = {};
    for (const [id, state] of this.states) {
      sections[id] = state;
    }
    return { sections };
  }

  public load(snap: SectionStateStoreSerialized): Result<void, import('@/types/result').EngineError> {
    this.states.clear();
    for (const [rawId, state] of Object.entries(snap.sections)) {
      this.states.set(asId<NodeId>(rawId), state);
    }
    return ok(undefined);
  }
}

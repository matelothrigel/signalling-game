/**
 * Simulation store — the Zustand bridge between the engine
 * and React.
 *
 * The store is the **only** place where the engine's event
 * stream is consumed. It subscribes once, projects the
 * engine state into a serializable `SimulationSnapshot` on
 * every event batch, and exposes the snapshot via Zustand.
 * Components read from the snapshot via `useStore` /
 * `useStore.getState`; they never call into the engine
 * directly.
 *
 * ## Architecture
 *
 * ```
 *   engine ──▶ EventBus ──▶ store (subscribe) ──▶ projectSnapshot ──▶ setState
 *                                                              │
 *                                                              ▼
 *                                                       useStore (hooks)
 *                                                              │
 *                                                              ▼
 *                                                        React components
 * ```
 *
 * ## TICK coalescing
 *
 * `TIME_TICK` events arrive on every tick (default 1 Hz
 * but can be higher). Re-projecting the entire snapshot
 * for every tick would be wasteful: the data (switches,
 * signals, sections, routes, trains) is unchanged; only
 * `simTime` and `lastTickAtSimTime` move. The store
 * coalesces by carrying `simTime` separately and only
 * mutating the snapshot's time when a TICK arrives.
 *
 * ## Determinism
 *
 * The store is a pure consumer of engine state and
 * events. It never calls back into the engine except via
 * `dispatch(command)`, which is the engine's only
 * mutating entry point. Replaying the same event
 * sequence produces the same snapshot sequence.
 */

import { create } from 'zustand';
import type { Command } from '@/types/commands';
import type { Event } from '@/types/events';
import type { PlatformId } from '@/types/ids';
import type { Platform } from '@/types/infrastructure';
import type { Simulation } from '@/engine/core';
import {
  projectSnapshot,
  type EngineProjectionSource,
  type SimulationSnapshot,
} from './SimulationSnapshot';

export interface SimulationStoreState {
  readonly snapshot: SimulationSnapshot;
  /**
   * Recent events. Capped so a long-running simulation
   * does not grow the store unbounded. Used by the event
   * log component.
   */
  readonly recentEvents: readonly Event[];
  /**
   * The most recent sim-time at which a tick occurred.
   * This is a separate top-level field so the store can
   * update it without rebuilding the snapshot maps.
   */
  readonly lastTickAtSimTime: number;
}

export interface SimulationStoreActions {
  /**
   * Inject an engine into the store. The store subscribes
   * to its event stream and begins projecting snapshots.
   * Replaces any previously injected engine.
   */
  readonly setEngine: (
    engine: Simulation,
    platforms?: ReadonlyMap<PlatformId, Platform>,
  ) => void;
  /**
   * Dispatch a command to the engine. The command's
   * effects propagate to the snapshot via the event
   * stream subscription.
   */
  readonly dispatch: (command: Command) => void;
  /**
   * Manually clear the engine and reset the store to a
   * placeholder snapshot. Used by tests and by the
   * scenario-selector "stop" action.
   */
  readonly detach: () => void;
}

export type SimulationStore = SimulationStoreState & SimulationStoreActions;

const EMPTY_PLATFORMS: ReadonlyMap<PlatformId, Platform> = new Map();

const placeholderSnapshot = (
  platforms: ReadonlyMap<PlatformId, Platform>,
): SimulationSnapshot => ({
  simTime: 0,
  paused: false,
  tickHz: 1,
  isRunning: false,
  topology: { nodes: [], edges: [] },
  switches: new Map(),
  signals: new Map(),
  sections: new Map(),
  routes: new Map(),
  trains: new Map(),
  platforms,
  scenarios: new Map(),
  activeScenarioId: null,
  objectives: [],
  lastEventKind: null,
  lastTickAtSimTime: 0,
});

const MAX_RECENT_EVENTS = 200;

export const useSimulationStore = create<SimulationStore>((set, get) => {
  let engine: Simulation | null = null;
  let platforms: ReadonlyMap<PlatformId, Platform> = EMPTY_PLATFORMS;
  let unsubscribe: (() => void) | null = null;

  const apply = (events: readonly Event[]): void => {
    if (events.length === 0) return;
    if (!engine) return;

    // Extract the latest tick time (if any) and the last
    // event kind for diagnostics.
    let newTickAt: number | null = null;
    let lastKind: string | null = null;
    for (const e of events) {
      if (e.type === 'TIME_TICK') newTickAt = e.simTime;
      lastKind = e.type;
    }
    const prev = get();
    const platformsForProjection = platforms;
    const newLastTick = newTickAt ?? prev.lastTickAtSimTime;

    const newSnapshot = projectSnapshot(
      engine as unknown as EngineProjectionSource,
      platformsForProjection,
      prev.snapshot,
      lastKind,
      newLastTick,
    );

    const merged: readonly Event[] =
      prev.recentEvents.length + events.length <= MAX_RECENT_EVENTS
        ? [...prev.recentEvents, ...events]
        : [
            ...prev.recentEvents.slice(
              prev.recentEvents.length - MAX_RECENT_EVENTS + events.length,
            ),
            ...events,
          ];

    set({ snapshot: newSnapshot, recentEvents: merged, lastTickAtSimTime: newLastTick });
  };

  return {
    snapshot: placeholderSnapshot(EMPTY_PLATFORMS),
    recentEvents: [],
    lastTickAtSimTime: 0,

    setEngine: (next, nextPlatforms) => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      engine = next;
      platforms = nextPlatforms ?? EMPTY_PLATFORMS;
      unsubscribe = next.subscribe((events) => apply(events));
      // Project once so the UI sees the initial state.
      const initial = projectSnapshot(
        next as unknown as EngineProjectionSource,
        platforms,
        null,
        'INITIAL',
        0,
      );
      set({
        snapshot: initial,
        recentEvents: [],
        lastTickAtSimTime: 0,
      });
    },

    dispatch: (command) => {
      if (!engine) return;
      engine.dispatch(command);
    },

    detach: () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      engine = null;
      platforms = EMPTY_PLATFORMS;
      set({
        snapshot: placeholderSnapshot(EMPTY_PLATFORMS),
        recentEvents: [],
        lastTickAtSimTime: 0,
      });
    },
  };
});

/**
 * Selector hook: the full snapshot. Components that need
 * the entire snapshot should use this; for finer-grained
 * access, use the selectors below.
 */
export const useSnapshot = (): SimulationSnapshot =>
  useSimulationStore((s) => s.snapshot);

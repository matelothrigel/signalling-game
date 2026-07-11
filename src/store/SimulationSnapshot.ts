/**
 * UI snapshot — the serializable view of the engine.
 *
 * The store projects the engine state into a snapshot on
 * every event batch and React reads from the snapshot via
 * Zustand selectors. The snapshot is **pure data**: no
 * live engine references, no React types, no DOM types.
 * This is the boundary between the engine and the UI:
 * the renderer must read everything it needs from here
 * and never call back into the engine for visual
 * decisions.
 *
 * ## Why a snapshot?
 *
 * - The engine is stateful; React components should be
 *   re-renderable from a plain object. A snapshot is that
 *   plain object.
 * - The snapshot is what `Simulation.serialize` already
 *   produces; the store uses the same shape so save/load
 *   (Section 17) is a single source of truth.
 * - `assertNever` over the `Event` union ensures every
 *   event kind can affect the projection; missing cases
 *   fail the build.
 *
 * ## Stability
 *
 * Maps are kept as `ReadonlyMap` (immutable references)
 * and rebuilt only when the underlying data changes.
 * The top-level `SimulationSnapshot` is a new object on
 * every change so Zustand's `===` comparison works
 * correctly. React component memoization (`useMemo`,
 * `React.memo`) is the renderer's responsibility.
 */

import type {
  TrainId,
  NodeId,
  SwitchId,
  SignalId,
  RouteId,
  PlatformId,
  ScenarioId,
  ObjectiveId,
} from '@/types/ids';
import type { SectionState, SignalState, SwitchState } from '@/types/infrastructure';
import type { TrainState } from '@/types/trains';
import type { Route } from '@/types/routes';
import type { Platform } from '@/types/infrastructure';
import type { Scenario } from '@/types/scenario';
import type { TopologyData } from '@/engine/topology';

/** Per-objective view exposed by the simulation. */
export interface ObjectiveSnapshot {
  readonly id: ObjectiveId;
  readonly description: string;
  readonly completed: boolean;
  readonly completedAtSimTime: number | null;
}

/** The full, serializable view of the simulation. */
export interface SimulationSnapshot {
  readonly simTime: number;
  readonly paused: boolean;
  readonly tickHz: number;
  readonly isRunning: boolean;
  /** Topology serialised to data (no engine object). */
  readonly topology: TopologyData;
  readonly switches: ReadonlyMap<SwitchId, SwitchState>;
  readonly signals: ReadonlyMap<SignalId, SignalState>;
  readonly sections: ReadonlyMap<NodeId, SectionState>;
  readonly routes: ReadonlyMap<RouteId, Route>;
  readonly trains: ReadonlyMap<TrainId, TrainState>;
  /** Platforms catalogue (passed through). */
  readonly platforms: ReadonlyMap<PlatformId, Platform>;
  /** Registered scenarios (id-keyed). */
  readonly scenarios: ReadonlyMap<ScenarioId, Scenario>;
  /** The currently active scenario id, or `null`. */
  readonly activeScenarioId: ScenarioId | null;
  /** Current objective state (id-keyed). Empty if no scenario is active. */
  readonly objectives: readonly ObjectiveSnapshot[];
  /** Whether the most recent projection saw at least one event. */
  readonly lastEventKind: string | null;
  /** Last sim-time of the most recent tick (for rAF interp). */
  readonly lastTickAtSimTime: number;
}

/** Minimal subset of the engine surface the projector reads. */
export interface EngineProjectionSource {
  readonly time: { readonly now: () => number; readonly isPaused: () => boolean };
  readonly tickLoop: {
    readonly getTickRate: () => number;
    readonly isRunning: () => boolean;
  };
  readonly topology: { readonly serialize: () => unknown };
  readonly switchStore: { readonly getAll: () => readonly SwitchState[] };
  readonly signalStore: { readonly getAll: () => readonly SignalState[] };
  readonly sectionStore: { readonly getAll: () => readonly SectionState[] };
  readonly routeStore: { readonly getAll: () => readonly Route[] };
  readonly trainStore: { readonly getAll: () => readonly TrainState[] };
  readonly scenarioService: {
    readonly getAll: () => readonly Scenario[];
    readonly activeScenario: () => Scenario | null;
  };
  readonly objectiveChecker?: {
    readonly getViews: () => readonly ObjectiveSnapshot[];
  };
}

/**
 * Build a snapshot from the engine. Pure: same engine state
 * produces the same snapshot. The projector never mutates
 * the engine; it only reads.
 *
 * The `lastEventKind` and `lastTickAtSimTime` arguments are
 * carried in so the store can coalesce TICK events
 * efficiently (the store only calls the projector with
 * the latest time when a TICK arrives).
 */
export const projectSnapshot = (
  engine: EngineProjectionSource,
  platforms: ReadonlyMap<PlatformId, Platform>,
  prev: SimulationSnapshot | null,
  lastEventKind: string | null,
  lastTickAtSimTime: number,
): SimulationSnapshot => {
  const topologyEnvelope = engine.topology.serialize();
  const topologyData =
    (topologyEnvelope as { readonly data?: TopologyData }).data ?? null;
  if (!topologyData) {
    // The engine has no topology loaded. Return a
    // placeholder snapshot that the UI can detect.
    return {
      simTime: engine.time.now(),
      paused: engine.time.isPaused(),
      tickHz: engine.tickLoop.getTickRate(),
      isRunning: engine.tickLoop.isRunning(),
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
      lastEventKind,
      lastTickAtSimTime,
    };
  }

  // Reference-equal fast path: if the previous snapshot has
  // the same inputs and only the time has changed, return a
  // new snapshot that shares map references.
  if (
    prev !== null &&
    prev.topology === topologyData &&
    prev.simTime === engine.time.now() &&
    prev.paused === engine.time.isPaused() &&
    prev.tickHz === engine.tickLoop.getTickRate() &&
    prev.isRunning === engine.tickLoop.isRunning() &&
    prev.platforms === platforms &&
    lastEventKind === null // No structural change, just a tick
  ) {
    return prev;
  }

  // Reuse map references when the contents are unchanged so
  // React's shallow-equal memoization can skip work.
  const switches = rebuildMap(prev?.switches, engine.switchStore.getAll());
  const signals = rebuildMap(prev?.signals, engine.signalStore.getAll());
  const sections = rebuildMap(prev?.sections, engine.sectionStore.getAll());
  const routes = rebuildMap(prev?.routes, engine.routeStore.getAll());
  const trains = rebuildMap(prev?.trains, engine.trainStore.getAll());
  const scenarios = rebuildScenarioMap(
    prev?.scenarios,
    engine.scenarioService.getAll(),
  );
  const activeScenario = engine.scenarioService.activeScenario();
  const activeScenarioId = activeScenario ? activeScenario.id : null;
  const objectives = engine.objectiveChecker?.getViews() ?? [];

  return {
    simTime: engine.time.now(),
    paused: engine.time.isPaused(),
    tickHz: engine.tickLoop.getTickRate(),
    isRunning: engine.tickLoop.isRunning(),
    topology: topologyData,
    switches,
    signals,
    sections,
    routes,
    trains,
    platforms,
    scenarios,
    activeScenarioId,
    objectives,
    lastEventKind,
    lastTickAtSimTime,
  };
};

/**
 * Build a new map from the source data. If the resulting
 * map has the same entries as the previous map (by id and
 * content), return the previous map reference. Otherwise
 * return a fresh map.
 */
const rebuildMap = <K, V extends { readonly id: K }>(
  prev: ReadonlyMap<K, V> | undefined,
  source: readonly V[],
): ReadonlyMap<K, V> => {
  if (source.length === 0) {
    return prev ?? new Map();
  }
  const next = new Map<K, V>();
  for (const item of source) {
    next.set(item.id, item);
  }
  if (prev && mapsEqual(prev, next)) {
    return prev;
  }
  return next;
};

const rebuildScenarioMap = (
  prev: ReadonlyMap<ScenarioId, Scenario> | undefined,
  source: readonly Scenario[],
): ReadonlyMap<ScenarioId, Scenario> => {
  if (source.length === 0) {
    return prev ?? new Map();
  }
  const next = new Map<ScenarioId, Scenario>();
  for (const item of source) {
    next.set(item.id, item);
  }
  if (prev && mapsEqual(prev, next)) {
    return prev;
  }
  return next;
};

const mapsEqual = <K, V>(
  a: ReadonlyMap<K, V>,
  b: ReadonlyMap<K, V>,
): boolean => {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const bv = b.get(k);
    if (bv === undefined) return false;
    if (bv !== v) return false;
  }
  return true;
};

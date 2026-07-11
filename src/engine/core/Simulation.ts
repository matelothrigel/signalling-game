/**
 * Simulation — thin orchestrator over the engine services.
 *
 * **This class intentionally contains no business logic.** It wires
 * the services together, owns the public surface of the engine, and
 * delegates every meaningful action to one of the services.
 *
 * Layout:
 *
 *   Simulation
 *   ├─ TimeService        — owns the simulation clock
 *   ├─ RngService         — owns the seeded PRNG
 *   ├─ EventBus           — owns the event queue
 *   ├─ TickLoop           — drives the simulation forward
 *   ├─ SwitchStateStore   — runtime state of every switch
 *   ├─ SignalStateStore   — runtime state of every signal
 *   ├─ SectionStateStore  — runtime state of every section
 *   ├─ RouteStore         — active routes
 *   ├─ InterlockingEngine — route setting + safety rules
 *   ├─ TrainStateStore    — runtime state of every train
 *   ├─ TrainMotionService — drives the train FSM
 *   ├─ ScenarioService    — scenario lifecycle + timetable
 *   └─ CommandProcessor   — routes `Command`s to services
 *
 * Public surface:
 *   - `dispatch(command)`   — the only mutation entry point
 *   - `subscribe(handler)`  — the only event entry point
 *   - `start()` / `stop()`  — tick loop lifecycle
 *   - `serialize()` / `load(state)` — state save/restore
 *
 * State is composed from each service. Replaying the same scenario
 * with the same seed produces bit-identical runs.
 */

import type { Command } from '@/types/commands';
import type { Event } from '@/types/events';
import type { Versioned } from '@/types/versioned';
import { envelope, CURRENT_VERSION } from '@/types/versioned';
import { type Result, err, engineError } from '@/types/result';

import { TimeService, type TimeState } from './TimeService';
import { RngService, type RngState } from './RngService';
import { EventBus, type EventHandler } from './EventBus';
import { TickLoop, type TickLoopOptions } from './TickLoop';
import { CommandProcessor } from './CommandProcessor';
import {
  SwitchStateStore,
  type SwitchStateStoreSerialized,
} from '@/engine/switches';
import {
  SignalStateStore,
  type SignalStateStoreSerialized,
} from '@/engine/signals';
import {
  SectionStateStore,
  type SectionStateStoreSerialized,
} from '@/engine/sections';
import {
  RouteStore,
  type RouteStoreSerialized,
} from '@/engine/routes';
import {
  InterlockingEngine,
  type InterlockingEngineDeps,
} from '@/engine/interlocking';
import {
  TrainStateStore,
  type TrainStateStoreSerialized,
} from '@/engine/trains';
import {
  TrainMotionService,
  type TrainMotionServiceDeps,
} from '@/engine/trains';
import {
  ScenarioService,
  type ScenarioServiceOptions,
  ObjectiveChecker,
  type ObjectiveCheckerSource,
  type ObjectiveView,
} from '@/engine/scenarios';
import { Topology } from '@/engine/topology';
import type { SwitchId } from '@/types/ids';
import type { SwitchPosition } from '@/types/primitives';
import type { SignalId } from '@/types/ids';
import type { Aspect } from '@/types/primitives';
import type { Platform } from '@/types/infrastructure';
import type { PlatformId } from '@/types/ids';
import type { Scenario } from '@/types/scenario';

/** Persistable state of the full simulation. */
export interface SimulationState {
  readonly version: number;
  readonly time: TimeState;
  readonly rng: RngState;
  readonly switches: SwitchStateStoreSerialized;
  readonly signals: SignalStateStoreSerialized;
  readonly sections: SectionStateStoreSerialized;
  readonly routes: RouteStoreSerialized;
  readonly trains: TrainStateStoreSerialized;
}

/** Constructor options. */
export interface SimulationOptions {
  /**
   * Seed for the RNG service. Default `1` (deterministic). Pass
   * an explicit value for reproducible scenarios.
   */
  readonly seed?: number | string;
  /**
   * Initial tick rate in Hz. Default `1` (1 sim-second per
   * real-second).
   */
  readonly tickHz?: number;
  /**
   * Switches to track. If omitted, the store starts empty;
   * load a topology or use `loadSwitches()` to populate it.
   */
  readonly switchIds?: readonly SwitchId[];
  /**
   * Optional initial switch positions, keyed by `SwitchId`.
   */
  readonly initialSwitchPositions?: ReadonlyMap<SwitchId, SwitchPosition>;
  /**
   * Signal IDs to track. If omitted, the store starts empty.
   */
  readonly signalIds?: readonly SignalId[];
  /**
   * Optional initial signal aspects, keyed by `SignalId`.
   * Defaults to `'stop'` for all.
   */
  readonly initialSignalAspects?: ReadonlyMap<SignalId, Aspect>;
  /**
   * Section IDs to track. If omitted, the store starts empty.
   */
  readonly sectionIds?: readonly import('@/types/ids').NodeId[];
  /**
   * The track topology. Required for route setting and train
   * motion; if omitted, a singleton placeholder is used and
   * routes will be rejected with `UNKNOWN_ORIGIN`.
   */
  readonly topology?: Topology;
  /**
   * Optional `InterlockingEngine` overrides.
   */
  readonly interlockingOptions?: Omit<
    InterlockingEngineDeps,
    'topology' | 'switchStore' | 'signalStore' | 'sectionStore' | 'routeStore'
  >;
  /**
   * Optional `TickLoop` overrides (e.g. injectable scheduler for tests).
   */
  readonly tickLoopOptions?: Partial<
    Pick<TickLoopOptions, 'now' | 'scheduler' | 'canceller' | 'maxTicksPerInterval'>
  >;
  /**
   * Authoritative map of platforms, keyed by `PlatformId`.
   * The train motion service uses this map to detect platform
   * stops. If omitted, an empty map is used (no platform
   * stops can occur).
   */
  readonly platforms?: ReadonlyMap<PlatformId, Platform>;
  /**
   * Optional `ScenarioService` overrides (initial scenarios).
   */
  readonly scenarioServiceOptions?: ScenarioServiceOptions;
  /**
   * Pre-built scenario instances to register with the
   * service. Convenience for tests.
   */
  readonly scenarios?: readonly Scenario[];
}

export class Simulation {
  public readonly time: TimeService;
  public readonly rng: RngService;
  public readonly eventBus: EventBus;
  public readonly tickLoop: TickLoop;
  public readonly topology: Topology;
  public readonly switchStore: SwitchStateStore;
  public readonly signalStore: SignalStateStore;
  public readonly sectionStore: SectionStateStore;
  public readonly routeStore: RouteStore;
  public readonly interlocking: InterlockingEngine;
  public readonly trainStore: TrainStateStore;
  public readonly trainMotion: TrainMotionService;
  public readonly scenarioService: ScenarioService;
  public readonly objectiveChecker: ObjectiveChecker;
  private readonly commandProcessor: CommandProcessor;

  constructor(opts: SimulationOptions = {}) {
    this.time = new TimeService();
    this.rng = new RngService(opts.seed ?? 1);
    this.eventBus = new EventBus();
    const topology = opts.topology ?? this.buildDefaultTopology();
    this.topology = topology;
    this.switchStore = new SwitchStateStore({
      switchIds: opts.switchIds ?? [],
      ...(opts.initialSwitchPositions
        ? { initialPositions: opts.initialSwitchPositions }
        : {}),
    });
    this.signalStore = new SignalStateStore({
      signalIds: opts.signalIds ?? [],
      ...(opts.initialSignalAspects
        ? { initialAspects: opts.initialSignalAspects }
        : {}),
    });
    this.sectionStore = new SectionStateStore({
      sectionIds: opts.sectionIds ?? [],
    });
    this.routeStore = new RouteStore();
    this.trainStore = new TrainStateStore();
    this.scenarioService = new ScenarioService({
      scenarios: opts.scenarios ?? opts.scenarioServiceOptions?.scenarios ?? [],
    });

    const platforms = opts.platforms ?? new Map<PlatformId, Platform>();

    const trainMotionDeps: TrainMotionServiceDeps = {
      topology,
      trainStore: this.trainStore,
      switchStore: this.switchStore,
      signalStore: this.signalStore,
      sectionStore: this.sectionStore,
      routeStore: this.routeStore,
      eventBus: this.eventBus,
      platforms,
    };
    this.trainMotion = new TrainMotionService(trainMotionDeps);

    // Minimal read-only view of the simulation for the
    // objective checker. Decoupled from the snapshot
    // layer so the checker has no store-layer dependency.
    const objectiveSource: ObjectiveCheckerSource = {
      now: () => this.time.now(),
      getTrain: (id) => this.trainStore.get(id),
      getTrainEdge: (id) => this.trainStore.get(id)?.currentEdgeId ?? null,
    };
    this.objectiveChecker = new ObjectiveChecker(this.eventBus, objectiveSource);

    this.tickLoop = new TickLoop({
      hz: opts.tickHz ?? 1,
      getSimTime: (): number => this.time.now(),
      onTick: (): void => {
        // Each tick:
        // 1. Walk the scenario timetable and dispatch any due events.
        // 2. Run the train motion service (FSM transitions).
        // 3. Check scenario objectives.
        // 4. Advance the clock and emit TIME_TICK.
        // 5. Flush the event bus.
        const commands = this.scenarioService.tick(this.time.now());
        for (const c of commands) {
          this.commandProcessor.process(c);
        }
        this.trainMotion.tick(this.time.now());
        this.objectiveChecker.tick();
        this.time.advance(1);
        this.eventBus.emit({ type: 'TIME_TICK', simTime: this.time.now() });
        this.eventBus.flush();
      },
      ...(opts.tickLoopOptions ?? {}),
    });

    this.interlocking = new InterlockingEngine({
      topology,
      switchStore: this.switchStore,
      signalStore: this.signalStore,
      sectionStore: this.sectionStore,
      routeStore: this.routeStore,
      ...(opts.interlockingOptions ?? {}),
    });

    this.commandProcessor = new CommandProcessor({
      time: this.time,
      rng: this.rng,
      eventBus: this.eventBus,
      tickLoop: this.tickLoop,
      switchStore: this.switchStore,
      interlocking: this.interlocking,
      trainMotion: this.trainMotion,
      scenarioService: this.scenarioService,
      objectiveChecker: this.objectiveChecker,
    });
  }

  /**
   * Build a default empty topology used when none is provided.
   * The interlocking engine requires a topology; callers should
   * pass one in via `opts.topology`. This empty topology is a
   * placeholder so the constructor never crashes; the engine
   * simply rejects any route attempt.
   */
  private buildDefaultTopology(): Topology {
    return new Topology({
      nodes: [
        {
          kind: 'section',
          id: '__default_singleton__' as never,
        },
      ],
      edges: [],
    });
  }

  /**
   * Snapshot of the current objective state. The UI
   * renders this in the status panel. Returns an empty
   * array if no scenario is active.
   */
  public getObjectiveViews(): readonly ObjectiveView[] {
    return this.objectiveChecker.getViews();
  }

  /* ------------------------------------------------------------ */
  /* Lifecycle                                                    */
  /* ------------------------------------------------------------ */

  /** Start the tick loop. */
  public start(): void {
    this.tickLoop.start();
  }

  /** Stop the tick loop and clear the timer. */
  public stop(): void {
    this.tickLoop.stop();
  }

  /** True when the tick loop is running (regardless of pause). */
  public isRunning(): boolean {
    return this.tickLoop.isRunning();
  }

  /* ------------------------------------------------------------ */
  /* Command / event surface                                      */
  /* ------------------------------------------------------------ */

  /**
   * Dispatch a typed command. The command is fully applied before
   * this method returns. Events produced by the command are
   * delivered to subscribers in the same call.
   */
  public dispatch(command: Command): void {
    this.commandProcessor.process(command);
    // Flush so subscribers see the result synchronously. The
    // tick loop also flushes at the end of each tick.
    this.eventBus.flush();
  }

  /** Subscribe to the event stream. Returns an unsubscribe function. */
  public subscribe(handler: EventHandler): () => void {
    return this.eventBus.subscribe(handler);
  }

  /** Convenience: synchronously collect every event emitted during `fn`. */
  public withEvents<T>(fn: () => T): { value: T; events: readonly Event[] } {
    const value = fn();
    const events = this.eventBus.flush();
    return { value, events };
  }

  /* ------------------------------------------------------------ */
  /* State save / restore                                         */
  /* ------------------------------------------------------------ */

  /**
   * Snapshot the full simulation state. The envelope is versioned
   * so future schema changes can be migrated by
   * `engine/migrations/Migrator`.
   */
  public serialize(): Versioned<SimulationState> {
    return envelope({
      version: CURRENT_VERSION,
      time: this.time.serialize(),
      rng: this.rng.serialize(),
      switches: this.switchStore.serialize(),
      signals: this.signalStore.serialize(),
      sections: this.sectionStore.serialize(),
      routes: this.routeStore.serialize(),
      trains: this.trainStore.serialize(),
    });
  }

  /**
   * Restore the simulation state from a snapshot produced by
   * {@link serialize}. Stops the tick loop if it is running.
   */
  public load(state: SimulationState): Result<void, import('@/types/result').EngineError> {
    if (this.tickLoop.isRunning()) {
      this.tickLoop.stop();
    }
    if (state.version !== CURRENT_VERSION) {
      return err(
        engineError(
          'SIMULATION_VERSION_MISMATCH',
          `Expected version ${CURRENT_VERSION}, got ${state.version}`,
          { expected: CURRENT_VERSION, received: state.version },
        ),
      );
    }
    this.time.load(state.time);
    this.rng.load(state.rng);
    const sw = this.switchStore.load(state.switches);
    if (!sw.ok) return sw;
    const sg = this.signalStore.load(state.signals);
    if (!sg.ok) return sg;
    const sc = this.sectionStore.load(state.sections);
    if (!sc.ok) return sc;
    const rt = this.routeStore.load(state.routes);
    if (!rt.ok) return rt;
    return this.trainStore.load(state.trains);
  }
}

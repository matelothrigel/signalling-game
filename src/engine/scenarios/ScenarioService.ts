/**
 * ScenarioService — drives scenario lifecycle and timetable.
 *
 * A scenario is a data-driven definition of a dispatching
 * session: a list of trains to spawn, a timetable of events
 * to fire at specific sim-times, and objectives the
 * dispatcher must complete. The `ScenarioService` walks the
 * timetable and dispatches the corresponding commands.
 *
 * ## Determinism
 *
 * The service is deterministic. Same scenario + same sim-time
 * produces the same dispatch sequence. The timetable is never
 * mutated: the service tracks an index into the immutable
 * timetable array, never rewriting the array.
 *
 * ## Command flow
 *
 * ```
 *   Simulation tick ─▶ TimeService.now() ─▶ ScenarioService.tick()
 *                                                     │
 *                                                     ▼
 *                                          walk timetable
 *                                          ─▶ dispatch(commands)
 *                                                     │
 *                                                     ▼
 *                                          Simulation.dispatch(cmd)
 *                                          ─▶ CommandProcessor
 * ```
 *
 * The service does not call `Simulation.dispatch` directly
 * (it has no reference to the `Simulation`); it calls the
 * `dispatch` callback the caller passed in. The
 * `Simulation` wires this up in its constructor.
 *
 * ## Milestone 1 scope
 *
 * The service handles `START_SCENARIO`, `END_SCENARIO`, and
 * the `SPAWN_TRAIN` timetable event. Other timetable event
 * kinds (`SIGNAL_COMMAND`, `SWITCH_COMMAND`,
 * `TRAIN_REQUEST_ENTRY`, `TRAIN_DEPART_PLATFORM`,
 * `OBJECTIVE_DUE`) are present in the type but not
 * processed in milestone 1. Adding them is a deliberate,
 * visible change.
 */

import { type Result, type EngineError, ok, err } from '@/types/result';
import type {
  Scenario,
  TimetableEvent,
} from '@/types/scenario';
import type { ScenarioId } from '@/types/ids';
import type { Command } from '@/types/commands';
import { scenarioError, ScenarioReasonCode } from './ScenarioReasonCode';

export interface ScenarioServiceOptions {
  /** Initial set of registered scenarios. Optional. */
  readonly scenarios?: readonly Scenario[];
}

export class ScenarioService {
  private readonly scenarios: Map<ScenarioId, Scenario>;
  private activeScenarioId: ScenarioId | null = null;
  private currentTimetableIndex = 0;

  constructor(opts: ScenarioServiceOptions = {}) {
    this.scenarios = new Map();
    for (const s of opts.scenarios ?? []) {
      this.scenarios.set(s.id, s);
    }
  }

  /* ------------------------------------------------------------ */
  /* Registration                                                  */
  /* ------------------------------------------------------------ */

  public register(scenario: Scenario): Result<void, EngineError> {
    this.scenarios.set(scenario.id, scenario);
    return ok(undefined);
  }

  public unregister(id: ScenarioId): Result<void, EngineError> {
    if (!this.scenarios.has(id)) {
      return err(scenarioError(ScenarioReasonCode.UNKNOWN, { scenarioId: id }));
    }
    this.scenarios.delete(id);
    if (this.activeScenarioId === id) {
      this.activeScenarioId = null;
      this.currentTimetableIndex = 0;
    }
    return ok(undefined);
  }

  public get(id: ScenarioId): Scenario | undefined {
    return this.scenarios.get(id);
  }

  public getAll(): readonly Scenario[] {
    return Array.from(this.scenarios.values());
  }

  public size(): number {
    return this.scenarios.size;
  }

  /* ------------------------------------------------------------ */
  /* Lifecycle                                                     */
  /* ------------------------------------------------------------ */

  /**
   * Start the scenario with the given ID. Sets it as the
   * active scenario and rewinds the timetable index to 0.
   * Returns the scenario, or an error if not registered.
   */
  public start(id: ScenarioId): Result<Scenario, EngineError> {
    const s = this.scenarios.get(id);
    if (!s) {
      return err(scenarioError(ScenarioReasonCode.UNKNOWN, { scenarioId: id }));
    }
    this.activeScenarioId = id;
    this.currentTimetableIndex = 0;
    return ok(s);
  }

  /**
   * End the active scenario. The timetable index is reset.
   * Returns the ended scenario, or `null` if none was active.
   */
  public end(): Scenario | null {
    if (this.activeScenarioId === null) return null;
    const s = this.scenarios.get(this.activeScenarioId) ?? null;
    this.activeScenarioId = null;
    this.currentTimetableIndex = 0;
    return s;
  }

  public activeScenario(): Scenario | null {
    if (this.activeScenarioId === null) return null;
    return this.scenarios.get(this.activeScenarioId) ?? null;
  }

  /* ------------------------------------------------------------ */
  /* Timetable                                                     */
  /* ------------------------------------------------------------ */

  /**
   * Walk the active scenario's timetable and return the
   * commands that should fire at `atSimTime`. The caller is
   * responsible for dispatching them.
   *
   * The walk is one-way: the index only advances. Skipped
   * events (whose `atSimTime` is in the past relative to the
   * current tick) are emitted in order until the index
   * catches up to the current time.
   */
  public tick(atSimTime: number): readonly Command[] {
    const scen = this.activeScenario();
    if (!scen) return [];
    const commands: Command[] = [];
    while (this.currentTimetableIndex < scen.timetable.length) {
      const event = scen.timetable[this.currentTimetableIndex];
      if (!event) break;
      if (event.atSimTime > atSimTime) break;
      this.currentTimetableIndex += 1;
      const cmd = this.timetableEventToCommand(event);
      if (cmd) commands.push(cmd);
    }
    return commands;
  }

  /**
   * Convert a timetable event to a command. Returns `null`
   * for event kinds not implemented in milestone 1.
   */
  private timetableEventToCommand(event: TimetableEvent): Command | null {
    switch (event.type) {
      case 'SPAWN_TRAIN':
        return { type: 'SPAWN_TRAIN', train: event.train };
      case 'SIGNAL_COMMAND':
      case 'SWITCH_COMMAND':
      case 'TRAIN_REQUEST_ENTRY':
      case 'TRAIN_DEPART_PLATFORM':
      case 'OBJECTIVE_DUE':
        // Not implemented in milestone 1.
        return null;
      default:
        return null;
    }
  }
}

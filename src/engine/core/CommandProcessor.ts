/**
 * CommandProcessor — routes typed `Command`s to the appropriate
 * engine services.
 *
 * The processor is a **pure router** — it does not contain business
 * logic of its own. Each case delegates to a service and emits a
 * `LOG` event so the UI can show what happened.
 *
 * In milestone 1, the processor handles the clock-related commands
 * (pause, resume, tick rate, tick now), the switch and route
 * commands, the train commands (spawn, dispatch), and the scenario
 * lifecycle (start, end). Other commands are deferred to later
 * sections and currently emit a "not yet implemented" `LOG` event
 * so the UI can surface them.
 *
 * The `assertNever` helper in `@/types/result` ensures that if a
 * new `Command` variant is added without a case here, TypeScript
 * will fail to compile.
 */

import type { Command } from '@/types/commands';
import type { TimeService } from './TimeService';
import type { RngService } from './RngService';
import type { EventBus } from './EventBus';
import type { TickLoop } from './TickLoop';
import type { SwitchStateStore } from '@/engine/switches';
import type { InterlockingEngine } from '@/engine/interlocking';
import type { TrainMotionService } from '@/engine/trains';
import type { ScenarioService } from '@/engine/scenarios';
import type { ObjectiveChecker } from '@/engine/scenarios';
import {
  assertNever,
} from '@/types/result';
import { formatRejectionBatch, routeRejectionError } from '@/engine/interlocking';
import { releasePlatformStop, TrainReasonCode } from '@/engine/trains';
import { scenarioError, ScenarioReasonCode } from '@/engine/scenarios';

export interface CommandProcessorDeps {
  readonly time: TimeService;
  readonly rng: RngService;
  readonly eventBus: EventBus;
  readonly tickLoop: TickLoop;
  readonly switchStore: SwitchStateStore;
  readonly interlocking: InterlockingEngine;
  readonly trainMotion?: TrainMotionService;
  readonly scenarioService?: ScenarioService;
  readonly objectiveChecker?: ObjectiveChecker;
}

export class CommandProcessor {
  private readonly deps: CommandProcessorDeps;

  constructor(deps: CommandProcessorDeps) {
    this.deps = deps;
  }

  /** Process a single command. The command's effect is fully applied before return. */
  public process(command: Command): void {
    const at = this.deps.time.now();
    switch (command.type) {
      case 'PAUSE_SIMULATION': {
        this.deps.tickLoop.pause();
        this.deps.time.pause();
        this.deps.eventBus.emit({
          type: 'LOG',
          level: 'info',
          code: 'CLOCK_PAUSED',
          message: 'Simulation paused',
          atSimTime: at,
        });
        return;
      }
      case 'RESUME_SIMULATION': {
        this.deps.time.resume();
        this.deps.tickLoop.resume();
        this.deps.eventBus.emit({
          type: 'LOG',
          level: 'info',
          code: 'CLOCK_RESUMED',
          message: 'Simulation resumed',
          atSimTime: at,
        });
        return;
      }
      case 'SET_TICK_RATE': {
        const previous = this.deps.tickLoop.getTickRate();
        this.deps.tickLoop.setTickRate(command.hz);
        this.deps.eventBus.emit({
          type: 'LOG',
          level: 'info',
          code: 'CLOCK_TICK_RATE_CHANGED',
          message: `Tick rate: ${previous} Hz → ${command.hz} Hz`,
          atSimTime: at,
        });
        return;
      }
      case 'TICK_NOW': {
        this.deps.tickLoop.triggerTick();
        return;
      }
      case 'END_SCENARIO': {
        if (this.deps.scenarioService) {
          this.deps.scenarioService.end();
        }
        if (this.deps.objectiveChecker) {
          this.deps.objectiveChecker.clearObjectives();
        }
        this.deps.tickLoop.stop();
        this.deps.eventBus.emit({
          type: 'LOG',
          level: 'info',
          code: 'SCENARIO_ENDED',
          message: 'Scenario ended',
          atSimTime: at,
        });
        return;
      }
      case 'CHANGE_SWITCH': {
        const r = this.deps.switchStore.changePosition(command.switchId, command.position);
        if (r.ok) {
          const t = r.value;
          const fromPos = t.from.position;
          const toPos = t.to.position;
          // Only emit SWITCH_MOVED if the position actually changed.
          if (fromPos !== toPos) {
            this.deps.eventBus.emit({
              type: 'SWITCH_MOVED',
              switchId: command.switchId,
              position: toPos,
              ...(fromPos !== toPos ? { fromPosition: fromPos } : {}),
            });
          }
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'info',
            code: 'SWITCH_CHANGED',
            message: `Switch ${command.switchId}: ${fromPos} → ${toPos}`,
            atSimTime: at,
          });
        } else {
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'warning',
            code: r.error.code,
            message: r.error.message,
            atSimTime: at,
          });
        }
        return;
      }
      case 'SET_ROUTE': {
        const outcome = this.deps.interlocking.setRoute(
          command.origin,
          command.destination,
          at,
        );
        if (outcome.kind === 'ok') {
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'info',
            code: 'ROUTE_SET',
            message: `Route ${outcome.route.id} set: ${outcome.route.entrySignalId} → ${outcome.route.exitSignalId}`,
            atSimTime: at,
          });
        } else {
          // Multi-reason rejection: log every reason on its
          // own line under a single ROUTE_REJECTED code.
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'warning',
            code: 'ROUTE_REJECTED',
            message: formatRejectionBatch(outcome.rejections),
            atSimTime: at,
          });
          // Also emit a structured error event so consumers
          // that want machine-readable rejections can read them.
          const e = routeRejectionError(outcome.rejections);
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'warning',
            code: e.code,
            message: e.message,
            atSimTime: at,
          });
        }
        return;
      }
      case 'CANCEL_ROUTE': {
        const released = this.deps.interlocking.cancelRoute(command.routeId, at);
        if (released === null) {
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'warning',
            code: 'ROUTE_NOT_FOUND',
            message: `Route ${command.routeId} not found`,
            atSimTime: at,
          });
        } else {
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'info',
            code: 'ROUTE_RELEASED',
            message: `Route ${released.id} released`,
            atSimTime: at,
          });
        }
        return;
      }
      case 'START_SCENARIO': {
        if (!this.deps.scenarioService) {
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'warning',
            code: 'COMMAND_NOT_IMPLEMENTED',
            message: 'Scenario service is not configured',
            atSimTime: at,
          });
          return;
        }
        const r = this.deps.scenarioService.start(command.scenarioId);
        if (r.ok) {
          // Reset the objective checker with the new
          // scenario's objectives.
          if (this.deps.objectiveChecker) {
            this.deps.objectiveChecker.setObjectives(r.value.objectives);
          }
          this.deps.eventBus.emit({
            type: 'SCENARIO_STARTED',
            scenarioId: command.scenarioId,
          });
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'info',
            code: 'SCENARIO_STARTED',
            message: `Scenario ${command.scenarioId} started`,
            atSimTime: at,
          });
        } else {
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'warning',
            code: r.error.code,
            message: r.error.message,
            atSimTime: at,
          });
        }
        return;
      }
      case 'SPAWN_TRAIN': {
        if (!this.deps.trainMotion) {
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'warning',
            code: 'COMMAND_NOT_IMPLEMENTED',
            message: 'Train motion service is not configured',
            atSimTime: at,
          });
          return;
        }
        const r = this.deps.trainMotion.spawnTrain(command.train, at);
        if (r.ok) {
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'info',
            code: 'TRAIN_SPAWNED',
            message: `Train ${command.train.id} spawned on edge ${command.train.entryEdgeId}`,
            atSimTime: at,
          });
        } else {
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'warning',
            code: r.error.code,
            message: r.error.message,
            atSimTime: at,
          });
        }
        return;
      }
      case 'DISPATCH_TRAIN': {
        if (!this.deps.trainMotion) {
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'warning',
            code: 'COMMAND_NOT_IMPLEMENTED',
            message: 'Train motion service is not configured',
            atSimTime: at,
          });
          return;
        }
        const rr = releasePlatformStop(
          this.deps.trainMotion.trainStore,
          command.trainId,
          at,
        );
        if (rr.ok) {
          if (rr.value.fsmState === 'Departing') {
            this.deps.eventBus.emit({
              type: 'LOG',
              level: 'info',
              code: 'TRAIN_DISPATCHED',
              message: `Train ${command.trainId} dispatched from platform ${rr.value.heldAtPlatform ?? '?'}`,
              atSimTime: at,
            });
          } else {
            this.deps.eventBus.emit({
              type: 'LOG',
              level: 'warning',
              code: TrainReasonCode.INVALID_TRANSITION,
              message: `Train ${command.trainId} is not held at a platform (state: ${rr.value.fsmState})`,
              atSimTime: at,
            });
          }
        } else {
          this.deps.eventBus.emit({
            type: 'LOG',
            level: 'warning',
            code: rr.error.code,
            message: rr.error.message,
            atSimTime: at,
          });
        }
        return;
      }
      case 'TRAIN_DISPATCH':
        this.deps.eventBus.emit({
          type: 'LOG',
          level: 'warning',
          code: 'COMMAND_NOT_IMPLEMENTED',
          message: `Command ${command.type} not yet implemented`,
          atSimTime: at,
        });
        return;
      default:
        return assertNever(command);
    }
  }
}

// Re-export the scenario error constructor so callers can use it.
export { scenarioError, ScenarioReasonCode };


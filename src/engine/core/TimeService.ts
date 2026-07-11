/**
 * TimeService — owns the simulation clock.
 *
 * Time advances only when the simulation is running. Pause/resume
 * does not change the clock value; it only controls whether the
 * tick loop will advance it. Time never goes backwards.
 *
 * The service is independent of the real wall clock — the TickLoop
 * decides when to call {@link TimeService.advance}.
 */

export interface TimeState {
  /** Current simulation time in sim-seconds since scenario start. */
  readonly simTime: number;
  /** True while the tick loop is paused. */
  readonly paused: boolean;
}

export class TimeService {
  private currentTime = 0;
  private paused = false;

  /** Current simulation time in sim-seconds. */
  public now(): number {
    return this.currentTime;
  }

  /** True while the tick loop is paused. */
  public isPaused(): boolean {
    return this.paused;
  }

  /**
   * Advance the clock by `delta` sim-seconds. Throws if `delta` is
   * negative — time must never go backwards.
   */
  public advance(delta: number): void {
    if (!Number.isFinite(delta)) {
      throw new Error(`TimeService.advance: delta must be finite, got ${delta}`);
    }
    if (delta < 0) {
      throw new Error(`TimeService.advance: delta must be non-negative, got ${delta}`);
    }
    this.currentTime += delta;
  }

  /** Mark the simulation as paused. Does not change the clock. */
  public pause(): void {
    this.paused = true;
  }

  /** Resume the simulation. Does not change the clock. */
  public resume(): void {
    this.paused = false;
  }

  /**
   * Reset the clock to an absolute value. Used by scenario loading
   * and by the serializer. Does not change the paused flag.
   */
  public reset(simTime: number): void {
    if (!Number.isFinite(simTime) || simTime < 0) {
      throw new Error(`TimeService.reset: simTime must be a non-negative finite number, got ${simTime}`);
    }
    this.currentTime = simTime;
  }

  /** Snapshot of the service state. */
  public serialize(): TimeState {
    return { simTime: this.currentTime, paused: this.paused };
  }

  /** Restore the service state from a snapshot. */
  public load(state: TimeState): void {
    this.reset(state.simTime);
    this.paused = state.paused;
  }
}

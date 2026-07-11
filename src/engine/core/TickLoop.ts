/**
 * TickLoop — fixed-rate scheduler for the simulation.
 *
 * The simulation runs on a **fixed tick rate** (default 1 Hz =
 * 1 sim-second per real-second). The tick rate is decoupled from
 * the browser's rendering frame rate — the renderer reads the
 * latest snapshot and may interpolate visually between ticks, but
 * never drives the simulation.
 *
 * **Drift correction.** The loop uses a real-time accumulator. If
 * the system is slow and real time drifts past several tick
 * intervals, the loop catches up by firing multiple ticks (capped
 * by `maxTicksPerInterval` to avoid infinite catch-up). If the
 * system is fast, the next tick fires on schedule.
 *
 * **Testability.** The scheduler and canceller are injectable. A
 * test can supply a `ManualScheduler` and advance time
 * deterministically. A `now` function can be supplied for the same
 * reason.
 *
 * The loop exposes `start`, `stop`, `pause`, `resume`, `setTickRate`,
 * and `triggerTick` (the last respects pause state and is used by
 * the `TICK_NOW` command and by tests).
 */

type TimerHandle = ReturnType<typeof setTimeout>;
export type { TimerHandle };

export type Scheduler = (callback: () => void, delayMs: number) => TimerHandle;
export type Canceller = (handle: TimerHandle) => void;

export const defaultScheduler: Scheduler = (cb, ms): TimerHandle => setTimeout(cb, ms);
export const defaultCanceller: Canceller = (h): void => {
  clearTimeout(h);
};

export interface TickLoopOptions {
  /** Tick rate in Hz (sim-seconds per real-second). Must be > 0. */
  readonly hz: number;
  /**
   * Called on each tick. The simulation advances time and emits a
   * `TIME_TICK` event inside this callback.
   */
  readonly onTick: (simTime: number) => void;
  /**
   * Returns the current sim-time. Used by `triggerTick` so the
   * callback can know which tick it is.
   */
  readonly getSimTime: () => number;
  /**
   * Returns the current real time in ms. Defaults to `Date.now`.
   * Injectable for tests.
   */
  readonly now?: () => number;
  /** Timer scheduler. Defaults to `setTimeout`. */
  readonly scheduler?: Scheduler;
  /** Timer canceller. Defaults to `clearTimeout`. */
  readonly canceller?: Canceller;
  /**
   * Maximum ticks per real-time interval. Bounds catch-up after a
   * long pause. Defaults to 5.
   */
  readonly maxTicksPerInterval?: number;
}

export class TickLoop {
  private hz: number;
  private readonly onTick: (simTime: number) => void;
  private readonly getSimTime: () => number;
  private readonly now: () => number;
  private readonly scheduler: Scheduler;
  private readonly canceller: Canceller;
  private readonly maxTicksPerInterval: number;

  private timer: TimerHandle | null = null;
  private lastRealTime = 0;
  private accumulator = 0;
  private running = false;
  private paused = false;

  constructor(opts: TickLoopOptions) {
    if (!Number.isFinite(opts.hz) || opts.hz <= 0) {
      throw new Error(`TickLoop: hz must be a positive finite number, got ${opts.hz}`);
    }
    this.hz = opts.hz;
    this.onTick = opts.onTick;
    this.getSimTime = opts.getSimTime;
    this.now = opts.now ?? ((): number => Date.now());
    this.scheduler = opts.scheduler ?? defaultScheduler;
    this.canceller = opts.canceller ?? defaultCanceller;
    this.maxTicksPerInterval = opts.maxTicksPerInterval ?? 5;
  }

  /** Start the tick loop. No-op if already running. */
  public start(): void {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.lastRealTime = this.now();
    this.accumulator = 0;
    this.scheduleNext();
  }

  /** Stop the tick loop. No-op if not running. */
  public stop(): void {
    this.running = false;
    this.paused = false;
    if (this.timer !== null) {
      this.canceller(this.timer);
      this.timer = null;
    }
    this.accumulator = 0;
  }

  /** Pause ticking. The clock does not advance. */
  public pause(): void {
    if (!this.running) return;
    this.paused = true;
  }

  /** Resume ticking after a pause. */
  public resume(): void {
    if (!this.running) return;
    this.paused = false;
    // Reset the time anchor so the next tick isn't fired immediately
    // to "catch up" for the entire paused duration.
    this.lastRealTime = this.now();
    this.accumulator = 0;
    this.scheduleNext();
  }

  /** True when start() has been called and stop() has not. */
  public isRunning(): boolean {
    return this.running;
  }

  /** True when pause() has been called and resume() has not. */
  public isPaused(): boolean {
    return this.paused;
  }

  /** Current tick rate in Hz. */
  public getTickRate(): number {
    return this.hz;
  }

  /**
   * Change the tick rate at runtime. The new rate takes effect
   * immediately: if the loop is running and not paused, the
   * currently-scheduled tick is cancelled and a new one is
   * scheduled at the new rate.
   */
  public setTickRate(hz: number): void {
    if (!Number.isFinite(hz) || hz <= 0) {
      throw new Error(`TickLoop.setTickRate: hz must be a positive finite number, got ${hz}`);
    }
    this.hz = hz;
    if (this.running && !this.paused && this.timer !== null) {
      this.canceller(this.timer);
      this.timer = null;
      this.scheduleNext();
    }
  }

  /**
   * Manually fire one tick. Respects pause state. Used by the
   * `TICK_NOW` command and by tests. Does not change the timer
   * schedule.
   */
  public triggerTick(): void {
    if (!this.running || this.paused) return;
    this.onTick(this.getSimTime());
  }

  private scheduleNext(): void {
    if (!this.running) return;
    if (this.paused) {
      // While paused, the loop idles on a longer timer so the test
      // can resume. Production code should not normally leave the
      // loop running while paused.
      this.timer = this.scheduler((): void => this.scheduleNext(), 100);
      return;
    }
    const ms = 1000 / this.hz;
    this.timer = this.scheduler((): void => this.tick(), ms);
  }

  private tick(): void {
    if (!this.running || this.paused) {
      this.scheduleNext();
      return;
    }
    const realNow = this.now();
    const dt = Math.max(0, realNow - this.lastRealTime);
    this.lastRealTime = realNow;
    this.accumulator += dt;

    const tickMs = 1000 / this.hz;
    let ticks = 0;
    while (this.accumulator >= tickMs && ticks < this.maxTicksPerInterval) {
      this.accumulator -= tickMs;
      this.onTick(this.getSimTime());
      ticks += 1;
    }
    // If we hit the cap, drop the rest of the accumulator so we
    // don't keep catching up forever.
    if (ticks === this.maxTicksPerInterval && this.accumulator >= tickMs) {
      this.accumulator = 0;
    }

    this.scheduleNext();
  }
}

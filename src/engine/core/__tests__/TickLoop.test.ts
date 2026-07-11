import { describe, it, expect, vi } from 'vitest';
import { TickLoop, type TimerHandle, type Scheduler, type Canceller } from '../TickLoop';

type FakeHandle = { id: number; cb: () => void; fireAt: number };

/**
 * A deterministic manual scheduler for testing the TickLoop without
 * real timers. `advance(ms)` fires any scheduled callbacks whose
 * fireAt is <= the new current time.
 */
class ManualScheduler {
  private nextId = 1;
  private handles = new Map<number, FakeHandle>();
  private _currentTime = 0;

  scheduler: Scheduler = (cb, ms): TimerHandle => {
    const id = this.nextId++;
    this.handles.set(id, { id, cb, fireAt: this._currentTime + ms });
    return id as unknown as TimerHandle;
  };

  canceller: Canceller = (h: TimerHandle): void => {
    this.handles.delete(h as unknown as number);
  };

  /** Time source used by the TickLoop. */
  now = (): number => this._currentTime;

  advance(ms: number): void {
    this._currentTime += ms;
    // Fire all due callbacks. New ones scheduled during a callback
    // are picked up on the next advance() call (deterministic, no
    // re-entrancy).
    const due: FakeHandle[] = [];
    for (const h of this.handles.values()) {
      if (h.fireAt <= this._currentTime) due.push(h);
    }
    for (const h of due) {
      this.handles.delete(h.id);
      h.cb();
    }
  }

  pending(): number {
    return this.handles.size;
  }
}

describe('TickLoop', () => {
  it('throws on non-positive tick rate', () => {
    expect(() => new TickLoop({ hz: 0, onTick: () => undefined, getSimTime: () => 0 })).toThrow();
    expect(() => new TickLoop({ hz: -1, onTick: () => undefined, getSimTime: () => 0 })).toThrow();
    expect(() =>
      new TickLoop({ hz: Number.NaN, onTick: () => undefined, getSimTime: () => 0 }),
    ).toThrow();
  });

  it('fires onTick at the configured rate', () => {
    const sch = new ManualScheduler();
    const onTick = vi.fn();
    const loop = new TickLoop({
      hz: 2,
      onTick,
      getSimTime: () => 0,
      scheduler: sch.scheduler,
      canceller: sch.canceller,
      now: sch.now,
    });
    loop.start();
    // First tick is scheduled 1000/2 = 500ms after start.
    sch.advance(500);
    expect(onTick).toHaveBeenCalledTimes(1);
    sch.advance(500);
    expect(onTick).toHaveBeenCalledTimes(2);
    sch.advance(500);
    expect(onTick).toHaveBeenCalledTimes(3);
    loop.stop();
  });

  it('pause() and resume() toggle ticking', () => {
    const sch = new ManualScheduler();
    const onTick = vi.fn();
    const loop = new TickLoop({
      hz: 1,
      onTick,
      getSimTime: () => 0,
      scheduler: sch.scheduler,
      canceller: sch.canceller,
      now: sch.now,
    });
    loop.start();
    sch.advance(1000);
    expect(onTick).toHaveBeenCalledTimes(1);

    loop.pause();
    sch.advance(5000);
    expect(onTick).toHaveBeenCalledTimes(1); // still 1

    loop.resume();
    sch.advance(1000);
    expect(onTick).toHaveBeenCalledTimes(2);

    loop.stop();
  });

  it('setTickRate() takes effect on the next tick', () => {
    const sch = new ManualScheduler();
    const onTick = vi.fn();
    const loop = new TickLoop({
      hz: 1,
      onTick,
      getSimTime: () => 0,
      scheduler: sch.scheduler,
      canceller: sch.canceller,
      now: sch.now,
    });
    loop.start();
    sch.advance(1000);
    expect(onTick).toHaveBeenCalledTimes(1);

    loop.setTickRate(2);
    sch.advance(500);
    expect(onTick).toHaveBeenCalledTimes(2);

    loop.stop();
  });

  it('setTickRate() throws on non-positive values', () => {
    const sch = new ManualScheduler();
    const loop = new TickLoop({
      hz: 1,
      onTick: () => undefined,
      getSimTime: () => 0,
      scheduler: sch.scheduler,
      canceller: sch.canceller,
      now: sch.now,
    });
    expect(() => loop.setTickRate(0)).toThrow();
    expect(() => loop.setTickRate(-1)).toThrow();
  });

  it('triggerTick() fires onTick once when running and not paused', () => {
    const sch = new ManualScheduler();
    const onTick = vi.fn();
    const loop = new TickLoop({
      hz: 1,
      onTick,
      getSimTime: () => 42,
      scheduler: sch.scheduler,
      canceller: sch.canceller,
      now: sch.now,
    });
    loop.start();
    loop.triggerTick();
    expect(onTick).toHaveBeenCalledWith(42);
    loop.stop();
  });

  it('triggerTick() is a no-op when paused', () => {
    const sch = new ManualScheduler();
    const onTick = vi.fn();
    const loop = new TickLoop({
      hz: 1,
      onTick,
      getSimTime: () => 0,
      scheduler: sch.scheduler,
      canceller: sch.canceller,
      now: sch.now,
    });
    loop.start();
    loop.pause();
    loop.triggerTick();
    expect(onTick).not.toHaveBeenCalled();
    loop.stop();
  });

  it('triggerTick() is a no-op when not running', () => {
    const sch = new ManualScheduler();
    const onTick = vi.fn();
    const loop = new TickLoop({
      hz: 1,
      onTick,
      getSimTime: () => 0,
      scheduler: sch.scheduler,
      canceller: sch.canceller,
      now: sch.now,
    });
    loop.triggerTick();
    expect(onTick).not.toHaveBeenCalled();
  });

  it('catches up on drift up to maxTicksPerInterval', () => {
    const sch = new ManualScheduler();
    const onTick = vi.fn();
    const loop = new TickLoop({
      hz: 1,
      onTick,
      getSimTime: () => 0,
      scheduler: sch.scheduler,
      canceller: sch.canceller,
      now: sch.now,
      maxTicksPerInterval: 3,
    });
    loop.start();
    // First tick scheduled at 1000ms.
    sch.advance(1000);
    expect(onTick).toHaveBeenCalledTimes(1);
    // 3 seconds elapse: should fire 3 catch-up ticks (capped at 3).
    sch.advance(3000);
    expect(onTick).toHaveBeenCalledTimes(4);
    // Another 5 seconds: should fire at most 3 more (capped), not 5.
    sch.advance(5000);
    expect(onTick).toHaveBeenCalledTimes(7);
    loop.stop();
  });

  it('isRunning / isPaused / getTickRate reflect state', () => {
    const sch = new ManualScheduler();
    const loop = new TickLoop({
      hz: 2,
      onTick: () => undefined,
      getSimTime: () => 0,
      scheduler: sch.scheduler,
      canceller: sch.canceller,
      now: sch.now,
    });
    expect(loop.isRunning()).toBe(false);
    expect(loop.isPaused()).toBe(false);
    expect(loop.getTickRate()).toBe(2);
    loop.start();
    expect(loop.isRunning()).toBe(true);
    loop.pause();
    expect(loop.isPaused()).toBe(true);
    loop.resume();
    expect(loop.isPaused()).toBe(false);
    loop.stop();
    expect(loop.isRunning()).toBe(false);
  });

  it('start() is idempotent', () => {
    const sch = new ManualScheduler();
    const onTick = vi.fn();
    const loop = new TickLoop({
      hz: 1,
      onTick,
      getSimTime: () => 0,
      scheduler: sch.scheduler,
      canceller: sch.canceller,
      now: sch.now,
    });
    loop.start();
    loop.start(); // no-op
    sch.advance(1000);
    expect(onTick).toHaveBeenCalledTimes(1);
    loop.stop();
  });
});

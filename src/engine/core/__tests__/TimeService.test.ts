import { describe, it, expect } from 'vitest';
import { TimeService } from '../TimeService';

describe('TimeService', () => {
  it('starts at sim-time 0 and is not paused', () => {
    const t = new TimeService();
    expect(t.now()).toBe(0);
    expect(t.isPaused()).toBe(false);
  });

  it('advance() increases the clock by the given delta', () => {
    const t = new TimeService();
    t.advance(5);
    expect(t.now()).toBe(5);
    t.advance(2.5);
    expect(t.now()).toBe(7.5);
  });

  it('advance() throws on negative delta', () => {
    const t = new TimeService();
    expect(() => t.advance(-1)).toThrow(/non-negative/);
  });

  it('advance() throws on non-finite delta', () => {
    const t = new TimeService();
    expect(() => t.advance(NaN)).toThrow(/finite/);
    expect(() => t.advance(Infinity)).toThrow(/finite/);
  });

  it('pause() and resume() toggle the paused flag', () => {
    const t = new TimeService();
    t.pause();
    expect(t.isPaused()).toBe(true);
    t.resume();
    expect(t.isPaused()).toBe(false);
  });

  it('pause/resume do not change the clock value', () => {
    const t = new TimeService();
    t.advance(10);
    t.pause();
    expect(t.now()).toBe(10);
    t.resume();
    expect(t.now()).toBe(10);
  });

  it('reset() sets the clock to an absolute value', () => {
    const t = new TimeService();
    t.advance(50);
    t.reset(7);
    expect(t.now()).toBe(7);
  });

  it('reset() throws on negative or non-finite values', () => {
    const t = new TimeService();
    expect(() => t.reset(-1)).toThrow(/non-negative/);
    expect(() => t.reset(NaN)).toThrow(/non-negative/);
  });

  it('serialize() / load() round-trip', () => {
    const a = new TimeService();
    a.advance(42);
    a.pause();
    const b = new TimeService();
    b.load(a.serialize());
    expect(b.now()).toBe(42);
    expect(b.isPaused()).toBe(true);
  });

  it('load() preserves the unpaused state', () => {
    const a = new TimeService();
    a.advance(10);
    const b = new TimeService();
    b.load(a.serialize());
    expect(b.isPaused()).toBe(false);
  });
});

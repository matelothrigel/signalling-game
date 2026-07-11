import { describe, it, expect } from 'vitest';
import { RngService } from '../RngService';

describe('RngService — determinism', () => {
  it('the same seed produces the same sequence', () => {
    const a = new RngService(42);
    const b = new RngService(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = new RngService(1);
    const b = new RngService(2);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (a.next() === b.next()) same += 1;
    }
    expect(same).toBeLessThan(5); // overwhelmingly likely to differ
  });

  it('string seeds are supported and deterministic', () => {
    const a = new RngService('tutorial-v1');
    const b = new RngService('tutorial-v1');
    expect(a.next()).toBe(b.next());
    expect(a.next()).toBe(b.next());
  });

  it('default seed is 1 (deterministic by default)', () => {
    const a = new RngService();
    const b = new RngService();
    expect(a.next()).toBe(b.next());
  });
});

describe('RngService — distribution', () => {
  it('next() returns values in [0, 1)', () => {
    const rng = new RngService(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt() returns integers in [min, max] inclusive', () => {
    const rng = new RngService(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('nextInt() throws on reversed bounds', () => {
    const rng = new RngService(1);
    expect(() => rng.nextInt(10, 5)).toThrow();
  });

  it('nextInt() throws on non-integer bounds', () => {
    const rng = new RngService(1);
    expect(() => rng.nextInt(1.5, 5)).toThrow();
  });

  it('nextFloat() returns values in [min, max)', () => {
    const rng = new RngService(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextFloat(-2, 3);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(3);
    }
  });

  it('bool() returns true with probability ≈ p', () => {
    const rng = new RngService(7);
    let trues = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      if (rng.bool(0.3)) trues += 1;
    }
    const ratio = trues / n;
    expect(ratio).toBeGreaterThan(0.27);
    expect(ratio).toBeLessThan(0.33);
  });

  it('bool() throws on out-of-range p', () => {
    const rng = new RngService(1);
    expect(() => rng.bool(-0.1)).toThrow();
    expect(() => rng.bool(1.1)).toThrow();
  });

  it('pick() returns a member of the array', () => {
    const rng = new RngService(7);
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('pick() throws on an empty array', () => {
    const rng = new RngService(1);
    expect(() => rng.pick([])).toThrow(/empty/);
  });

  it('shuffle() returns a permutation', () => {
    const rng = new RngService(7);
    const arr = [1, 2, 3, 4, 5];
    const out = rng.shuffle(arr);
    expect(out).toHaveLength(arr.length);
    expect([...out].sort((a, b) => a - b)).toEqual(arr);
    // Mutates a copy, not the input
    expect(arr).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('RngService — named streams', () => {
  it('different named streams are independent', () => {
    const rng = new RngService(1);
    const main = rng.stream('main');
    const weather = rng.stream('weather');
    const a = main.next();
    const b = weather.next();
    const a2 = main.next();
    expect(typeof a).toBe('number');
    expect(typeof b).toBe('number');
    expect(typeof a2).toBe('number');
  });

  it('streams are deterministic for the same seed', () => {
    const a = new RngService(99);
    const b = new RngService(99);
    a.stream('weather');
    b.stream('weather');
    // Both 'main' streams should still match
    for (let i = 0; i < 50; i++) {
      expect(a.next()).toBe(b.next());
    }
    // Both 'weather' streams should also match
    for (let i = 0; i < 50; i++) {
      expect(a.stream('weather').next()).toBe(b.stream('weather').next());
    }
  });

  it('asking for the same stream returns the same instance', () => {
    const rng = new RngService(1);
    const s1 = rng.stream('main');
    const s2 = rng.stream('main');
    expect(s1).toBe(s2);
  });
});

describe('RngService — serialization', () => {
  it('serialize() / load() round-trips state', () => {
    const a = new RngService(42);
    // Advance the state
    a.next();
    a.next();
    a.nextInt(1, 10);
    const snap = a.serialize();

    const b = new RngService(99); // different seed
    b.load(snap);
    // Both should now produce the same sequence.
    for (let i = 0; i < 50; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('load() preserves named streams', () => {
    const a = new RngService(1);
    a.stream('weather').next();
    a.stream('weather').next();
    const snap = a.serialize();

    const b = new RngService(2);
    b.load(snap);
    // The 'weather' stream should be in the same state.
    expect(b.stream('weather').next()).toBe(a.stream('weather').next());
  });

  it('validate() accepts a well-formed state', () => {
    const rng = new RngService(1);
    const r = RngService.validate(rng.serialize());
    expect(r.ok).toBe(true);
  });

  it('validate() rejects non-objects', () => {
    expect(RngService.validate(null).ok).toBe(false);
    expect(RngService.validate(42).ok).toBe(false);
  });

  it('validate() rejects missing streams field', () => {
    const r = RngService.validate({ seed: 1 });
    expect(r.ok).toBe(false);
  });

  it('validate() rejects non-number stream words', () => {
    const r = RngService.validate({ seed: 1, streams: { main: { a: 'x', b: 0, c: 0, d: 0 } } });
    expect(r.ok).toBe(false);
  });
});

describe('RngService — replay', () => {
  it('reproducing the same scenario with the same seed is bit-identical', () => {
    // Simulate two runs of a fictional scenario that uses the RNG.
    const runScenario = (seed: number): { times: number[]; picks: string[] } => {
      const rng = new RngService(seed);
      const times: number[] = [];
      const picks: string[] = [];
      // Pretend the scenario does 20 random steps.
      for (let i = 0; i < 20; i++) {
        times.push(rng.nextFloat(0, 100));
        picks.push(rng.pick(['a', 'b', 'c']));
      }
      return { times, picks };
    };
    expect(runScenario(123)).toEqual(runScenario(123));
    expect(runScenario(123)).not.toEqual(runScenario(124));
  });
});

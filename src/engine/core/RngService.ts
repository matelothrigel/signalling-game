/**
 * RngService — deterministic, seedable, serializable random number
 * generation for the simulation.
 *
 * **The engine must never call `Math.random()`.** All randomness goes
 * through this service. The ESLint rule
 * `no-restricted-properties` for `Math.random` enforces this in
 * `src/engine/**`.
 *
 * The PRNG is **sfc32** (Small Fast Counting, 32-bit state) — a
 * well-known non-cryptographic PRNG with good statistical properties
 * and a tiny 16-byte state that is trivially serializable. The
 * service is designed so that:
 *
 *   - Two simulations started with the same seed and the same
 *     sequence of calls produce the **same** sequence of values.
 *   - The full PRNG state can be saved and restored; replaying the
 *     same scenario from the same serialized state is bit-identical.
 *
 * The service exposes **named streams** (default `"main"`) so that
 * future subsystems (delays, failures, weather, etc.) can have
 * independent, reproducible streams without interfering with each
 * other. Sub-streams are derived deterministically from the main
 * stream when first requested.
 *
 * Note: this service uses `Math.imul` and `Math.floor` for
 * integer arithmetic. These are not banned; only `Math.random` is.
 */

import { type Result, ok, err, engineError } from '@/types/result';

/* ------------------------------------------------------------------ */
/* PRNG core — sfc32                                                  */
/* ------------------------------------------------------------------ */

/**
 * splitmix32 — used to expand a single seed into the four 32-bit
 * words that the sfc32 state needs. Public-domain.
 */
const splitmix32 = (seed: number): (() => number) => {
  return (): number => {
    seed = (seed + 0x9e3779b9) | 0;
    let z = seed;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
};

/** Hash a string seed to a 32-bit integer. */
const hashString = (s: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
};

/** Expand a seed (number or string) into the four sfc32 state words. */
const seedToWords = (seed: number | string): [number, number, number, number] => {
  const s = typeof seed === 'string' ? hashString(seed) : (seed | 0);
  const sm = splitmix32(s);
  return [sm(), sm(), sm(), sm()];
};

/* ------------------------------------------------------------------ */
/* Stream state                                                        */
/* ------------------------------------------------------------------ */

/** Serialisable state of a single RNG stream. */
export interface RngStreamState {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

/** Serialisable state of the full RNG service. */
export interface RngState {
  /** The seed originally passed to the constructor (kept for reference). */
  readonly seed: number | string;
  /** Current state of every named stream that has been created. */
  readonly streams: Readonly<Record<string, RngStreamState>>;
}

/* ------------------------------------------------------------------ */
/* Single stream                                                       */
/* ------------------------------------------------------------------ */

/**
 * A named, deterministic random stream. Holds four 32-bit state
 * words. Provides the usual RNG primitives.
 *
 * Instances are not exported directly; create them through
 * {@link RngService} so that the service can track and serialise
 * their state.
 */
class RngStream {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(a: number, b: number, c: number, d: number) {
    this.a = a | 0;
    this.b = b | 0;
    this.c = c | 0;
    this.d = d | 0;
  }

  /** Uniform value in [0, 1). */
  public next(): number {
    this.a |= 0;
    this.b |= 0;
    this.c |= 0;
    this.d |= 0;
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Uniform integer in `[min, max]` (both inclusive). */
  public nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error(`RngStream.nextInt: min and max must be integers, got ${min}, ${max}`);
    }
    if (max < min) {
      throw new Error(`RngStream.nextInt: max (${max}) must be >= min (${min})`);
    }
    return Math.floor(min + this.next() * (max - min + 1));
  }

  /** Uniform float in `[min, max)`. */
  public nextFloat(min: number, max: number): number {
    if (max < min) {
      throw new Error(`RngStream.nextFloat: max (${max}) must be >= min (${min})`);
    }
    return min + this.next() * (max - min);
  }

  /** Bernoulli trial with success probability `p` in [0, 1]. */
  public bool(p: number): boolean {
    if (p < 0 || p > 1) {
      throw new Error(`RngStream.bool: p must be in [0, 1], got ${p}`);
    }
    return this.next() < p;
  }

  /** Pick a uniformly random element of `arr`. Throws on empty. */
  public pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new Error('RngStream.pick: cannot pick from an empty array');
    }
    const idx = this.nextInt(0, arr.length - 1);
    // Safe: idx is in [0, arr.length - 1].
    return arr[idx] as T;
  }

  /** Return a new shuffled copy of `arr` (Fisher–Yates). */
  public shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  public serialize(): RngStreamState {
    return { a: this.a, b: this.b, c: this.c, d: this.d };
  }

  public load(state: RngStreamState): void {
    this.a = state.a | 0;
    this.b = state.b | 0;
    this.c = state.c | 0;
    this.d = state.d | 0;
  }
}

/* ------------------------------------------------------------------ */
/* RngService                                                          */
/* ------------------------------------------------------------------ */

/**
 * Deterministic, seedable, serializable random number service.
 *
 * The constructor takes a seed (number or string). The default seed
 * is `1` so that runs are deterministic by default. Named streams
 * beyond `"main"` are created lazily on first request and seeded
 * deterministically from the main stream.
 */
export class RngService {
  private readonly seed: number | string;
  private readonly streams = new Map<string, RngStream>();

  constructor(seed: number | string = 1) {
    this.seed = seed;
    const [a, b, c, d] = seedToWords(seed);
    this.streams.set('main', new RngStream(a, b, c, d));
  }

  /**
   * Return the named stream, creating it on first access. New
   * streams are seeded from the `"main"` stream, advancing its
   * state deterministically.
   */
  public stream(name: string = 'main'): RngStream {
    const existing = this.streams.get(name);
    if (existing) return existing;
    const main = this.stream('main');
    const a = main.nextInt(0, 0x7fffffff);
    const b = main.nextInt(0, 0x7fffffff);
    const c = main.nextInt(0, 0x7fffffff);
    const d = main.nextInt(0, 0x7fffffff);
    const s = new RngStream(a, b, c, d);
    this.streams.set(name, s);
    return s;
  }

  // ----- convenience pass-throughs to the "main" stream -----

  public next(): number {
    return this.stream('main').next();
  }
  public nextInt(min: number, max: number): number {
    return this.stream('main').nextInt(min, max);
  }
  public nextFloat(min: number, max: number): number {
    return this.stream('main').nextFloat(min, max);
  }
  public bool(p: number): boolean {
    return this.stream('main').bool(p);
  }
  public pick<T>(arr: readonly T[]): T {
    return this.stream('main').pick(arr);
  }
  public shuffle<T>(arr: readonly T[]): T[] {
    return this.stream('main').shuffle(arr);
  }

  /** Snapshot of the service state. */
  public serialize(): RngState {
    const streams: Record<string, RngStreamState> = {};
    for (const [name, stream] of this.streams) {
      streams[name] = stream.serialize();
    }
    return { seed: this.seed, streams };
  }

  /**
   * Restore the service state from a snapshot. Replaces all streams
   * with the snapshot's contents. Streams present in the service
   * but absent from the snapshot are dropped; vice versa are added.
   */
  public load(state: RngState): void {
    this.streams.clear();
    for (const [name, s] of Object.entries(state.streams)) {
      const stream = new RngStream(0, 0, 0, 0);
      stream.load(s);
      this.streams.set(name, stream);
    }
  }

  /**
   * Validate that a raw value is a well-formed {@link RngState}.
   * Used by serializers and migration code.
   */
  public static validate(raw: unknown): Result<RngState, import('@/types/result').EngineError> {
    if (raw === null || typeof raw !== 'object') {
      return err(engineError('INVALID_RNG_STATE', 'RngState must be an object'));
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj.seed !== 'number' && typeof obj.seed !== 'string') {
      return err(engineError('INVALID_RNG_STATE', 'RngState.seed must be number or string'));
    }
    if (obj.streams === null || typeof obj.streams !== 'object') {
      return err(engineError('INVALID_RNG_STATE', 'RngState.streams must be an object'));
    }
    for (const [name, s] of Object.entries(obj.streams as Record<string, unknown>)) {
      if (s === null || typeof s !== 'object') {
        return err(engineError('INVALID_RNG_STATE', `RngState.streams.${name} must be an object`));
      }
      const stream = s as Record<string, unknown>;
      for (const k of ['a', 'b', 'c', 'd'] as const) {
        if (typeof stream[k] !== 'number' || !Number.isFinite(stream[k] as number)) {
          return err(
            engineError('INVALID_RNG_STATE', `RngState.streams.${name}.${k} must be a finite number`),
          );
        }
      }
    }
    return ok({
      seed: obj.seed as number | string,
      streams: obj.streams as Record<string, RngStreamState>,
    });
  }
}

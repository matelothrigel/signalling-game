import { describe, it, expect } from 'vitest';
import { parseVersioned, envelope, CURRENT_VERSION } from '../versioned';
import { ok, err } from '../result';

describe('CURRENT_VERSION', () => {
  it('is 1 in milestone 1', () => {
    expect(CURRENT_VERSION).toBe(1);
  });
});

describe('parseVersioned', () => {
  it('accepts a valid envelope', () => {
    const r = parseVersioned({ version: 1, data: { x: 1 } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.version).toBe(1);
      expect(r.value.data).toEqual({ x: 1 });
    }
  });

  it('rejects non-objects', () => {
    expect(parseVersioned(null).ok).toBe(false);
    expect(parseVersioned(42).ok).toBe(false);
    expect(parseVersioned('hi').ok).toBe(false);
    expect(parseVersioned(undefined).ok).toBe(false);
  });

  it('rejects missing version', () => {
    const r = parseVersioned({ data: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INVALID_VERSIONED');
    }
  });

  it('rejects non-integer version', () => {
    const r = parseVersioned({ version: 1.5, data: {} });
    expect(r.ok).toBe(false);
  });

  it('rejects missing data', () => {
    const r = parseVersioned({ version: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toMatch(/data/);
    }
  });
});

describe('envelope', () => {
  it('wraps data with the current version', () => {
    const v = envelope({ a: 1 });
    expect(v.version).toBe(CURRENT_VERSION);
    expect(v.data).toEqual({ a: 1 });
  });
});

describe('Result helpers smoke', () => {
  it('ok and err are usable as factory return values', () => {
    const r1: ReturnType<typeof ok> = ok('a');
    const r2: ReturnType<typeof err> = err({ code: 'X', message: 'y' });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
  });
});

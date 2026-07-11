import { describe, it, expect } from 'vitest';
import { ok, err, engineError, assertNever } from '../result';

describe('ok', () => {
  it('wraps a value in a successful Result', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(42);
    }
  });
});

describe('err', () => {
  it('wraps an error in a failed Result', () => {
    const e = engineError('BAD', 'oops');
    const r = err(e);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe(e);
    }
  });
});

describe('engineError', () => {
  it('omits the context field when not provided', () => {
    const e = engineError('X', 'y');
    expect(e).toEqual({ code: 'X', message: 'y' });
    expect('context' in e).toBe(false);
  });

  it('includes the context field when provided', () => {
    const e = engineError('X', 'y', { a: 1 });
    expect(e).toEqual({ code: 'X', message: 'y', context: { a: 1 } });
  });
});

describe('assertNever', () => {
  it('throws when reached', () => {
    // We only test the runtime behaviour with a deliberate never cast.
    const unreachable = undefined as unknown as never;
    expect(() => assertNever(unreachable)).toThrow(/Unhandled discriminant/);
  });
});

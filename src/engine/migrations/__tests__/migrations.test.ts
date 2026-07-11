import { describe, it, expect } from 'vitest';
import { Migrator } from '../Migrator';
import { CURRENT_VERSION } from '@/types/versioned';
import { envelope } from '@/types/versioned';

describe('Migrator (milestone 1, no migrations registered)', () => {
  it('returns current-version data unchanged', () => {
    const m = new Migrator();
    const v = envelope({ hello: 'world' });
    const r = m.run(v);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual(v);
    }
  });

  it('treats a bare data object as current-version', () => {
    const m = new Migrator();
    const r = m.run({ id: 'X' });
    expect(r.ok).toBe(true);
  });

  it('rejects data whose version is greater than CURRENT_VERSION', () => {
    const m = new Migrator();
    const r = m.run({ version: CURRENT_VERSION + 1, data: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('FUTURE_VERSION');
    }
  });

  it('reports a missing migration when an older version has no step', () => {
    const m = new Migrator();
    // Current_version is 1 in milestone 1; data at version 0 has no
    // registered migration.
    const r = m.run({ version: 0, data: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('NO_MIGRATION');
    }
  });

  it('rejects registering a migration for the current version', () => {
    const m = new Migrator();
    expect(() => m.register(CURRENT_VERSION, (d) => d)).toThrow(
      /not older than CURRENT_VERSION/,
    );
  });

  it('rejects registering a migration for the same source twice', () => {
    // Register a migration from version 0 → 1 in a fresh migrator.
    // (CURRENT_VERSION is 1, so 0 is a legal source.)
    const m = new Migrator();
    m.register(0, (d) => ({ version: 1, data: d }));
    expect(() => m.register(0, (d) => ({ version: 1, data: d }))).toThrow(
      /already registered/,
    );
  });

  it('rejects non-integer source versions', () => {
    const m = new Migrator();
    expect(() => m.register(0.5 as unknown as number, (d) => d)).toThrow();
  });

  it('rejects negative source versions', () => {
    const m = new Migrator();
    expect(() => m.register(-1, (d) => d)).toThrow();
  });

  it('chains a registered migration from v0 to v1', () => {
    const m = new Migrator().register(
      0,
      // Pretend a v0→v1 migration: add a `migrated` field.
      (d) => ({ version: 1, data: { ...(d as Record<string, unknown>), migrated: true } }),
    );
    const r = m.run({ version: 0, data: { original: 1 } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const out = r.value as { version: number; data: Record<string, unknown> };
      expect(out.version).toBe(1);
      expect(out.data.original).toBe(1);
      expect(out.data.migrated).toBe(true);
    }
  });

  it('returns MIGRATION_FAILED when a migration throws', () => {
    const m = new Migrator().register(0, () => {
      throw new Error('boom');
    });
    const r = m.run({ version: 0, data: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('MIGRATION_FAILED');
    }
  });

  it('returns BAD_MIGRATION when a migration does not return a versioned envelope', () => {
    const m = new Migrator().register(0, (d) => d);
    const r = m.run({ version: 0, data: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('BAD_MIGRATION');
    }
  });
});

describe('createMigrator factory', () => {
  it('returns a Migrator with no registrations in milestone 1', async () => {
    const { createMigrator } = await import('../index');
    const m = createMigrator();
    const r = m.run(envelope({ x: 1 }));
    expect(r.ok).toBe(true);
  });
});

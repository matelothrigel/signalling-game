/**
 * Migrator — chains pure data migrations forward to
 * `CURRENT_VERSION`.
 *
 * Each migration is registered for a specific source version. When
 * the migrator encounters data of an older version, it applies the
 * registered migration to produce the next version, then repeats
 * until the data is at `CURRENT_VERSION`.
 *
 * Migrations are pure: `(oldVersion, data) -> newVersion, data`.
 * They do not touch the engine state. They do not log. They do not
 * throw — they return a `Result` so the caller can surface the
 * error to the user.
 *
 * To add a migration:
 *   1. Implement `(data) -> data` in this file.
 *   2. Register it via `register(fromVersion, migration)`.
 *
 * Milestone 1 is version 1 only. The first real migration will be
 * needed when version 2 is introduced.
 */

import { CURRENT_VERSION } from '@/types/versioned';
import { type Result, ok, err, engineError } from '@/types/result';

/** A pure migration function. Takes the current data, returns new data. */
export type Migration = (data: unknown) => unknown;

/** A registered migration, keyed by the version it migrates *from*. */
export interface RegisteredMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly migrate: Migration;
}

/** Builder + runner for chained migrations. */
export class Migrator {
  private readonly migrations = new Map<number, RegisteredMigration>();

  /**
   * Register a migration from `fromVersion` to `fromVersion + 1`.
   * Throws at registration time if `fromVersion >= CURRENT_VERSION`
   * or if a migration for that version is already registered.
   */
  public register(fromVersion: number, migrate: Migration): this {
    if (!Number.isInteger(fromVersion) || fromVersion < 0) {
      throw new Error(
        `Migration source version must be a non-negative integer, got ${fromVersion}`,
      );
    }
    if (fromVersion >= CURRENT_VERSION) {
      throw new Error(
        `Cannot register a migration from version ${fromVersion}: ` +
          `it is not older than CURRENT_VERSION (${CURRENT_VERSION})`,
      );
    }
    if (this.migrations.has(fromVersion)) {
      throw new Error(
        `A migration from version ${fromVersion} is already registered`,
      );
    }
    this.migrations.set(fromVersion, {
      fromVersion,
      toVersion: fromVersion + 1,
      migrate,
    });
    return this;
  }

  /**
   * Run the migration chain on the given input until it is at
   * `CURRENT_VERSION`. Returns the migrated data on success.
   *
   * Accepts either a raw `Versioned` envelope (`{ version, data }`)
   * or a bare data payload (assumed to be at `CURRENT_VERSION`).
   */
  public run(input: unknown): Result<unknown, import('@/types/result').EngineError> {
    const current = input;
    let version: number;

    if (
      current !== null &&
      typeof current === 'object' &&
      'version' in current &&
      typeof (current as Record<string, unknown>).version === 'number'
    ) {
      version = (current as { version: number }).version;
    } else {
      // No version field — assume it is at CURRENT_VERSION.
      version = CURRENT_VERSION;
    }

    if (version === CURRENT_VERSION) {
      return ok(current);
    }

    if (version > CURRENT_VERSION) {
      return err(
        engineError(
          'FUTURE_VERSION',
          `Data version ${version} is newer than supported (${CURRENT_VERSION}). ` +
            `This file was produced by a newer version of the engine.`,
          { dataVersion: version, currentVersion: CURRENT_VERSION },
        ),
      );
    }

    let data = (current as { data: unknown }).data;
    let v = version;
    while (v < CURRENT_VERSION) {
      const step = this.migrations.get(v);
      if (!step) {
        return err(
          engineError(
            'NO_MIGRATION',
            `No migration registered from version ${v} to ${v + 1}`,
            { fromVersion: v },
          ),
        );
      }
      let migrated: unknown;
      try {
        migrated = step.migrate(data);
      } catch (e) {
        return err(
          engineError(
            'MIGRATION_FAILED',
            `Migration from version ${v} threw: ${e instanceof Error ? e.message : String(e)}`,
            { fromVersion: v },
          ),
        );
      }
      if (
        migrated === null ||
        typeof migrated !== 'object' ||
        (migrated as Record<string, unknown>).version !== v + 1
      ) {
        return err(
          engineError(
            'BAD_MIGRATION',
            `Migration from version ${v} did not return a versioned envelope with version ${v + 1}`,
            { fromVersion: v, toVersion: v + 1 },
          ),
        );
      }
      const envelope = migrated as { version: number; data: unknown };
      data = envelope.data;
      v = envelope.version;
    }

    return ok({ version: v, data });
  }
}

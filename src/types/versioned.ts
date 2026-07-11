/**
 * Versioned envelope for persistent data.
 *
 * Every JSON artifact the engine reads or writes (infrastructure
 * files, scenario files, save files, the engine's own serialised
 * state) starts with this envelope. The migrator in
 * `src/engine/migrations/` chains migrations forward to
 * {@link CURRENT_VERSION}.
 *
 * Adding a new version:
 *   1. Bump `CURRENT_VERSION`.
 *   2. Add a migration from `currentVersion - 1` in
 *      `src/engine/migrations/`.
 *   3. Register it in the engine's `Migrator` instance.
 *
 * No silent acceptance of unknown versions: the migrator returns
 * an `EngineError` if it cannot chain to the current version.
 */

import type { Result, EngineError } from './result';

/** The current schema version of all engine data. */
export const CURRENT_VERSION = 1 as const;

/** The `version` literal type of the current schema. */
export type CurrentVersion = typeof CURRENT_VERSION;

/**
 * A versioned JSON envelope. The inner `data` is `unknown` at the
 * type level — loaders are responsible for validating its shape
 * after migration.
 */
export interface Versioned<T = unknown> {
  readonly version: number;
  readonly data: T;
}

/**
 * Parse a `Versioned` envelope from raw JSON input.
 *
 * Does not run migrations — that's the migrator's job. This only
 * checks the envelope shape and returns the inner data.
 */
export const parseVersioned = (
  raw: unknown,
): Result<Versioned, EngineError> => {
  if (raw === null || typeof raw !== 'object') {
    return {
      ok: false,
      error: {
        code: 'INVALID_VERSIONED',
        message: 'Versioned data must be a non-null object',
        context: { received: typeof raw },
      },
    };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.version !== 'number' || !Number.isInteger(obj.version)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_VERSIONED',
        message: 'Versioned data must have an integer `version` field',
        context: { version: obj.version },
      },
    };
  }
  if (!('data' in obj)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_VERSIONED',
        message: 'Versioned data must have a `data` field',
      },
    };
  }
  return { ok: true, value: { version: obj.version, data: obj.data } };
};

/**
 * Wrap a payload in the current version envelope.
 */
export const envelope = <T>(data: T): Versioned<T> => ({
  version: CURRENT_VERSION,
  data,
});

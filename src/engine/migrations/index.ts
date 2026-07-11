/**
 * Engine migrations barrel + factory.
 *
 * Milestone 1 is version 1. There are no migrations to register yet.
 * The first migration will be added here when version 2 is
 * introduced.
 */

import { Migrator } from './Migrator';
import { CURRENT_VERSION } from '@/types/versioned';

/** Build a fresh migrator with all registered migrations. */
export const createMigrator = (): Migrator => {
  const m = new Migrator();
  // No migrations yet. Future:
  // m.register(1, (data) => ({ version: 2, data: migrateV1ToV2(data) }));
  return m;
};

/** Re-export the current schema version for convenience. */
export { CURRENT_VERSION };
export { Migrator } from './Migrator';

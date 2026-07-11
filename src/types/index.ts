/**
 * Barrel export for the domain types.
 *
 * The engine and UI import from `@/types` rather than reaching into
 * individual files. New types should be re-exported here.
 */

export * from './ids';
export * from './primitives';
export * from './result';
export * from './topology';
export * from './infrastructure';
export * from './trains';
export * from './routes';
export * from './scenario';
export * from './commands';
export * from './events';
export * from './versioned';

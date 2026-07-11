/**
 * Result and error types for fallible engine operations.
 *
 * The engine never silently swallows unexpected state. Every fallible
 * operation returns a `Result<T, EngineError>` so the caller can decide
 * whether to:
 *   - surface a `LOG` event to the UI,
 *   - throw during development to surface bugs early, or
 *   - convert into a denied-action event.
 *
 * Hidden failures are explicitly forbidden by the architecture.
 */

/**
 * Structured engine error. The `code` is a stable, machine-readable
 * identifier (e.g. `"SWITCH_LOCKED"`, `"NO_PATH"`). `context` carries
 * arbitrary serialisable data for debugging.
 */
export interface EngineError {
  readonly code: string;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

/**
 * A fallible operation outcome. Always check `ok` before reading
 * `value` or `error`.
 */
export type Result<T, E = EngineError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Construct a successful `Result`. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/** Construct a failed `Result` from an `EngineError`. */
export const err = <E = EngineError>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

/** Convenience: build an `EngineError` with optional context. */
export const engineError = (
  code: string,
  message: string,
  context?: Readonly<Record<string, unknown>>,
): EngineError =>
  context === undefined ? { code, message } : { code, message, context };

/**
 * Exhaustiveness helper. Use in the `default:` branch of a switch over
 * a discriminated union. If a new variant is added without a case,
 * TypeScript will report a type error at the call site.
 *
 * @example
 *   switch (event.type) {
 *     case 'TIME_TICK': ...
 *     default: assertNever(event);
 *   }
 */
export const assertNever = (value: never): never => {
  throw new Error(
    `Unhandled discriminant: ${JSON.stringify(value)}`,
  );
};

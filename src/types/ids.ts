/**
 * Branded string ID types for stable, opaque identifiers.
 *
 * Every infrastructure object, train, route, scenario, etc. is referenced
 * by a stable string ID (e.g. `"TRK_001"`, `"SW_003"`, `"SIG_015"`,
 * `"PLAT_02"`, or a UUID). IDs are **never** derived from array indices
 * or load order.
 *
 * The brands below are purely a TypeScript type-system check: they
 * prevent passing a `TrainId` where a `SignalId` is expected, and so
 * on. The runtime representation is still a plain `string`.
 *
 * Use {@link asId} to mint a typed ID from a raw string at the trust
 * boundary (e.g. when reading a JSON file).
 */
export type Brand<K, T extends string> = K & { readonly __brand: T };

/** A node in the topology graph. Sections and switches are both nodes. */
export type NodeId = Brand<string, 'NodeId'>;

/** An edge in the topology graph. Edges connect two nodes. */
export type EdgeId = Brand<string, 'EdgeId'>;

/** Identifies a switch (which is also a graph node). */
export type SwitchId = Brand<string, 'SwitchId'>;

/** Identifies a signal attached to a graph edge. */
export type SignalId = Brand<string, 'SignalId'>;

/** Identifies a platform attached to one or more sections. */
export type PlatformId = Brand<string, 'PlatformId'>;

/** Identifies a train in the simulation. */
export type TrainId = Brand<string, 'TrainId'>;

/** Identifies an active route in the interlocking layer. */
export type RouteId = Brand<string, 'RouteId'>;

/** Identifies a scenario definition. */
export type ScenarioId = Brand<string, 'ScenarioId'>;

/** Identifies a scenario objective. */
export type ObjectiveId = Brand<string, 'ObjectiveId'>;

/**
 * Cast a raw string into a branded ID. Use only at trust boundaries
 * (JSON loading, ID minting). Do not use to convert between ID brands
 * at runtime — the value may not actually represent that kind of
 * object.
 */
export const asId = <T extends Brand<string, string>>(raw: string): T => raw as T;

/**
 * Assert at runtime that a value is a non-empty string and brand it.
 * Returns a `Result` rather than throwing so callers can decide how
 * to surface the error (LOG event, engine error, etc.).
 */
export const safeAsId = <T extends Brand<string, string>>(
  raw: unknown,
): import('./result').Result<T, import('./result').EngineError> => {
  if (typeof raw !== 'string' || raw.length === 0) {
    return {
      ok: false,
      error: {
        code: 'INVALID_ID',
        message: 'Expected a non-empty string ID',
        context: { received: typeof raw },
      },
    };
  }
  return { ok: true, value: raw as T };
};

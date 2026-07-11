/**
 * Direction of train travel along its planned route.
 *
 * - `forward`: the train is moving in the direction of its planned route.
 * - `reverse`: reserved for future shunting movements. In milestone 1
 *   trains only travel `forward`.
 */
export type Direction = 'forward' | 'reverse';

/**
 * Switch (turnout) position. The geometric meaning of `normal` and
 * `reverse` is defined at infrastructure authoring time by the order
 * of `SwitchNode.legs`. The engine never assumes what `normal` means
 * for a given switch — it only knows the two labels.
 */
export type SwitchPosition = 'normal' | 'reverse';

/**
 * Signal aspect shown to the train driver.
 *
 * **Milestone 1** uses only two values: `'stop'` (the default
 * safe state) and `'proceed'` (the route is clear).
 *
 * The aspect model is **deliberately extensible**. New values
 * are added by extending this union; the `assertNever` helper
 * in `@/types/result` surfaces unhandled aspects at compile
 * time, so consumers and producers stay in sync.
 *
 * Examples of future aspects the model must accommodate:
 *
 *   - `'caution'` — proceed with caution (next signal at stop)
 *   - `'approach'` — caution + distant signal ahead
 *   - `'shunting'` — permissive for shunting movements
 *   - `'call-on'` — proceed at low speed, driver prepared
 *                    to stop short of any obstruction
 *   - `'flashing'` — flashing aspects (national variants)
 *   - national signalling variants (e.g. DE: `hp0`, `hp1`,
 *     `hp2`, `sh1`, `vr0`, `vr1`, `vr2`; UK: `red`, `yellow`,
 *     `double-yellow`, `green`, `position-light`)
 *
 * Adding a new aspect value is a type-visible change. Existing
 * APIs do not require redesign — the aspect is just a string
 * that flows through commands, events, and stores. Exhaustiveness
 * checks in switches catch unhandled cases at compile time.
 */
export type Aspect = 'stop' | 'proceed';

/** Severity of a log entry emitted by the engine. */
export type LogLevel = 'info' | 'warning' | 'error' | 'debug';

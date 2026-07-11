# Architecture

> Living document. Update as the project evolves. Source of truth for
> engine/UI boundaries, command/event flow, topology model, serialization
> conventions, and long-term design goals.

## 1. High-level architecture

The application is a **dispatcher-side simulation** rendered in the browser.
It is structured as two strictly separated layers connected by a typed
command/event bus.

```
+--------------------------------------------------------+
|                       Browser                          |
|                                                        |
|  +--------------------+      +-----------------------+ |
|  |     UI Layer       |      |     Engine Layer      | |
|  |  (src/ui/**)       |      |  (src/engine/**)      | |
|  |                    |      |                       | |
|  |  - React 18        |      |  - Pure TypeScript    | |
|  |  - SVG renderers   |      |  - Simulation tick    | |
|  |  - Hooks/Store     |      |  - Interlocking       | |
|  |  - rAF interp.     |      |  - Trajectory logic   | |
|  |                    |      |  - No React, no DOM   | |
|  +---------+----------+      +----------+------------+ |
|            |                            |              |
|            |   dispatch(Command)        |              |
|            +--------------------------->+              |
|            |                            |              |
|            |   subscribe(Event)         |              |
|            +<---------------------------+              |
|                                                        |
+--------------------------------------------------------+
```

### Layer rules (enforced)

| Allowed across the boundary? | UI → Engine | Engine → UI |
| --- | --- | --- |
| `Command` (typed, serialized) | ✅ | — |
| `Event` (typed, serialized) | — | ✅ |
| Direct mutation of state | ❌ | — |
| React/DOM imports in engine | ❌ | — |
| Engine objects held by React | ❌ (only serializable snapshots) | — |
| `Math.random()` in engine | ❌ (use `RngService`) | — |
| `dispatch` from anywhere in the UI | ✅ (the store is the single entry point) | — |

The ESLint `no-restricted-imports` rule enforces **no React in `src/engine/**`**.
The Zustand store holds only serializable snapshots — never live engine
references — so that snapshots can be replayed, persisted, and migrated.
The ESLint `no-restricted-properties` rule on `Math.random` in
`src/engine/**` enforces deterministic randomness.

## 2. Engine / UI separation

### Engine (`src/engine/**`)

- Pure TypeScript. No React, no DOM, no `window`, no `localStorage`.
- Owns the simulation state: topology, switches, signals, routes, trains,
  schedule, time.
- Runs on a **fixed simulation tick**, independent of the browser's
  rendering frame rate. Default: 1 sim-second per real-second, changeable
  via `SET_TICK_RATE` command.
- Exposes a single mutating method: `dispatch(command)`. Returns the
  events produced by that command.
- Replays deterministically from any serialized state.
- **Must never call `Math.random()`.** All randomness comes from the
  injected `RngService`. The ESLint `no-restricted-properties` rule on
  `Math.random` in `src/engine/**` enforces this.

#### Service decomposition (locked in Section 3)

`Simulation` is a **thin orchestrator**. It contains no business logic;
it constructs and wires the services and exposes the public surface
(`dispatch`, `subscribe`, `start`, `stop`, `serialize`, `load`).

```
Simulation                       ← thin orchestrator, no business logic
├─ TimeService                   ← simulation clock (sim-time, paused)
├─ RngService                    ← seeded, serializable PRNG
├─ EventBus                      ← typed event queue + manual flush
├─ TickLoop                      ← fixed-Hz scheduler with drift correction
└─ CommandProcessor              ← pure router: Command → service calls + LOG events
```

To add a new command: add it to the `Command` union, then add a `case`
in `CommandProcessor.process`. To add a new event: add it to the
`Event` union. `assertNever` catches both at compile time.

### UI (`src/ui/**`)

- React 18 + TypeScript. SVG rendering (no Canvas).
- Reads engine snapshots via Zustand selectors. Never mutates engine
  objects directly.
- Sends player input as typed `Command`s.
- May use `requestAnimationFrame` to interpolate the *visual* position of
  moving trains between two snapshots. The interpolation **must never**
  feed back into the simulation state.
- Owns no business logic. State transitions happen only in the engine.

### Bridge (`src/store/**`)

- Thin Zustand adapter between the engine and React.
- Subscribes to engine events, coalesces `TICK` floods,
  projects a serializable `SimulationSnapshot` on every
  event batch, and exposes selectors via Zustand
  (`useSnapshot`, `useSimulationStore`).
- Exposes a single `dispatch(command)` to the rest of the
  UI. Selection state (which signal / switch / train is
  selected) lives in the React tree, not the store.
- The `SimulationSnapshot` is a pure-data view of the
  engine. The renderer never calls into the engine
  directly. See §10 for the full snapshot contract.

## 10. UI bridge — snapshot, store, renderer rules

The bridge between the engine (`src/engine/**`) and the
UI (`src/ui/**`) is a Zustand store
(`src/store/simulationStore.ts`) that consumes the
engine's event stream and projects the engine state
into a serializable `SimulationSnapshot`. The renderer
reads from the snapshot and **only from the snapshot**.

### 10.1 The snapshot

```ts
interface SimulationSnapshot {
  readonly simTime: number;
  readonly paused: boolean;
  readonly tickHz: number;
  readonly isRunning: boolean;
  readonly topology: TopologyData;
  readonly switches: ReadonlyMap<SwitchId, SwitchState>;
  readonly signals: ReadonlyMap<SignalId, SignalState>;
  readonly sections: ReadonlyMap<NodeId, SectionState>;
  readonly routes: ReadonlyMap<RouteId, Route>;
  readonly trains: ReadonlyMap<TrainId, TrainState>;
  readonly platforms: ReadonlyMap<PlatformId, Platform>;
  readonly scenarios: ReadonlyMap<ScenarioId, Scenario>;
  readonly activeScenarioId: ScenarioId | null;
  readonly lastEventKind: string | null;
  readonly lastTickAtSimTime: number;
}
```

The snapshot is **pure data**: no live engine references,
no React types, no DOM types. It is the same shape that
`Simulation.serialize` produces, so save / load (Section
17) is a single source of truth.

### 10.2 The projector

`projectSnapshot(engine, platforms, prev, lastEventKind,
lastTickAtSimTime)` is a pure function from
`(EngineProjectionSource, ...) → SimulationSnapshot`.
It:

1. Reads every store via the engine's public surface.
2. Reuses map references when the underlying data is
   unchanged (so React's shallow-equal memoization can
   skip work).
3. Carries `simTime` and `lastTickAtSimTime` from the
   previous snapshot, updated by the store on TICK
   events.

The projector never mutates the engine.

### 10.3 TICK coalescing

`TIME_TICK` arrives on every tick. The store carries
`lastTickAtSimTime` as a top-level field so the snapshot's
time can advance without rebuilding the maps. The
projector only re-builds the maps when a non-TICK event
arrives.

### 10.4 Renderer rules

The renderer is a **pure function of the snapshot**.
Specifically:

- **The renderer never calls into the engine.** No
  `simulation.time.now()`, no `switchStore.changePosition`,
  no `interlocking.setRoute`. All of these go through
  the store's `dispatch` action.
- **The renderer never infers state.** If the renderer
  needs additional information (e.g. "which edge does
  this train occupy", "is this route active"), it must
  be present in the snapshot. Adding a new field to
  the snapshot is a deliberate change.
- **The renderer never recomputes the layout on every
  render.** The layout is computed once per topology
  change (memoised via `useMemo`).
- **Selection state is React state, not engine
  state.** A click on a signal / switch / train
  updates the canvas's local state; the canvas passes
  the selection to the inspectors as a prop.
- **Click handlers dispatch commands.** The
  `SimulationCanvas` calls `dispatch(command)` on the
  store. The command flows through the
  `CommandProcessor` and back to the renderer via the
  event stream.

### 10.5 Dispatcher interaction flows

- **Set a route**: click an entry signal → click
  "Set route from here" in the inspector → click an
  exit signal. The canvas dispatches
  `SET_ROUTE { origin, destination }`. The engine
  applies the route; the entry signal becomes
  `proceed`; the snapshot updates; the route is
  highlighted in the canvas.
- **Change a switch**: click a switch → click
  "Move to {next}" in the inspector. The canvas
  dispatches `CHANGE_SWITCH { switchId, position }`.
  The engine rejects (with a `LOG` event) if the
  switch is locked or occupied.
- **Dispatch a train**: click a held train → click
  "Dispatch" in the inspector. The canvas dispatches
  `DISPATCH_TRAIN { trainId }`. The motion service
  transitions the train from `StoppedAtPlatform` to
  `Departing` and then to `Running` on the next tick.
- **Cancel a route**: open the entry signal's
  inspector → click "Cancel route". The canvas
  dispatches `CANCEL_ROUTE { routeId }`.

### 10.6 Layout

The layout is a **pure function** of the
`TopologyData` (a serialised `Topology`). It assigns 2D
positions to every node id and every edge id. The
layout is deterministic: same topology data always
produces the same layout. The renderer reads the
layout from a `useMemo` keyed on `snapshot.topology`,
so the layout is computed once per topology change.

The current layout is a BFS-based layered layout.
Future sections may replace it with a proper
Sugiyama-style layered algorithm. The renderer
treats the layout as opaque — it never assumes a
particular algorithm — so improvements are
backward-compatible.

### 10.7 Camera

The `Camera` component is a **pure presentation**
wrapper that applies a `translate + scale` transform
to the canvas. It is React state (the camera owns
its own state, not the store). Mouse wheel zooms
around the cursor; mouse drag pans. A "Reset view"
button restores the identity transform.

The camera never reads or writes engine state. It is
the only component that owns UI state independent of
the store.

## 11. Playable Milestone 1 (Section 15)

Section 15 turns the engine + UI bridge into a
playable application. The user boots into a **main
menu**, picks a scenario, and the engine runs the
tutorial end-to-end.

### 11.1 The main menu

The `App` is a two-view state machine: "menu" shows
the `MainMenu`; "play" shows the canvas + sidebar +
event log. Picking a scenario from the menu
constructs a `Simulation` (with the tutorial topology,
platforms, and scenario) and wires the store via
`setEngine`. A "Main menu" button in the toolbar
returns to the menu.

The main menu is **pure UI**: it receives the list of
scenarios from the `App` and dispatches a callback.
The `App` owns the engine, the store, and the
scenario registry.

### 11.2 The tutorial scenario

The tutorial is a small yard with one entry signal,
4 platform signals, 1 exit signal pattern, 2 throat
switches, 4 platforms, 4 trains, and 8 objectives.
The trains are scheduled on the timetable to spawn
at `t=5`, `t=10`, `t=15`, `t=20`.

The workflow per train:
1. Dispatcher issues `SET_ROUTE` from the entry
   signal to a platform signal. The route is set,
   the signals go to `proceed`, the switches are
   locked, the sections are reserved.
2. The train in `WaitingForEntry` sees the route and
   transitions to `Entering` then `Running`. It
   traverses the route, one section per tick.
3. The train arrives at the platform, the motion
   service transitions to `StoppedAtPlatform`, and
   the `ROUTE_TRAIN_TO_PLATFORM` objective is
   checked.
4. The dispatcher issues `CANCEL_ROUTE` to release
   the switch and sections.
5. The dispatcher issues `SET_ROUTE` from the
   platform's exit signal back to the entry signal
   (the train reverses out of the platform). The
   destination signal is also set to `proceed` so
   the train can reach it (see §11.3 below).
6. The dispatcher issues `DISPATCH_TRAIN` to release
   the train. The train transitions to `Departing`
   then `Running`, traverses the exit route, and
   is removed when it reaches the end. The
   `DISPATCH_TRAIN` objective is checked.

### 11.3 Engine fixes for the play-through

Two fixes were needed in the existing engine for
the play-through to work end-to-end:

**Edge-skip fix.** When the dispatcher sets an
"exit" route on a held train, the route's BFS
may include the train's current edge so the
train can reverse out of the platform. The motion
service now skips any remaining edges that match
the train's `currentEdgeId` before picking the
next edge to advance to.

**Destination-signal fix.** The InterlockingEngine
previously only set the *origin* signal of a route
to `proceed`. The destination signal stayed at
`stop`, which meant the train could never reach the
destination (a platform or the exit). The fix:
`setRoute` now also sets the destination signal to
`proceed`; `cancelRoute` sets it back to `stop`.
This way the train can always reach the
destination, and the platform stop check is the
thing that actually stops the train at the platform.

**Spawn occupancy fix.** The train used to occupy
the entry section (the `to` end of the entry edge)
at spawn time, which caused the `TrackClearRule` to
reject any route whose path started at the entry
section. The fix: the train is at the *entry*, not
at the entry section. The first
`occupyTargetNode` happens on the first advance.

### 11.4 The `ObjectiveChecker` service

A new service in the engine that evaluates the
active scenario's objectives on every tick. It
holds the objectives and a `Set` of completed
objective ids. When an objective is newly met, it
emits `OBJECTIVE_COMPLETED` and marks it as
complete (so it doesn't re-emit on subsequent ticks).

Supported predicates (milestone 1):
- `ROUTE_TRAIN_TO_PLATFORM` — true when the named
  train is in `StoppedAtPlatform` at the named
  platform.
- `DISPATCH_TRAIN` — true when the named train was
  previously at any platform and is currently in
  `Departing`, `Running` (post-dispatch),
  `LeavingControlledArea`, or `Finished`.
- `NO_CONFLICT_FOR_DURATION` — not implemented;
  always false.

The checker is decoupled from the store layer via
a minimal `ObjectiveCheckerSource` interface:
`now()`, `getTrain(id)`. The simulation creates the
checker with a source that reads from the train
store and the time service.

The checker's current state is exposed via
`Simulation.getObjectiveViews()`, which the
`StatusPanel` reads (via the snapshot) to render
the objectives section.

### 11.5 Section 15 commits vs. Sections 16–18

Section 15 is the **last** section of the
**playable** milestone. Sections 16–18 (save/load,
replay viewer, sub-tick motion, train-on-switch)
are explicitly out of scope. The user can manually
complete the tutorial and watch trains move through
the station. After Section 15, the application
should be **manually tested** before proceeding to
Sections 16–18.

## 3. Command / Event flow

### Commands (UI → Engine)

All player interaction and lifecycle control is a typed command. The
engine processes commands and produces events. The command set is open
for extension but every command must be exhaustively typed.

The current command union (formalised in `src/types/commands.ts`):

```ts
type Command =
  | { type: 'SET_ROUTE';         origin: SignalId; destination: SignalId }
  | { type: 'CANCEL_ROUTE';      routeId: RouteId }
  | { type: 'CHANGE_SWITCH';     switchId: SwitchId; position: SwitchPosition }
  | { type: 'START_SCENARIO';    scenarioId: ScenarioId }
  | { type: 'END_SCENARIO' }
  | { type: 'PAUSE_SIMULATION' }
  | { type: 'RESUME_SIMULATION' }
  | { type: 'SET_TICK_RATE';     hz: number }
  | { type: 'TICK_NOW' }
  | { type: 'TRAIN_DISPATCH';    trainId: TrainId; exitEdgeId: EdgeId };
```

Commands are the only way to mutate simulation state. There is no
`simulation.setSwitch()` API on the engine surface; everything goes
through `dispatch(command)`.

To add a new command, add a variant to the `Command` union. The
`assertNever` helper in `result.ts` will surface unhandled cases in
the dispatch site during development.

### Events (Engine → UI)

The engine emits a typed stream of events. UI subscribes via the store
and reacts (re-render, log line, sound, etc.). The event set is
deliberately small and well-typed so future transports (WebSocket,
WebRTC, replay log) can replay the same stream.

The current event union (formalised in `src/types/events.ts`):

```ts
type Event =
  | { type: 'TIME_TICK';                simTime: number }
  | { type: 'TRAIN_ENTERED_SECTION';    trainId: TrainId; sectionId: NodeId }
  | { type: 'TRAIN_LEFT_SECTION';       trainId: TrainId; sectionId: NodeId }
  | { type: 'TRAIN_REQUESTED_ENTRY';    trainId: TrainId; entryEdgeId: EdgeId }
  | { type: 'TRAIN_DEPARTED';           trainId: TrainId }
  | { type: 'SIGNAL_ASPECT_CHANGED';    signalId: SignalId; aspect: Aspect }
  | { type: 'SWITCH_MOVED';             switchId: SwitchId; position: SwitchPosition }
  | { type: 'ROUTE_SET';                routeId: RouteId }
  | { type: 'ROUTE_RELEASED';           routeId: RouteId }
  | { type: 'OBJECTIVE_COMPLETED';      objectiveId: ObjectiveId }
  | { type: 'SCENARIO_STARTED';         scenarioId: ScenarioId }
  | { type: 'SCENARIO_ENDED';           scenarioId: ScenarioId }
  | { type: 'LOG';                      level: LogLevel; message: string; atSimTime: number };
```

The engine never throws on the UI; denied actions emit a `LOG` event
(e.g. `"Switch SW_003 locked by route R1"`). Fallible engine
operations internally return a `Result<T, EngineError>` (see §3.1
below) and the engine translates failures into `LOG` events at the
boundary.

To add a new event, add a variant to the `Event` union. `assertNever`
will flag unhandled cases in subscribers.

### Flow

```
User click  ──▶  UI handler
                       │
                       ▼
            store.dispatch(command)
                       │
                       ▼
            Simulation.dispatch(command)
                       │
                       ▼
            CommandProcessor (router)
                       │
                       ▼
            Engine service (e.g. SwitchStateStore.changePosition)
                       │
                       ▼
            Result<Event[]> ─▶ EventBus.emit(events)
                       │
                       ▼
            Store updates snapshot ──▶ React re-renders
```

Every rejected command returns a structured `Result` whose
error carries a **stable reason code** (e.g. `SWITCH_LOCKED`,
`SWITCH_OCCUPIED`, `ROUTE_CONFLICT`). The engine emits a
`LOG` event with the code; the human-readable message is
generated from the code by the engine's message catalogue.
Front-ends can localise by mapping codes to translations
without parsing English.

### 3.1 Error surface — `Result<T, EngineError>`

The engine **never silently ignores invalid state**. Every fallible
operation either:

- returns a typed `Result<T, EngineError>` (defined in
  `src/types/result.ts`),
- emits a `LOG` event on the event bus (with a stable
  reason code in the `code` field), or
- throws an explicit error during development.

`EngineError` carries a stable, machine-readable `code`
(e.g. `"SWITCH_LOCKED"`, `"ROUTE_CONFLICT"`) and a `context`
map for debugging. The constructor `engineError(code, message, context?)`
omits the `context` field entirely when not provided.

For domain-specific rejections, the engine provides
**reason-code catalogues** — frozen objects that group all
codes for a subsystem, plus a `*ReasonMessage` function that
generates a human-readable English message from the code and
a context. Section 5 introduces
`src/engine/switches/SwitchReasonCode.ts`; future sections
add catalogues for routes, signals, scenarios, etc.

`assertNever(x: never): never` is the exhaustiveness helper used in
`switch` defaults over `Command` and `Event`. Adding a variant to
either union without updating every consumer causes a TypeScript
compile error at the `assertNever` call.

### 3.2 Deterministic randomness — `RngService`

All randomness in the engine comes from `RngService`
(`src/engine/core/RngService.ts`). The engine must never call
`Math.random()` directly — this is enforced by ESLint.

The service is built on **sfc32** (Small Fast Counting, 32-bit state,
public-domain) with a 16-byte state that serializes trivially:

```ts
interface RngState {
  readonly seed: number | string;
  readonly streams: Readonly<Record<string, RngStreamState>>;
}
```

Guarantees:

- **Determinism**: two `RngService` instances constructed with the
  same seed produce the same sequence of values.
- **Replay**: `serialize()` captures the full state; `load(state)`
  restores it exactly. Replaying the same scenario from the same
  serialized state is bit-identical.
- **Sub-streams**: named streams beyond `"main"` are derived
  deterministically from the main stream on first request, so future
  subsystems (delays, failures, weather) have independent
  reproducible streams.
- **Default seed**: `1`. Deterministic by default. To get a
  non-deterministic run, pass an explicit seed (e.g. `Date.now()`)
  to `Simulation({ seed })`.

`Simulation` defaults to `seed: 1` so that out-of-the-box runs are
reproducible. Tests that need a specific sequence pass an explicit
seed.

## 4. Topology model

The infrastructure is an **arbitrary directed graph** of two node kinds
joined by edges. The engine makes **no assumptions** about the shape of
a station, junction, yard, terminal, or future multi-zone network.

```ts
type TopologyNode =
  | { kind: 'section'; id: NodeId; lengthMeters?: number }
  | { kind: 'switch'; id: NodeId; legs: NodeId[] };

type Edge = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  requires?: { switchId: NodeId; position: SwitchPosition };
  signalId?: SignalId;
  bidirectional: boolean;
};
```

- Sections are plain track blocks. Signals live on edges.
- Switches are first-class nodes. `legs` lists adjacent node IDs.
  - 2-leg: straight vs diverging
  - 3-leg: A-B in normal, A-C in reverse (or vice versa)
  - N-leg: future generalisation
- A switch's connectivity is described by an explicit
  `SwitchLegMap` interface (`{ normal, reverse }` lists of
  `(from, to)` leg pairs). Edge activity is **derived** by the
  `Topology` class from the switch's `legMap` at the current
  position — edges do not redundantly encode gating (no `requires`
  field on `Edge`).
- `BfsPathfinder.findPath(from, to, switchPositions, ...)` is
  the default path finder. It tracks the **incoming leg** when
  traversing a switch: a leg transition is allowed only if the
  switch's `legMap` at the current position contains the
  connecting leg pair.
- **Pathfinding is behind the `Pathfinder` interface.** Future
  routing strategies plug in without changing the engine API:
  Dijkstra (weighted), preferred-route, timetable-aware,
  dispatcher hints, automatic routing (ARS).
- IDs are **stable strings** (`TRK_001`, `SW_003`, `SIG_015`, `PLAT_02`,
  or UUIDs). Branded types (`NodeId`, `EdgeId`, `SwitchId`, …) prevent
  passing the wrong ID kind at compile time. The engine never uses
  array indices to look up infrastructure.
- ESLint forbids `nodes[i]`, `tracks[0]`, or hardcoded `id === 'P1'`
  style logic in the engine. A type-level test guards against
  re-introducing the redundant `Edge.requires` field.

#### Metadata on every node and edge (locked in Section 4)

Every `SectionNode`, `SwitchNode`, and `Edge` carries an
optional `metadata: Readonly<Record<string, unknown>>` field.
The engine **never reads** this field. It exists so that
domain-specific data can travel alongside the topology without
engine changes:

- line speed
- electrification
- platform number
- kilometer position
- axle counter / track circuit type
- maintenance state
- ETCS / ATP information
- custom scenario tags

Metadata is preserved verbatim through `serialize()` /
`fromJSON()` and through any future migration. The engine
treats unknown metadata as a black box.

#### Infrastructure immutability (locked in Section 4)

`Topology` is **frozen after construction**:

- All fields are `readonly`; internal maps are `ReadonlyMap`.
- `Object.freeze(this)` is called in the constructor.
- No method mutates internal state.
- `getAllNodes()` / `getAllEdges()` return snapshots.

**Runtime state lives separately**, in `SimulationState` (added
in later sections):

```
Infrastructure                          Simulation state
─────────────                          ────────────────
Topology (frozen)                       TimeService (clock)
├─ nodes (sections + switches)          RngService (PRNG)
├─ edges                                SwitchState (per switch)
└─ metadata (per node/edge)             SectionState (per section)
                                        SignalState (per signal)
                                        Route (active routes)
                                        TrainState (per train)
```

The engine never mixes the two: a switch's physical
configuration is in the `Topology`; its current position
(`normal` / `reverse`), lock state, and occupation are in
`SimulationState` and updated only via `CHANGE_SWITCH` and
the train-motion code.

## 4.1 Pathfinding — `Pathfinder` interface

Pathfinding is a **strategy**, not a built-in. The engine
defines the contract; algorithms implement it.

```ts
interface Pathfinder {
  readonly name: string;
  findPath(
    from: NodeId,
    to: NodeId,
    context: PathfindingContext,
  ): Result<Path, EngineError>;
}
```

`PathfindingContext` carries:

- **Required**: `topology`, `switchPositions`
- **Optional** (backward-compatible — add new ones over time):
  `reservations`, `occupiedBy`, `edgeWeights`, `preferredNodes`,
  `blockedNodes`, `blockedEdges`

Implementations to come:

- `BfsPathfinder` (milestone 1, default)
- `DijkstraPathfinder` — weighted (shortest distance / time)
- `PreferredRoutePathfinder` — favours dispatcher hints
- `TimetableAwarePathfinder` — selects paths that match the
  train's timetable
- `DispatcherHintPathfinder` — accepts explicit dispatcher
  guidance
- `AutomaticRoutingPathfinder` — Automatic Route Setting (ARS)

The `BfsPathfinder` (milestone 1) tracks the **incoming leg**
when traversing a switch: a leg transition is allowed only if
the switch's `legMap` at the current position contains the
connecting leg pair. Iterative, no recursion.

## 5. Switch state machine

Every switch has a **lifecycle** in addition to its physical
position. The lifecycle is the source of truth for whether
the switch can be moved, reserved, or traversed.

### 5.1 Lifecycle states (milestone 1)

```
   free ──reserve──▶ reserved ──lock──▶ locked
     ▲                  │                  │
     │                  └──release────┐     │
     │                                ▼     │
     └────release──────────────────free ◀──┘

   free / reserved ──occupy──▶ occupied ──vacate──▶ free

   locked switches cannot be moved, reserved, or occupied.
```

| State      | Position can change? | Reserved by route? | Held by route? | Train on it? |
| ---------- | -------------------- | ------------------ | -------------- | ------------ |
| `free`     | yes                  | no                 | no             | no           |
| `reserved` | yes                  | yes                | no (about to)  | no           |
| `locked`   | **no**               | yes                | yes            | no           |
| `occupied` | **no**               | n/a                | n/a            | yes          |

### 5.2 Future states (named in the type, not implemented)

- `faulted` — the switch has failed (e.g. points won't move).
- `maintenance` — the switch is under maintenance work.
- `moving` — the switch is mid-transition when movement time
  is added.

Adding new states is a deliberate, type-visible change. The
state machine's transition matrix (`reserve`, `lock`,
`release`, `occupy`, `vacate`, `changePosition`) is updated
together with the new state.

### 5.3 Position changes are transitions, not assignments

`SwitchStateStore.changePosition(id, newPosition)` is **not**
a property setter. It:

1. Validates the current lifecycle allows the change
   (`free` or `reserved` only).
2. Returns a `Result<SwitchTransition, EngineError>` with
   the full before-and-after state.
3. Emits the `SWITCH_MOVED` event (with optional
   `fromPosition` for animation).

```ts
interface SwitchTransition {
  switchId: SwitchId;
  from: SwitchTransitionState;   // { position, lifecycle }
  to: SwitchTransitionState;
  reason: SwitchTransitionReason;
  routeId: RouteId | null;
  trainId: TrainId | null;
}
```

This shape leaves room for future movement time, failures,
and animations without redesigning the API.

### 5.4 Reason codes

Every rejected switch command returns an `EngineError` whose
`code` is one of the `SwitchReasonCode` values:

- `SWITCH_UNKNOWN` — switch ID not in the store
- `SWITCH_LOCKED` — change on a locked switch
- `SWITCH_OCCUPIED` — change on an occupied switch
- `SWITCH_NOT_FREE` / `SWITCH_ALREADY_RESERVED` — reserve
  validation
- `SWITCH_NOT_RESERVED` / `SWITCH_RESERVED_BY_ANOTHER` —
  lock validation
- `SWITCH_NOT_HELD` / `SWITCH_HELD_BY_ANOTHER` — release
  validation
- `SWITCH_CANNOT_OCCUPY_LOCKED` / `SWITCH_NOT_OCCUPIED` /
  `SWITCH_OCCUPIED_BY_ANOTHER` — occupy/vacate validation
- `SWITCH_INVALID_TRANSITION` — generic catch-all

The engine emits a `LOG` event with the code; the
human-readable message is generated by `switchReasonMessage`.
Front-ends can localise by mapping codes to translations.

## 6. Signal model

**Signals are derived views of the interlocking state.**
A signal must never decide its own aspect. Instead, the
interlocking engine (Section 7) computes the permitted
aspect and the `SignalStateStore` records that decision.

```
   Interlocking engine                SignalStateStore
   ───────────────────                ────────────────
   "Route R1 is set,                    "S2 = Proceed,
    signal S2 should                       reason = ROUTE_SET,
    show Proceed."                         atSimTime = 12"
   "Route R2 conflicts,                 "S5 = Stop,
    so signal S5 should                    reason = CONFLICT,
    show Stop."                            atSimTime = 12"
   "Route R1 released,                  "S2 = Stop,
    back to Stop."                         reason = ROUTE_RELEASED,
                                          atSimTime = 30"
```

The store has exactly one mutator: `setAspect(id, aspect,
reason, atSimTime)`. It does not validate whether the aspect
is "permitted" — the engine has already done that. It
records the new aspect, the structured reason, and the time,
and returns a `SignalAspectChange` describing the
transition. The caller emits events.

### 6.1 Extensible aspect model

`Aspect` is `'stop' | 'proceed'` in milestone 1 but the
type is **deliberately extensible**. The TSDoc enumerates
the future values the type must accommodate:

- `caution` — proceed with caution (next signal at stop)
- `approach` — caution + distant signal ahead
- `shunting` — permissive for shunting movements
- `call-on` — proceed at low speed, prepared to stop short
- `flashing` — flashing aspects (national variants)
- national signalling variants (e.g. DE `hp0/hp1/hp2`,
  UK `red/yellow/double-yellow/green`)

Adding a new aspect is a type-visible change. Existing
APIs do not need redesign — the aspect is just a string
that flows through commands, events, and stores.
Exhaustiveness checks (the `assertNever` helper) catch
unhandled cases at compile time.

### 6.2 Aspect change reasons

Every aspect change carries a structured
`SignalAspectChangeReason`:

```ts
type SignalAspectChangeReason =
  | { kind: 'INITIAL' }
  | { kind: 'ROUTE_SET'; routeId: RouteId }
  | { kind: 'ROUTE_RELEASED'; routeId: RouteId }
  | { kind: 'CONFLICT'; otherRouteId: RouteId }
  | { kind: 'TRAIN_OCCUPIED'; trainId: TrainId }
  | { kind: 'TRAIN_CLEARED'; trainId: TrainId }
  | { kind: 'TIMER_EXPIRED' }
  | { kind: 'OPERATOR_OVERRIDE' }
  | { kind: 'SYSTEM'; note?: string };
```

The `SIGNAL_ASPECT_CHANGED` event carries the reason; the
log entry and replay system use it to explain *why* the
signal changed. Adding new reasons is a type-visible
change but does not change the event signature.

## 7. Interlocking engine

The **brain** of the route-setting system. Pure and
deterministic: given the same infrastructure, simulation
state, command sequence, and RNG seed, the produced
route decisions, events, and store mutations are
byte-identical. There is no use of `Math.random`, no
wall-clock time, no shared mutable state outside the
stores passed in via the constructor.

### 7.1 Rule-based architecture

The engine has **no giant if/else**. It evaluates a
`RuleRegistry` of independent `SafetyRule` instances. The
default set is five rules:

| Rule | Checks | Spec mapping |
| --- | --- | --- |
| `TrackClearRule`  | every section on the path is not occupied and not reserved by another route | "every required track section is clear" |
| `SwitchLockedRule` | every switch on the path is not locked, reserved, or occupied | "switches are not occupied" |
| `ConflictRule`     | no other active route shares any node with the proposed path | "no conflicting route exists" |
| `SignalRule`       | both signals exist and are automatic | "destination is valid" |
| `PlatformRule`     | the destination must be a platform (toggleable) | future / national variants |

Each rule is a small class implementing:

```ts
interface SafetyRule {
  readonly name: string;
  evaluate(context: RuleContext): readonly RouteRejection[];
}
```

Adding a new signalling system (a national variant, a
flank-protection rule, an approach-locking constraint) is
a matter of writing a new `SafetyRule` and registering it.
No engine changes are required.

### 7.2 Multi-reason rejections

Every rejected route request returns **all** blocking
reasons, not just the first. The engine collects rejections
from every rule and produces the multi-line log entry the
spec describes:

```
Cannot set route:
  ✓ Switch W3 locked
  ✓ Track T12 occupied
  ✓ Route R4 conflicts
```

The structured data is in `RouteRejection[]` on the
`RouteSetOutcome.rejections` field. The human-readable
message is generated by `formatRejectionBatch`. The
`EngineError` carries the rejections in
`context.rejections` for downstream consumers.

### 7.3 The SET_ROUTE flow

```
SET_ROUTE(origin, destination, at)
   │
   ▼
InterlockingEngine.setRoute(...)
   │
   ├─ 1. Validate origin and destination signals
   │     → if missing, return UNKNOWN_ORIGIN / UNKNOWN_DESTINATION
   │
   ├─ 2. Find a path via the Pathfinder (BFS by default)
   │     → if no path, return NO_PATH
   │
   ├─ 3. Build a RuleContext
   │     (sections and switches extracted from the path)
   │
   ├─ 4. registry.evaluateAll(context)
   │     → if any rejections, return { kind: 'rejected', rejections }
   │
   └─ 5. Write the route
         ├─ RouteStore.add(route)
         ├─ SectionStateStore.setReserved for each section
         ├─ SwitchStateStore.reserve + lock for each switch
         ├─ SignalStateStore.setControlledBy on both signals
         └─ SignalStateStore.setAspect(origin, 'proceed', ROUTE_SET, at)
         → return { kind: 'ok', route }
```

`CANCEL_ROUTE` reverses the writes: sections unreserved,
switches released, signal reverted to `stop`.

### 7.4 Determinism

The engine's determinism is guaranteed by:

- Pure `SafetyRule` implementations that depend only on
  the `RuleContext` they receive
- The injected `Pathfinder` (the default BFS is
  deterministic)
- The `RuleRegistry` evaluates rules in insertion order
- ESLint rule `no-restricted-properties` for
  `Math.random` in `src/engine/**` (Section 3)
- All randomness (where used) goes through the injected
  `RngService`

The test suite includes an explicit determinism test
that runs the same scenario twice and verifies that the
route decisions, event sequences, and final state are
identical.

### Supported shapes (illustrative, not exhaustive)

| Shape | Sections | Switches | Edges | Notes |
| --- | --- | --- | --- | --- |
| Linear | 1+ | 0 | chain | End sections have 1 neighbor. |
| Terminal stub | chain + dead-end | 1 | tree | End sections valid route destinations. |
| Y-junction | 3 paths | 1 (3-leg) | 6 | One switch routes A→B or A→C. |
| Yard throat | many parallels | 1+ | fan-in | Path finder picks platform via switch positions. |
| Double-track | 2 parallels | 0+ crossovers | chain×2 + n | Crossovers are 2-leg switches. |
| Multi-zone | union of above | — | shared boundary edges | Future, same model. |

## 8. Train model — finite-state machine + immutable definitions

Trains are the moving objects in the controlled area. The
train model has three hard rules:

1. **Train behaviour is a finite-state machine.** Every
   train is in exactly one of a closed set of states. There
   are no `isStopped` or `isApproaching` booleans — the
   `fsmState` field on `TrainState` is the single source of
   truth for what a train is doing at any given sim-time.
   The `assertNever` helper in `@/types/result` flags
   unhandled states at compile time.

2. **Train definitions are immutable.** `TrainDefinition`
   (in `@/types/trains`) is loaded from the scenario file
   and is never mutated by the engine. It carries the
   static data the train was born with: identifier,
   label, length, maximum speed, platforms it must stop
   at, and its entry / exit edges.

3. **Runtime values live in `TrainState`.** Position
   (current edge and `t` along it), the current route,
   the remaining planned edges, the FSM state, the
   platform at which the train is currently held, the
   last-tick timestamp, and the running delay all live
   on `TrainState` in the `TrainStateStore`. The store
   is a passive data structure; the canonical writer is
   the `TrainMotionService`.

The **timetable definition** (`Scenario.timetable`) is
likewise immutable. The `ScenarioService` walks the
timetable by tracking an index into the array — it
never rewrites the array.

### 8.1 Train FSM (milestone 1)

```
                 ┌─────────────────────┐
   (spawn)       │                     │     (route cancelled /
     │           ▼                     │      set, no edge)
     │   ┌────────────────┐            │
     └──▶│ WaitingForEntry│────────────┘
         └───────┬────────┘
                 │  (route set, train on entry edge)
                 ▼
         ┌────────────────┐
         │    Entering    │  (one-tick transition)
         └───────┬────────┘
                 │
                 ▼
         ┌────────────────┐◀─────────┐
         │    Running     │──────────┤
         └──┬─────┬───┬───┘          │
            │     │   │              │
            │     │   │              │
            ▼     │   ▼              │
  ┌────────────────┐ │ ┌──────────────────┐
  │ApproachingSig. │ │ │StoppedAtPlatform │
  └───────┬────────┘ │ └────────┬─────────┘
          │          │          │  (dispatcher
          │          │          │   releases)
          ▼          ▼          ▼
  ┌────────────────┐ ┌──────────────────┐
  │StoppedAtSignal │ │    Departing     │
  └───────┬────────┘ └────────┬─────────┘
          │                  │
          │ (signal → proceed) (next tick)
          ▼                  ▼
         (back to Running)  (back to Running)

  Any state (except Finished):
      │
      │  (train on exit edge, no further planned route)
      ▼
  ┌────────────────────────┐
  │ LeavingControlledArea  │
  └────────────┬───────────┘
               │  (off the edge, removed from store)
               ▼
  ┌────────────────────────┐
  │      Finished          │  (terminal)
  └────────────────────────┘
```

Adding a new state is a deliberate, type-visible change.
The `assertNever` helper surfaces unhandled cases in
consumers at compile time. The transition matrix in
`TrainMotionService` is updated together with the new
state. Future states (named in the type, not implemented
in M1) include `HoldingForSchedule`, `HeldByDispatcher`,
`HeldBySignalman`, `Faulted`, `Coupling`, `Splitting`.

### 8.2 Position model

A train is on an **edge**. The `currentEdgeId` is the
edge the train is currently traversing. `edgePosition`
in `[0, 1]` is the train's position along the edge
(purely visual / motion state — the engine never stores
finer position). Section occupancy is derived: a train
"occupies" the section that is the `to` end of its
current edge. The motion service updates
`SectionStateStore.setOccupied` on every advance and
emits `TRAIN_ENTERED_SECTION` / `TRAIN_LEFT_SECTION`.

Switches are not train-occupied in milestone 1: the
`SwitchStateStore.occupy` / `vacate` lifecycle is
reserved for route reservations and locks. Future
sections can add train-on-switch occupancy if needed.

### 8.3 Signal obedience

Before advancing across an edge, the motion service
checks the **signal at the `to` end of the next edge**.
If the signal is `stop`, the train does not advance; it
stays on the current edge and transitions to
`StoppedAtSignal`. When the signal changes to `proceed`
(via a `SET_ROUTE` or `CANCEL_ROUTE`), the next tick
resumes motion.

In milestone 1, the InterlockingEngine only sets the
entry signal of a route to `proceed`. The next signal
on the path remains `stop` (its default), so a train
that is following a route naturally stops at every
mid-route signal unless the dispatcher (or another
route) clears it.

### 8.4 Platform stops

After advancing, the motion service checks whether the
new edge's `to` end belongs to a platform listed in
the train definition's `stopsAtPlatforms`. The catalogue
of platforms is provided to the motion service as a
`ReadonlyMap<PlatformId, Platform>`. If a platform
covers the new section, the train transitions to
`StoppedAtPlatform` and the platform id is recorded in
`heldAtPlatform`. The dispatcher releases the train via
the `DISPATCH_TRAIN` command, which transitions the
train to `Departing` (the motion service sets it to
`Running` on the next tick).

### 8.5 Determinism

The train domain is fully deterministic. The
`TrainMotionService` is pure: it reads the stores,
computes the next state, and writes the replacement
state. The `ScenarioService` walks the timetable by
index — it never mutates the timetable array. Same
infrastructure, scenario, sim-time, and command
sequence → same train state changes, same store
mutations, same event sequences.

## 9. Scenario lifecycle + SPAWN_TRAIN / DISPATCH_TRAIN

A scenario is a data-driven definition of a dispatching
session. It carries an `infrastructure` reference, a
list of `TrainDefinition`s, a `timetable` of events to
fire at specific sim-times, and a list of `Objective`s.

### 9.1 The `ScenarioService`

The service is the bridge between the scenario's
immutable definition and the simulation tick. Its
public surface:

- `register(scenario)` / `unregister(scenarioId)` —
  scenario catalogue.
- `start(scenarioId)` / `end()` — scenario lifecycle.
- `activeScenario()` — read the current scenario.
- `tick(atSimTime)` — walk the timetable, return the
  `Command`s that should fire at this time.

The service tracks an index into the timetable array
and advances it on every tick. The timetable array is
never rewritten. For each event whose `atSimTime` is
less than or equal to the current tick, the service
returns the corresponding `Command` (currently only
`SPAWN_TRAIN` is implemented; the other event kinds
are present in the type but return `null`).

### 9.2 The tick loop

`Simulation`'s `onTick` callback is the orchestration
point:

1. **Walk the scenario timetable.** Call
   `scenarioService.tick(simTime)` to get the commands
   due this tick. Dispatch them through the
   `CommandProcessor` (which is also responsible for
   emitting any LOG / spawn / dispatch events).
2. **Run the train motion service.** For every train,
   the motion service computes the next state, updates
   section / switch stores, and emits events.
3. **Advance the clock** and emit `TIME_TICK`.
4. **Flush the event bus** so subscribers see every
   event synchronously.

The order matters: scenario commands fire before train
motion, so a `SPAWN_TRAIN` event in the timetable is
visible to the same tick's motion pass. The clock
advances after motion, so a train that was at
`lastTickAtSimTime = 0` becomes `lastTickAtSimTime = 1`
on the next tick.

### 9.3 New commands

Two commands were added in Sections 8–10:

- `SPAWN_TRAIN { train: TrainDefinition }` — creates a
  `TrainState` via `TrainMotionService.spawnTrain` and
  emits `TRAIN_REQUESTED_ENTRY`. The train is in
  `WaitingForEntry` on its entry edge.
- `DISPATCH_TRAIN { trainId }` — calls
  `releasePlatformStop` on the train store. Transitions
  the train from `StoppedAtPlatform` to `Departing`.
  The motion service sets it to `Running` on the next
  tick.

The pre-existing `TRAIN_DISPATCH` command remains
"not yet implemented" — it is reserved for a future
"train has reached the end of its planned path and is
leaving the controlled area" command, which is
redundant with the auto-leave behaviour of the motion
service in milestone 1.

## 5. Serialization approach

The **entire simulation state is serializable to JSON**, including the
topology, current switch positions, signal aspects, active routes, train
positions, scenario state, simulation time, and event log buffer.

```jsonc
{
  "version": 1,
  "topology": { "nodes": [...], "edges": [...] },
  "state":   { "time": 1234, "trains": [...], "switches": [...], "signals": [...], "sections": [...], "routes": [...] },
  "scenario": { "id": "tutorial", "objectives": [...] }
}
```

### Versioning rules

- Every JSON artifact (infrastructure file, scenario file, save file,
  serialized engine state) starts with a top-level `"version": <int>`.
- A `migrations/` module ships in `src/engine/migrations/`. Each entry
  is a pure `(data) → data` function. The loader chains migrations
  forward until `version` matches the current engine version.
- The engine's current `CURRENT_VERSION` is exported and used as the
  default when writing new files.
- The engine will reject (or migrate) any data whose `version` differs.

### What is and isn't serialized

| State | Serialized? | Why |
| --- | --- | --- |
| Topology (nodes, edges) | ✅ | Authored in JSON files; loaded as-is. |
| Switch positions, locks | ✅ | Required to resume. |
| Signal aspects | ✅ | Derived from routes; persisted for resume. |
| Active routes, reservations | ✅ | Required to resume. |
| Train positions, FSM states | ✅ | Required to resume. |
| Simulation time | ✅ | Required to resume. |
| Scenario objectives | ✅ | Required to resume. |
| Event log buffer | ✅ (capped) | Useful for replay / debugging. |
| React component state | ❌ | UI concern. |
| Render interpolation state | ❌ | Recomputed from snapshot. |

### Save/load (future)

Section 17 ships the round-trip (`serialize()` + `fromJSON()`). A
user-facing save/load UI is intentionally deferred, but the data format
is stable enough to persist today.

## 6. Long-term design goals

The architecture is built to support, without rewrites:

- **Larger stations, multiple zones, multi-dispatcher scenarios**
  — the topology model scales to thousands of nodes; the event bus is
  transport-agnostic so a server could relay the same event stream.
- **Automatic route setting (ARS)** — separate planner service that
  emits `SET_ROUTE` commands; no engine change required.
- **Train delays, failures, maintenance work** — modeled as additional
  events that the engine consumes in its tick (e.g. `TRAIN_DELAYED`,
  `TRACK_BLOCKED`). Architecture does not assume happy path.
- **Weather, scoring, achievements** — additive: pure functions over
  the event stream, no engine changes.
- **Save / load** — already a `serialize()` round-trip away.
- **Replay system** — record the event stream, replay it through the
  engine deterministically.
- **Multiplayer (server-authoritative)** — server runs the same engine,
  clients render and dispatch commands. The command/event protocol is
  the wire protocol.
- **Scenario editor, infrastructure editor, timetable editor** — all
  operate on the same JSON shapes; an editor is a UI over the same
  schemas the engine consumes.
- **Performance** — the simulation tick is fixed-rate and decoupled
  from rendering; path finding is BFS on a sparse graph; the event bus
  coalesces `TICK` floods for React. Designed for thousands of
  sections, hundreds of switches and signals, dozens of trains.

### Non-goals for milestone 1

PWA, save/load UI, multiplayer, scoring, additional signal aspects
beyond `Stop | Proceed`, continuous train motion, dispatcher chat,
weather, failures, replay, scenario editor, map editor, timetable
editor. Architecture supports all of the above; implementation is
intentionally deferred.

## 7. Updating this document

This document is updated whenever:

- A new command or event is added to the engine surface.
- The topology model gains a new node or edge kind.
- A new persistence format is introduced.
- A new architectural rule is locked in.

Last updated: Section 15 (Playable Milestone 1: main menu + tutorial scenario + objective checker).

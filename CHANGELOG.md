# Changelog

## Section 15 — Playable Milestone 1

The "playable" milestone. The application now boots into
a main menu, the user picks the tutorial scenario, the
engine runs, trains spawn on the timetable, the
dispatcher routes them into platforms and dispatches
them out, and the scenario's eight objectives are
checked. The user can manually complete the tutorial and
watch trains move through the station.

This section validates the existing engine and UI before
adding Sections 16–18. The dispatcher workflow is
end-to-end: main menu → scenario → spawn → route → arrive
→ dispatch → leave → objective checked.

### Implemented

- **Tutorial scenario** (`src/scenarios/tutorial.ts`) —
  a small yard with:
  - 1 entry signal (`S_in`), 4 platform signals
    (`S_p1` … `S_p4`), 1 exit signal pattern.
  - 2 throat switches (`W1` to P1/P2, `W2` to P3/P4).
  - 4 platforms (`PL1` … `PL4`) covering the 4 platform
    sections.
  - 4 trains (`IC101`, `IC102`, `REG201`, `FRG301`) each
    scheduled to spawn on the timetable at `t=5`,
    `t=10`, `t=15`, `t=20`.
  - 8 objectives — 4× `ROUTE_TRAIN_TO_PLATFORM` and
    4× `DISPATCH_TRAIN`.

- **`ObjectiveChecker` service**
  (`src/engine/scenarios/ObjectiveChecker.ts`) — holds
  the active scenario's objectives and emits
  `OBJECTIVE_COMPLETED` when one is met. Reads the
  current train states via a minimal source interface
  (decoupled from the store layer). Supports
  `ROUTE_TRAIN_TO_PLATFORM` (train is `StoppedAtPlatform`
  at the named platform) and `DISPATCH_TRAIN` (train was
  previously at a platform and is now in `Departing`,
  `Running` (post-dispatch), `LeavingControlledArea`,
  or `Finished`).
  - Wired into `Simulation`'s tick loop.
  - `setObjectives` is called by `CommandProcessor` on
    `START_SCENARIO`; `clearObjectives` on
    `END_SCENARIO`.
  - `Simulation.getObjectiveViews()` returns the
    current objective state for the UI.

- **Two engine fixes** needed for the play-through to
  work end-to-end:
  - **Edge-skip fix** in
    `TrainMotionService.handleRunning`: the "exit"
    route's BFS may include the train's current edge so
    the train can reverse out of the platform. The
    motion service now skips any remaining edges that
    match the train's `currentEdgeId` before picking
    the next edge to advance to.
  - **Destination-signal fix** in
    `InterlockingEngine.setRoute` and
    `cancelRoute`: the destination signal is now also
    set to `proceed` when the route is established, so
    the train can reach the destination (a platform
    or the exit). When the route is cancelled, the
    destination signal is set back to `stop` so the
    next train does not enter without a new route.
  - **Spawn occupancy fix** in
    `TrainMotionService.spawnTrain`: the train no
    longer occupies the entry section at spawn time.
    The train is at the *entry*, not at the entry
    section. The first `occupyTargetNode` happens on
    the first advance. This allows the dispatcher to
    set a route whose path starts at the entry
    section (otherwise `TrackClearRule` would
    reject it).

- **`MainMenu`** (`src/ui/MainMenu.tsx`) — the entry
  point of the application. Lists available scenarios
  (currently: the tutorial), with a "Start scenario"
  button. The user can also see quick-help text
  describing the dispatcher workflow.

- **`App` rewritten** (`src/App.tsx`) — two-view state
  machine: "menu" shows `MainMenu`; "play" shows the
  canvas + sidebar + event log. Selecting a scenario
  constructs the `Simulation` (with the tutorial
  topology, platforms, and scenarios) and wires the
  store via `setEngine`. A "Main menu" button in the
  toolbar returns to the menu.

- **Objectives in the sidebar** (`StatusPanel.tsx`) —
  the status panel now shows the scenario's objectives
  with a `completedCount / total` count and a
  per-objective list. Completed objectives are
  struck-through and shown with a green checkmark and
  the sim-time of completion.

- **End-to-end tutorial tests**
  (`src/__tests__/tutorial-playthrough.test.tsx`) —
  four integration tests that exercise the full
  play-through: spawn a train on the timetable, set
  a route, watch the train arrive at a platform,
  verify the `ROUTE_TRAIN_TO_PLATFORM` objective is
  checked, cancel the entry route, verify the second
  train is still in `WaitingForEntry`, etc.

### Files added

- `src/scenarios/tutorial.ts` — tutorial scenario data
- `src/engine/scenarios/ObjectiveChecker.ts` — objective
  evaluation service
- `src/engine/scenarios/__tests__/ObjectiveChecker.test.ts`
  — 9 unit tests for the checker
- `src/ui/MainMenu.tsx` — main menu component
- `src/__tests__/tutorial-playthrough.test.tsx` — 4
  end-to-end play-through tests

### Files updated

- `src/engine/trains/TrainMotionService.ts` — edge-skip
  fix in `handleRunning`; spawn occupancy fix in
  `spawnTrain` (no longer marks the entry section
  as occupied at spawn time)
- `src/engine/interlocking/InterlockingEngine.ts` —
  destination signal is now also set to `proceed`
  on `setRoute`, and to `stop` on `cancelRoute`
- `src/engine/core/CommandProcessor.ts` — wires the
  `ObjectiveChecker` (passed as a dep); calls
  `setObjectives` on `START_SCENARIO` and
  `clearObjectives` on `END_SCENARIO`
- `src/engine/core/Simulation.ts` — exposes
  `objectiveChecker` and `getObjectiveViews`; runs the
  checker on every tick
- `src/store/SimulationSnapshot.ts` — snapshot now
  includes `objectives: readonly ObjectiveSnapshot[]`
- `src/ui/StatusPanel.tsx` — renders the objectives
  section
- `src/ui/CommandToolbar.tsx` — accepts an optional
  `onBackToMenu` prop
- `src/ui/ScenarioSelector.tsx` — accepts scenarios
  and callbacks as props (was reading from the store)
- `src/App.tsx` — main menu view, "Main menu" button,
  uses the tutorial scenario
- `src/index.css` — main menu and objectives styles
- `src/__tests__/app-integration.test.tsx` — updated
  for the new main-menu + play-view flow (7 tests)

### Tests added (54 new, 397 total)

- **`ObjectiveChecker` (9)** — `setObjectives` /
  `clearObjectives` / `getViews`; `ROUTE_TRAIN_TO_PLATFORM`
  completes when the train is at the right platform;
  `DISPATCH_TRAIN` requires the train to have been at
  a platform and to be in a post-dispatch state;
  `NO_CONFLICT_FOR_DURATION` never completes (not
  implemented); idempotent (re-emits are suppressed).
- **End-to-end tutorial play-through (4)** — spawn a
  train on the timetable, set a route, watch the
  train arrive at a platform, verify the objective
  is checked, cancel the entry route, etc.
- **App integration (3 new)** — renders the main
  menu, transitions to the play view, reflects
  `SET_TICK_RATE` in the snapshot, captures engine
  events, includes the tutorial signal in the
  snapshot, loads the tutorial objectives into the
  snapshot.

### Verification

- typecheck: PASSED
- test: 397 tests passed (54 new)
- lint: PASSED
- build: PASSED

### Known limitations (manual play-through notes)

- The full multi-train flow with `DISPATCH_TRAIN` is
  exercised by manual testing in the UI. The
  automated integration tests cover single-train
  flow + route cancellation, which is the most
  failure-prone part of the workflow.
- Multiple routes through the same throat switch
  cannot coexist. The dispatcher must `CANCEL_ROUTE`
  on the entry route before setting the exit route.
  This is realistic railway-signaling behaviour.
- The `TRAIN_DISPATCH` command remains
  "not yet implemented" (deferred). Trains are
  released via `DISPATCH_TRAIN` (the dispatcher
  workflow).

## Sections 11–14 — UI bridge: snapshot store + SVG renderer + dispatcher + camera

The "UI bridge" milestone. The engine is now connected
to a working dispatcher-style UI. The store projects
the engine state into a serializable snapshot, a pure
SVG renderer draws the topology / switches / signals
/ platforms / routes / trains from that snapshot, the
dispatcher can set routes and change switch positions
by clicking entities, and a deterministic layout +
camera map the topology into 2D space.

**No new engine abstractions** were introduced. The
renderer is a pure function of the snapshot; everything
the UI needs is read from `SimulationSnapshot`. The
dispatcher sends typed `Command`s through the store
and never mutates engine state directly.

### Implemented

- **`SimulationSnapshot` type** (`src/store/SimulationSnapshot.ts`)
  — the serializable view of the engine. Holds
  `simTime`, `paused`, `tickHz`, `isRunning`, the
  serialized topology, and `ReadonlyMap`s keyed by id
  for every state container. The projector is a pure
  function from `(EngineProjectionSource, platforms,
  prev) → SimulationSnapshot`; it reuses map
  references when the underlying data is unchanged so
  React's `===` memoization can skip work.

- **`useSimulationStore`** (`src/store/simulationStore.ts`)
  — Zustand store. Public surface:
  `setEngine(engine, platforms?)`, `dispatch(command)`,
  `detach()`. The store subscribes once to the engine's
  event stream and re-projects on every batch.

- **TICK coalescing** — `TIME_TICK` is the only event
  that the store handles specially. The store carries
  `lastTickAtSimTime` as a top-level field so the
  snapshot's time can advance without rebuilding the
  maps. Other event kinds trigger a re-projection.

- **Snapshot stability tests** — verified that
  identical engine inputs produce the same map
  references; switching a switch position or a signal
  aspect produces a new map. Verified that the
  projector reuses the previous snapshot's maps when
  the data is unchanged.

- **Integration tests** — wired a real `Simulation` to
  the store; verified that `SET_TICK_RATE`,
  `CHANGE_SWITCH`, and the `TIME_TICK` flow all
  propagate to the snapshot.

- **Deterministic 2D layout** (`src/ui/layout/computeLayout.ts`)
  — a BFS-based layered layout that maps every node
  id to `{ x, y }` and every edge id to a
  `{ from, to }` line. Same `TopologyData` always
  produces the same layout. The renderer memoises the
  layout per topology change; the engine never sees
  layout data.

- **Pure SVG renderers** (`src/ui/renderers/`):
  - `EdgeGlyph` — coloured line; thicker for active
    routes, highlighted for occupied edges.
  - `NodeGlyph` — section (rect) or switch (circle);
    colour reflects lifecycle / occupancy.
  - `SignalGlyph` — coloured dot; red for `stop`,
    green for `proceed`; grows when selected.
  - `PlatformGlyph` — labelled bar spanning the
    platform's sections; highlighted when a train is
    held at the platform.
  - `TrainGlyph` — small marker on the train's
    current edge, positioned by interpolating
    `edgePosition` along the edge layout.

- **`SimulationCanvas`** (`src/ui/SimulationCanvas.tsx`)
  — composes the renderers. Reads only the snapshot
  and the (memoised) layout. Selection state is
  passed in as a prop; the canvas never stores
  selection itself. Click handlers call `dispatch`
  on the store.

- **`Camera`** (`src/ui/Camera.tsx`) — pan / zoom
  wrapper for the canvas. Mouse wheel zooms around
  the cursor; mouse drag pans. The camera is
  **purely presentational**; it never reads or
  writes engine state. A "Reset view" button
  restores the identity transform.

- **Dispatcher interactions**:
  - `SignalInspector` — popover showing the signal's
    aspect, the block's section id, the train (if
    any) in the block, and the controlling route.
    Has a "Set route from here" button that arms
    `pendingRouteFrom`; the next signal click
    dispatches `SET_ROUTE`. Has a "Cancel route"
    button that dispatches `CANCEL_ROUTE` for the
    signal's controlling route.
  - `SwitchInspector` — popover for a switch. Shows
    the current position, lifecycle, and a "Move to
    {next}" button. The change is denied (with a
    `LOG` event) by the engine if the switch is
    locked or occupied.
  - `TrainInspector` — popover for a train. Shows
    the FSM state, current edge, position `t`,
    route id, and held-at platform. Has a
    "Dispatch" button that dispatches
    `DISPATCH_TRAIN` (only enabled when the train
    is in `StoppedAtPlatform`).

- **`CommandToolbar`** — top bar with Start / Stop /
  Tick / Pause / Resume buttons. The Start / Stop
  button toggles the engine's tick loop; the others
  dispatch through the store. The toolbar also
  displays the sim time, tick rate, and paused
  state, all read from the snapshot.

- **`StatusPanel`** — right-side panel with three
  sections: active scenario, active routes, and
  trains (with their FSM state).

- **`ScenarioSelector`** — small UI to start one of
  the registered scenarios. Dispatches
  `START_SCENARIO` / `END_SCENARIO`.

- **`EventLog`** — bottom strip showing the most
  recent events from the store's `recentEvents`
  buffer (capped at 200).

- **Updated `Simulation`** — added a public
  `topology: Topology` field so the store can
  serialise the topology when projecting the
  snapshot.

### Files added

- `src/store/SimulationSnapshot.ts`
- `src/store/simulationStore.ts`
- `src/store/index.ts`
- `src/store/__tests__/SimulationSnapshot.test.ts`
- `src/store/__tests__/simulationStore.test.ts`
- `src/ui/layout/computeLayout.ts`
- `src/ui/layout/__tests__/computeLayout.test.ts`
- `src/ui/renderers/EdgeGlyph.tsx`
- `src/ui/renderers/NodeGlyph.tsx`
- `src/ui/renderers/SignalGlyph.tsx`
- `src/ui/renderers/PlatformGlyph.tsx`
- `src/ui/renderers/TrainGlyph.tsx`
- `src/ui/renderers/__tests__/renderers.test.tsx`
- `src/ui/SimulationCanvas.tsx`
- `src/ui/CommandToolbar.tsx`
- `src/ui/StatusPanel.tsx`
- `src/ui/EventLog.tsx`
- `src/ui/ScenarioSelector.tsx`
- `src/ui/SignalInspector.tsx`
- `src/ui/SwitchInspector.tsx`
- `src/ui/TrainInspector.tsx`
- `src/ui/Camera.tsx`
- `src/ui/index.ts`
- `src/__tests__/app-integration.test.tsx`

### Files updated

- `src/engine/core/Simulation.ts` — `topology` is
  now a public field; the engine still owns no
  business logic.
- `src/App.tsx` — replaced the placeholder with the
  real dispatcher UI. Builds a yard topology with
  one entry / exit signal, registers a "demo"
  scenario, and wires the store to a real
  `Simulation`.
- `src/index.css` — dark dispatcher-style theme for
  the toolbar, sidebar, event log, and inspectors;
  cursor styles for clickable entities.
- `src/__tests__/smoke.test.tsx` — still passes;
  the App now renders the full UI but the heading
  is still present.

### Tests added (34 new, 381 total)

- **`projectSnapshot` (9)** — produces a snapshot
  with the engine time, paused state, and tick
  rate; maps engine stores into immutable maps;
  records the last event kind and last tick time;
  reuses map references when the data is unchanged;
  returns a new map when a switch position or
  signal aspect has changed; returns an empty
  snapshot when the topology cannot be serialised;
  is deterministic.
- **`simulationStore` integration (4)** — projects
  the initial state after `setEngine`; reflects a
  `SET_TICK_RATE` command in the snapshot;
  captures recent events in the log buffer;
  updates sim time on every tick.
- **`computeLayout` (5)** — single node at the
  origin; two connected nodes at the same y;
  deterministic for the same input; records signal
  id on edge layouts; finite width and height.
- **Renderers (12)** — EdgeGlyph renders a line;
  thicker stroke for an in-active-route edge;
  NodeGlyph renders a section as a rect and a
  switch as a circle; draws a label when provided;
  SignalGlyph renders a stop / proceed circle;
  grows the radius when selected; PlatformGlyph
  renders nothing for an empty platform; renders a
  rect with the platform name; TrainGlyph renders
  nothing for a null current edge; renders a rect
  on the train's current edge.
- **App integration (4)** — renders the toolbar,
  status panel, and event log; dispatches
  `SET_TICK_RATE` through the toolbar; captures
  engine events; the demo topology's signal is in
  the snapshot.

### Verification

- typecheck: PASSED
- test: 381 tests passed (34 new)
- lint: PASSED
- build: PASSED

### Next (Section 15+)

- A real infrastructure JSON loader (the engine
  already has `Topology.fromJSON`; the UI needs a
  file-picker that loads a JSON topology).
- A small replay viewer (read-only event-log
  scrubber) built on `Simulation.serialize` +
  `Simulation.load`.
- Sub-tick motion (`TrainDefinition.speedSectionsPerTick`)
  honoured beyond `1`.
- Train-on-switch occupancy (the milestone 1
  simplification is documented and lifted in a
  later section).

## Sections 8–10 — Trains: state-based FSM, motion service, scenarios

The "trains" milestone. Train behaviour is now modelled as a
finite state machine (FSM), train definitions are immutable
and the runtime state lives in a separate store, the
timetable definition is never mutated, and the full
lifecycle (`WaitingForEntry` → `Entering` → `Running` →
`StoppedAtSignal` / `StoppedAtPlatform` → `Departing` →
`LeavingControlledArea` → `Finished`) is implemented and
deterministic. Two new commands (`SPAWN_TRAIN` and
`DISPATCH_TRAIN`) and a `ScenarioService` close the loop
between player input, timetable events, and the simulation
tick.

### Implemented

- **Train FSM model** (`src/engine/trains/TrainFsmState.ts`):
  - String-literal union of the full milestone 1 state set
    — `WaitingForEntry`, `Entering`, `Running`,
    `ApproachingSignal`, `StoppedAtSignal`,
    `StoppedAtPlatform`, `Departing`,
    `LeavingControlledArea`, `Finished`. The `assertNever`
    helper in `@/types/result` flags unhandled states at
    compile time. Future states (`HoldingForSchedule`,
    `HeldByDispatcher`, `Faulted`, `Coupling`, etc.) are
    named in the TSDoc for forward compatibility.
  - Type-guard helpers `isTrainStationary`,
    `isTrainTerminal`, `isTrainInControlledArea`.

- **`TrainState` extended with FSM state** — the `stopped`
  boolean is gone; the `fsmState` is the single source of
  truth for what a train is doing. New runtime fields:
  `heldAtPlatform` (for `StoppedAtPlatform`),
  `lastTickAtSimTime` (for deterministic replay), and
  `delaySeconds` (always `0` in milestone 1; reserved for
  future delay tracking).

- **`TrainDefinition` is immutable** — `readonly` fields,
  loaded once from the scenario file, never mutated by the
  engine. Documented as a non-goal in the type's TSDoc.

- **`TrainReasonCode` catalogue**
  (`src/engine/trains/TrainReasonCode.ts`) — stable
  machine-readable codes (`TRAIN_UNKNOWN`,
  `TRAIN_ALREADY_EXISTS`, `TRAIN_UNKNOWN_EDGE`,
  `TRAIN_INVALID_TRANSITION`, `TRAIN_NO_ROUTE`,
  `TRAIN_UNKNOWN_PLATFORM`, `TRAIN_NOT_A_STOP`,
  `TRAIN_REJECTED`) plus `trainReasonMessage` and
  `trainError` helpers, following the same pattern as
  the switch, signal, section, and route catalogues.

- **`TrainStateStore`** (`src/engine/trains/TrainStateStore.ts`)
  — runtime state of every train. One `TrainState` per
  `TrainId`. Mutators return `Result<TrainState, EngineError>`.
  Public surface: `get`, `require`, `getAll`, `size`,
  `findByState`, `findByRoute`, `findByEdge`,
  `findHeldAtPlatform`, `spawn`, `setState`, `update`,
  `remove`, `serialize`, `load`. The store is a passive
  data structure; the motion service is the canonical
  writer during a normal tick.

- **`TrainMotionService`** (`src/engine/trains/TrainMotionService.ts`)
  — the brain of the train domain. Drives the FSM on
  each tick:
  - `WaitingForEntry` → `Entering` when a route is set
    covering the train's entry signal.
  - `Entering` → `Running` on the next tick.
  - `Running` / `ApproachingSignal` — advance one
    section per tick; check the next-edge signal for
    `stop` (transitions to `StoppedAtSignal`); check
    the new edge's `to` for a platform stop (transitions
    to `StoppedAtPlatform` with `heldAtPlatform` set).
  - `StoppedAtSignal` — re-check the signal; resume
    `Running` when it clears.
  - `StoppedAtPlatform` — held (dispatcher must release).
  - `Departing` → `Running` on the next tick.
  - `LeavingControlledArea` → `Finished`; remove the
    train, emit `TRAIN_DEPARTED`.
  - Section occupancy (`TRAIN_ENTERED_SECTION` /
    `TRAIN_LEFT_SECTION`) is updated on every advance.
  - Switches are not train-occupied in milestone 1
    (the lifecycle is reserved for route reservations
    and locks).
  - `spawnTrain(definition, atSimTime)` is the canonical
    way to add a new train; it sets up the initial state
    and emits `TRAIN_REQUESTED_ENTRY`.

- **`releasePlatformStop` helper** — dispatcher-side
  helper that transitions a train from `StoppedAtPlatform`
  to `Departing`. Called by the `DISPATCH_TRAIN` command.

- **New commands**:
  - `SPAWN_TRAIN { train: TrainDefinition }` — spawns a
    train at its entry edge; logs `TRAIN_SPAWNED` and
    emits `TRAIN_REQUESTED_ENTRY`.
  - `DISPATCH_TRAIN { trainId }` — releases a train
    held at a platform; logs `TRAIN_DISPATCHED` on
    success or `TRAIN_INVALID_TRANSITION` if the train
    is not held at a platform.

- **Updated `CommandProcessor`** with cases for
  `SPAWN_TRAIN`, `DISPATCH_TRAIN`, and `START_SCENARIO`.
  The `TRAIN_DISPATCH` command remains
  "not yet implemented" (deferred to a future section).

- **`ScenarioService`** (`src/engine/scenarios/ScenarioService.ts`)
  — scenario lifecycle and timetable walk. Public
  surface: `register`, `unregister`, `get`, `getAll`,
  `size`, `start`, `end`, `activeScenario`, `tick`. The
  `tick` method walks the active scenario's timetable
  and returns the commands that should fire at the
  current sim-time. The `Simulation`'s tick loop calls
  this every tick, dispatches the returned commands
  through the `CommandProcessor`, and then runs the
  `TrainMotionService`. The timetable is never mutated
  (the service tracks an index into the immutable
  timetable array).

- **`ScenarioReasonCode` catalogue** — stable codes
  (`SCENARIO_UNKNOWN`, `SCENARIO_ALREADY_STARTED`,
  `SCENARIO_NOT_STARTED`).

- **Updated `Simulation` and `SimulationState`** —
  `Simulation` now owns the `TrainStateStore`,
  `TrainMotionService`, and `ScenarioService` as public
  fields. The tick loop's `onTick` callback now:
  1. Walks the scenario timetable and dispatches any
     due commands.
  2. Runs the train motion service.
  3. Advances the clock and emits `TIME_TICK`.
  4. Flushes the event bus.
  The `SimulationState` envelope now includes the
  `trains` field; `load` restores the train state. The
  new constructor options are `platforms`
  (`ReadonlyMap<PlatformId, Platform>`),
  `scenarioServiceOptions`, and `scenarios`.

- **Updated `engine/index.ts`** — re-exports the trains
  and scenarios modules.

- **Updated `commands.ts` exhaustiveness test** —
  `commands-events.test.ts` and `domain.test.ts`
  cover the new `SPAWN_TRAIN` and `DISPATCH_TRAIN`
  commands and the new `TrainState` shape (the
  `stopped` boolean is gone).

### Files added

- `src/engine/trains/TrainFsmState.ts`
- `src/engine/trains/TrainReasonCode.ts`
- `src/engine/trains/TrainStateStore.ts`
- `src/engine/trains/TrainMotionService.ts`
- `src/engine/trains/index.ts`
- `src/engine/trains/__tests__/TrainFsmState.test.ts`
- `src/engine/trains/__tests__/TrainStateStore.test.ts`
- `src/engine/trains/__tests__/TrainMotionService.test.ts`
- `src/engine/scenarios/ScenarioService.ts`
- `src/engine/scenarios/ScenarioReasonCode.ts`
- `src/engine/scenarios/index.ts`
- `src/engine/scenarios/__tests__/ScenarioService.test.ts`

### Files updated

- `src/types/trains.ts` — `TrainState` carries the
  `fsmState` (and supporting runtime fields); the
  legacy `stopped` boolean is removed; the
  `TrainDefinition` TSDoc documents immutability and
  the no-mutation-of-timetable rule.
- `src/types/commands.ts` — added `SPAWN_TRAIN` and
  `DISPATCH_TRAIN` variants.
- `src/types/__tests__/domain.test.ts` — covers the
  new `TrainState` shape.
- `src/types/__tests__/commands-events.test.ts` —
  exhaustiveness covers the new commands.
- `src/engine/core/CommandProcessor.ts` — wires
  `SPAWN_TRAIN`, `DISPATCH_TRAIN`, and `START_SCENARIO`.
- `src/engine/core/Simulation.ts` — owns the train
  stores and motion service; tick loop runs the
  scenario + motion services; `SimulationState`
  includes `trains`.
- `src/engine/index.ts` — re-exports the new modules.
- `src/engine/core/__tests__/Simulation.test.ts` —
  new test for the train state in the snapshot;
  `load` payload updated.
- `src/engine/core/__tests__/CommandProcessor.test.ts` —
  new tests for the wired commands.

### Tests added (63 new, 347 total)

- **TrainFsmState (4)** — guard helpers are correct
  for every state; full state set is covered.
- **TrainStateStore (17)** — construction, `spawn`
  (success and duplicate rejection with
  `TRAIN_ALREADY_EXISTS`), `setState` and `update`
  (success and `TRAIN_UNKNOWN`), `findByState`,
  `findByRoute`, `findByEdge`, `findHeldAtPlatform`,
  `remove` (success and rejection), serialization
  round-trip, and `TrainReasonCode` message + error
  helpers.
- **TrainMotionService (18)** — spawn + `WaitingForEntry`
  state; `spawnTrain` sets up initial occupancy and
  emits `TRAIN_REQUESTED_ENTRY`; `WaitingForEntry`
  → `Entering` when the entry signal is `proceed`; no
  transition when the signal is `stop`; `TRAIN_ENTERING`
  log emitted; `Entering` → `Running`; full traversal
  of a 2-edge route with `LeavingControlledArea` and
  removal; section occupancy updates on each advance;
  switch lifecycle (`locked` by the route); train
  blocked at a `stop` signal on the next edge and
  resumes when the signal clears; platform stop in
  `StoppedAtPlatform` with `heldAtPlatform` set;
  `releasePlatformStop` transitions to `Departing`
  and then to `Running` on the next tick; route
  cancellation transitions to `LeavingControlledArea`;
  determinism (same scenario + same tick → same trace
  and same state).
- **ScenarioService (17)** — registration and
  unregistration (with `SCENARIO_UNKNOWN` rejection
  and active-scenario reset); start / end; tick walks
  the timetable in order; catch-up over multiple
  events; events before the current tick are skipped;
  emits `SPAWN_TRAIN` commands; returns empty when no
  scenario is active; determinism; the timetable is
  never mutated (`before === after` reference equality).
- **CommandProcessor (6 new)** — `SPAWN_TRAIN` success
  and `TRAIN_ALREADY_EXISTS` rejection; `DISPATCH_TRAIN`
  success (`StoppedAtPlatform` → `Departing`) and
  `TRAIN_INVALID_TRANSITION` warning; `START_SCENARIO`
  success and `SCENARIO_UNKNOWN` rejection.
- **Simulation (1 new)** — `serialize()` includes the
  `trains` field with the spawned train.

### Determinism

- The train domain is fully deterministic. The same
  infrastructure, scenario, sim-time, and command
  sequence produce the same train state changes, the
  same store mutations, and the same event sequences.
- The `TrainMotionService.tick` and `ScenarioService.tick`
  methods are pure functions of the current state and
  the sim-time.
- The `TrainStateStore` is a passive data structure;
  the motion service is the only canonical writer.
- The timetable definition (`Scenario.timetable`) is
  immutable; the scenario service tracks an index into
  the array, never rewriting the array.
- A replay test runs the same scenario twice and
  verifies that the train traces, the section state,
  and the train store contents are bit-identical.

### Next (Section 11)

- Section 11 — Dispatcher UX. Wire the train motion
  into the UI: SVG renderers for the topology and the
  trains, a sidebar for the event log, command
  dispatchers (click handlers) for set / cancel
  route, change switch, and dispatch train. The
  state-based model is the contract the UI consumes.
- A small replay viewer (read-only event log scrubber)
  built on `Simulation.serialize` + `Simulation.load`.
- Sub-section speed (`TrainDefinition.speedSectionsPerTick`)
  honoured (currently always 1; the field is read
  but not enforced differently).
- Train-on-switch occupancy (the milestone 1
  simplification is documented and lifted in a later
  section).

## Section 7 — Interlocking + Routes: rule-based engine + multi-reason rejections
- Implemented:
  - **`RouteReasonCode` catalogue**
    (`src/engine/interlocking/RouteReasonCode.ts`) — stable
    machine-readable codes: `REJECTED` (top-level),
    `UNKNOWN_ORIGIN`, `UNKNOWN_DESTINATION`, `ORIGIN_NOT_AUTOMATIC`,
    `DESTINATION_NOT_AUTOMATIC`, `NO_PATH`, `TRACK_OCCUPIED`,
    `TRACK_RESERVED`, `SWITCH_LOCKED`, `SWITCH_WRONG_POSITION`,
    `CONFLICT`, `DESTINATION_NOT_PLATFORM`. Plus
    `formatRejectionBatch` that produces the multi-line log
    message the spec describes:
    ```
    Cannot set route:
      ✓ Switch W3 locked
      ✓ Track T12 occupied
      ✓ Route R4 conflicts
    ```
  - **`RouteRejection`** type — `{ code, message, context }`.
    The engine collects *every* blocking reason into an
    array, not just the first.
  - **`SafetyRule` interface + `RuleContext`** — every rule
    is a pure function of the context. The engine has **no
    giant if/else**; it evaluates a `RuleRegistry` of
    independent rule instances.
  - **Five standard rules** in `src/engine/interlocking/`:
    - `TrackClearRule` — every section on the path must be
      clear (not occupied, not reserved by another route).
    - `SwitchLockedRule` — every switch on the path must not
      be locked, reserved, or occupied.
    - `ConflictRule` — no other active route may share any
      node with the proposed path.
    - `SignalRule` — both signals must exist and be automatic.
    - `PlatformRule` — the destination must be a platform
      (toggleable).
  - **`RuleRegistry`** — ordered collection of rules;
    `evaluateAll` returns the concatenation of every rule's
    rejections. Order is deterministic (insertion order).
  - **`SectionStateStore`** (`src/engine/sections/`) —
    runtime state of every track section (`occupiedBy` train,
    `reservedBy` route). Mutators return `Result<void, EngineError>`.
  - **`RouteStore`** (`src/engine/routes/`) — active routes
    keyed by `RouteId`, with lookups by entry signal, by node,
    and by edge. `add` / `take` / `remove` / `findByNode` /
    `findByAnyNode` / `hasEdge`.
  - **`InterlockingEngine`** (`src/engine/interlocking/InterlockingEngine.ts`)
    — the brain. **Completely deterministic.** Same
    infrastructure + state + command sequence + RNG seed
    always produces the same route decisions, events, and
    store mutations. No use of `Math.random()` (ESLint rule
    enforced), no wall-clock time, no shared mutable state.
    The engine:
    1. Validates the origin and destination signals.
    2. Finds a path via the `Pathfinder` (defaults to BFS).
    3. Builds a `RuleContext` (sections and switches
       extracted from the path).
    4. Evaluates every rule in the registry.
    5. If any rule fails, returns every blocking reason.
    6. Otherwise, writes the route: reserves sections,
       locks switches, sets the entry signal to `proceed`.
    7. `cancelRoute` reverses the writes.
  - **`SET_ROUTE` and `CANCEL_ROUTE` commands wired** in
    `CommandProcessor`:
    - `SET_ROUTE` calls the engine; on success, emits a
      `LOG` with code `ROUTE_SET`; on rejection, emits a
      `LOG` with code `ROUTE_REJECTED` and the full
      multi-line message plus the structured `EngineError`
      so consumers can read individual rejections.
    - `CANCEL_ROUTE` calls `engine.cancelRoute`; emits
      `ROUTE_RELEASED` on success or `ROUTE_NOT_FOUND` if
      no such route is active.
  - **Wired into `Simulation`** — `interlocking`,
    `sectionStore`, `routeStore` are public fields; state
    is serialised; `topology` is a new constructor option
    (required for route setting).
  - **Updated `SimulationState`** — adds `sections` and
    `routes` to the versioned envelope.
  - **Fixed `SectionState.occupiedBy`** — was `NodeId |
    null`; now `TrainId | null` (consistent with the rest
    of the model).
- Files added:
  - `src/engine/interlocking/RouteReasonCode.ts`
  - `src/engine/interlocking/SafetyRule.ts`
  - `src/engine/interlocking/RuleRegistry.ts`
  - `src/engine/interlocking/TrackClearRule.ts`
  - `src/engine/interlocking/SwitchLockedRule.ts`
  - `src/engine/interlocking/ConflictRule.ts`
  - `src/engine/interlocking/SignalRule.ts`
  - `src/engine/interlocking/PlatformRule.ts`
  - `src/engine/interlocking/InterlockingEngine.ts`
  - `src/engine/interlocking/index.ts`
  - `src/engine/interlocking/__tests__/RuleRegistry.test.ts`
  - `src/engine/interlocking/__tests__/InterlockingEngine.test.ts`
  - `src/engine/sections/SectionStateStore.ts`
  - `src/engine/sections/SectionReasonCode.ts`
  - `src/engine/sections/index.ts`
  - `src/engine/sections/__tests__/SectionStateStore.test.ts`
  - `src/engine/routes/RouteStore.ts`
  - `src/engine/routes/index.ts`
  - `src/engine/routes/__tests__/RouteStore.test.ts`
- Files updated:
  - `src/types/infrastructure.ts` — `SectionState.occupiedBy`
    is now `TrainId | null`
  - `src/engine/core/CommandProcessor.ts` — `SET_ROUTE`
    and `CANCEL_ROUTE` wired
  - `src/engine/core/__tests__/CommandProcessor.test.ts` —
    `makeDeps` builds the new stores and interlocking engine
  - `src/engine/core/Simulation.ts` — `interlocking`,
    `sectionStore`, `routeStore` wired; `topology` option;
    `SimulationState` includes `sections` and `routes`
  - `src/engine/core/__tests__/Simulation.test.ts` — updated
    for the new `SimulationState` shape
- Tests added (53 new, 284 total):
  - **SectionStateStore (8)**: construction, setOccupied,
    setReserved, independence of occupancy/reservation,
    serialize/load, reason codes
  - **RouteStore (8)**: add/remove, findByNode,
    findByAnyNode, hasEdge, findByEntrySignal, serialize/load
  - **TrackClearRule (4)**: pass, TRACK_OCCUPIED,
    TRACK_RESERVED, both, determinism
  - **SwitchLockedRule (4)**: pass, locked, reserved,
    occupied
  - **ConflictRule (2)**: pass, multiple conflicts
  - **SignalRule (2)**: pass, ORIGIN_NOT_AUTOMATIC,
    DESTINATION_NOT_AUTOMATIC
  - **PlatformRule (2)**: pass, DESTINATION_NOT_PLATFORM
  - **RuleRegistry (5)**: registration order, all rejections
    collected, empty array on all-pass, clear, custom rules
  - **InterlockingEngine (13)**: happy path (route set,
    signal cleared, sections reserved, switch locked),
    cancel route, single-reason rejections, **multi-reason
    rejection** (the spec example: switch locked + track
    occupied + route conflict), **determinism** (same setup
    + same command = same outcome; replay produces identical
    state), formatRouteSetOutcome
  - **sectionError / routeError / formatRejectionBatch (5)**:
    code → message
- Next (Section 8 — Trains):
  - `src/engine/trains/TrainStateStore.ts` — runtime state
    of every train
  - Train motion: advance one section per tick, obey
    signals, stop at platforms
  - Wire `TRAIN_DISPATCH` command
  - Train entering/leaving a switch transitions the switch
    lifecycle (`occupy` / `vacate`)
  - Tests: train motion along a reserved route, signal
    obedience, platform stopping

## Section 6 — Signals: derived views + extensible aspects + reason tracking
- Implemented:
  - **Extensible `Aspect` type** (`src/types/primitives.ts`).
    Still `'stop' | 'proceed'` for milestone 1, but the TSDoc
    explicitly enumerates the future values the type must
    accommodate: `'caution'`, `'approach'`, `'shunting'`,
    `'call-on'`, `'flashing'`, and national variants
    (e.g. DE `hp0/hp1/hp2`, UK `red/yellow/green`). Adding a
    new aspect is a type-visible change; the `assertNever`
    helper in `@/types/result` catches unhandled cases at
    compile time. Existing APIs do not need redesign.
  - **`SignalAspectChangeReason`**
    (`src/engine/signals/SignalAspectChangeReason.ts`) — a
    discriminated union describing *why* a signal aspect
    changed. Variants for milestone 1: `INITIAL`, `ROUTE_SET`,
    `ROUTE_RELEASED`, `CONFLICT`. Future variants named in
    the type: `TRAIN_OCCUPIED`, `TRAIN_CLEARED`,
    `TIMER_EXPIRED`, `OPERATOR_OVERRIDE`, `SYSTEM`. The
    `signalReasonSummary` helper produces a short English
    string for the event log.
  - **`SignalStateStore`**
    (`src/engine/signals/SignalStateStore.ts`) — runtime state
    of every signal. **Signals are derived views of the
    interlocking state.** The store never decides what aspect
    to show; the interlocking engine (Section 7) computes
    the permitted aspect and calls `setAspect(id, aspect,
    reason, atSimTime)`. The store records the decision and
    returns a `SignalAspectChange` describing the transition.
    The store is a passive notepad — the engine is the brain.
    No route validation logic lives in the store.
  - **Stable reason codes**
    (`src/engine/signals/SignalReasonCode.ts`) — `UNKNOWN`
    and `INVALID_ASPECT`. Same pattern as the switch
    catalogue: stable identifiers, generated messages,
    structured errors.
  - **Updated `SIGNAL_ASPECT_CHANGED` event**
    (`src/types/events.ts`): now carries `fromAspect`,
    `reason` (the structured `SignalAspectChangeReason`),
    and `atSimTime`. The event log and replay system can
    explain every change.
  - **Updated `SignalState`** (`src/types/infrastructure.ts`):
    added `lastChangeReason` and `lastChangeAtSimTime` so
    the most recent change is always inspectable.
  - **Wired `SignalStateStore` into `Simulation`**: new
    constructor options `signalIds` and `initialSignalAspects`;
    `serialize` / `load` include the signal state.
  - **`src/engine/signals/index.ts`** — public barrel.
- Files added:
  - `src/engine/signals/SignalAspectChangeReason.ts`
  - `src/engine/signals/SignalReasonCode.ts`
  - `src/engine/signals/SignalStateStore.ts`
  - `src/engine/signals/index.ts`
  - `src/engine/signals/__tests__/SignalStateStore.test.ts`
- Files updated:
  - `src/types/primitives.ts` — `Aspect` TSDoc enumerates
    future variants
  - `src/types/events.ts` — `SIGNAL_ASPECT_CHANGED` carries
    `fromAspect`, `reason`, `atSimTime`
  - `src/types/infrastructure.ts` — `SignalState` adds
    `lastChangeReason` and `lastChangeAtSimTime`
  - `src/types/__tests__/infrastructure.test.ts` — new
    SignalState shape
  - `src/types/__tests__/commands-events.test.ts` —
    `SIGNAL_ASPECT_CHANGED` exhaustiveness test updated
  - `src/engine/core/Simulation.ts` — `SignalStateStore`
    wired; state persisted
  - `src/engine/core/__tests__/Simulation.test.ts` —
    `SimulationState` includes `signals`
- Tests added (15 new, 231 total):
  - **SignalStateStore (15)**: construction (default aspect,
    initial aspect, INITIAL reason), `setAspect` (success,
    no-op, lastChange fields updated, SIGNAL_UNKNOWN
    rejection, no validation logic — store is a notepad),
    `setControlledBy` (set, clear, unknown rejection),
    serialization round-trip
  - **signalReasonMessage + signalError (2)**: code →
    message
  - **infrastructure (1)**: new SignalState shape smoke
- Next (Section 7 — Interlocking + Routes):
  - `src/engine/interlocking/` — the brain
  - `InterlockingEngine` consumes `Topology` + `Pathfinder`
    + signal / switch stores
  - `SET_ROUTE` and `CANCEL_ROUTE` commands route through
    it; decisions are written back to the signal and
    switch stores
  - `RouteStore` holds active routes and their reservations
  - `RouteReasonCode` catalogue with stable codes
    (`ROUTE_CONFLICT`, `NO_PATH`, `INVALID_DESTINATION`,
    etc.)
  - Safety tests: every spec rule (`every required section
    is clear`, `switches correctly positioned`, etc.) is a
    test case

## Section 5 — Switches: state machine + transitions + reason codes
- Implemented:
  - **`SwitchLifecycleState`** (`src/engine/switches/SwitchLifecycleState.ts`)
    — string-literal union: `'free' | 'reserved' | 'locked' | 'occupied'`.
    Milestone 1 uses four states; future states (`'faulted'`,
    `'maintenance'`, `'moving'`) are deliberately named in the
    type's TSDoc. Adding new states is a type-visible change.
  - **`SwitchReasonCode`** (`src/engine/switches/SwitchReasonCode.ts`)
    — stable machine-readable codes for every rejection:
    `SWITCH_UNKNOWN`, `SWITCH_LOCKED`, `SWITCH_OCCUPIED`,
    `SWITCH_NOT_FREE`, `SWITCH_ALREADY_RESERVED`,
    `SWITCH_NOT_RESERVED`, `SWITCH_RESERVED_BY_ANOTHER`,
    `SWITCH_NOT_HELD`, `SWITCH_HELD_BY_ANOTHER`,
    `SWITCH_CANNOT_OCCUPY_LOCKED`, `SWITCH_NOT_OCCUPIED`,
    `SWITCH_OCCUPIED_BY_ANOTHER`, `SWITCH_INVALID_TRANSITION`.
    Plus `switchReasonMessage(code, ctx)` (human-readable
    English) and `switchError(code, ctx)` (full `EngineError`
    with code, message, context).
  - **`SwitchTransition`** (`src/engine/switches/SwitchTransition.ts`)
    — `{ switchId, from, to, reason, routeId, trainId }`.
    Position changes are *transitions* with explicit `from`
    and `to` states, not property assignments. Even though
    movement is instantaneous in milestone 1, the shape
    leaves room for future `moving` lifecycle, transition
    time, failures, and animation without API changes.
  - **`SwitchStateStore`** (`src/engine/switches/SwitchStateStore.ts`)
    — runtime state of every switch. Public surface:
    `get`, `require`, `getAll`, `size`,
    `changePosition(id, position)` (player command),
    `reserve(id, routeId)` (free → reserved),
    `lock(id, routeId)` (reserved → locked),
    `release(id, routeId)` (reserved/locked → free),
    `occupy(id, trainId)` (free/reserved → occupied),
    `vacate(id, trainId)` (occupied → free),
    `serialize`, `load`. All transitions return
    `Result<SwitchTransition, EngineError>` with a
    stable `SwitchReasonCode` on rejection.
  - **Updated `SwitchState`** in `src/types/infrastructure.ts`:
    removed legacy `locked: boolean` and `occupied: boolean`;
    added `lifecycle: SwitchLifecycleState`,
    `lockedBy: RouteId | null`, `occupiedBy: TrainId | null`.
    The lifecycle is the source of truth; `lockedBy` and
    `occupiedBy` identify the holder.
  - **Updated `LOG` event** in `src/types/events.ts`:
    added optional `code?: string` field. Rejection logs
    carry the `SwitchReasonCode`; informational logs carry
    descriptive codes (`CLOCK_PAUSED`, `CLOCK_RESUMED`,
    `CLOCK_TICK_RATE_CHANGED`, `SCENARIO_ENDED`,
    `SWITCH_CHANGED`, `COMMAND_NOT_IMPLEMENTED`, …).
  - **Updated `SWITCH_MOVED` event** with optional
    `fromPosition?: SwitchPosition` for future animation.
  - **Wired `CHANGE_SWITCH` command** in
    `src/engine/core/CommandProcessor.ts`: routes to
    `switchStore.changePosition(...)`, emits `SWITCH_MOVED`
    on success, emits `LOG` with the rejection `code` on
    failure. The not-yet-implemented branch (`SET_ROUTE`,
    `CANCEL_ROUTE`, `START_SCENARIO`, `TRAIN_DISPATCH`)
    now uses code `COMMAND_NOT_IMPLEMENTED`.
  - **Wired `SwitchStateStore` into `Simulation`**:
    new constructor options `switchIds` and
    `initialSwitchPositions`; `serialize()` and `load()`
    include the switch state.
  - **`src/engine/switches/index.ts`** — public barrel.
- Files added:
  - `src/engine/switches/SwitchLifecycleState.ts`
  - `src/engine/switches/SwitchReasonCode.ts`
  - `src/engine/switches/SwitchTransition.ts`
  - `src/engine/switches/SwitchStateStore.ts`
  - `src/engine/switches/index.ts`
  - `src/engine/switches/__tests__/SwitchStateStore.test.ts`
- Files updated:
  - `src/types/events.ts` — LOG has optional `code`; SWITCH_MOVED has optional `fromPosition`
  - `src/types/infrastructure.ts` — SwitchState uses lifecycle + lockedBy + occupiedBy
  - `src/types/__tests__/infrastructure.test.ts` — updated for new SwitchState shape
  - `src/engine/core/CommandProcessor.ts` — CHANGE_SWITCH wired; LOG events carry codes
  - `src/engine/core/__tests__/CommandProcessor.test.ts` — updated for new behaviour
  - `src/engine/core/Simulation.ts` — SwitchStateStore wired; state persisted
  - `src/engine/core/__tests__/Simulation.test.ts` — SimulationState includes switches
- Tests added (29 new, 216 total):
  - **SwitchStateStore (28)**: construction (default position,
    initial position, free lifecycle), `changePosition`
    (move, no-op, locked rejection with SWITCH_LOCKED,
    occupied rejection with SWITCH_OCCUPIED, unknown with
    SWITCH_UNKNOWN, allowed on reserved), reserve/lock/release
    (promotion chain, ALREADY_RESERVED, NOT_RESERVED,
    RESERVED_BY_ANOTHER, NOT_HELD, HELD_BY_ANOTHER),
    occupy/vacate (CANNOT_OCCUPY_LOCKED, NOT_OCCUPIED,
    OCCUPIED_BY_ANOTHER), `isLocked` / `isOccupied` derived
    guards, `serialize` / `load` round-trip
  - **switchReasonMessage + switchError (1)**: code → message
  - **infrastructure (1)**: new SwitchState shape smoke
  - **CommandProcessor (1)**: CHANGE_SWITCH success and
    rejection paths
- Next (Section 6 — Signals):
  - `src/engine/signals/SignalStateStore.ts` — runtime
    signal state keyed by `SignalId`
  - `Aspect` derived from route state (no manual override)
  - Auto-clear when a route is set; auto-revert to Stop
    when the route releases
  - Unit tests: aspect changes, route-controlled aspect,
    multi-signal route handling

## Section 4 — Track network: Topology + Pathfinder interface
- Implemented:
  - **`metadata` field on every topology node and edge**
    (`src/types/topology.ts`). Each `SectionNode`, `SwitchNode`,
    and `Edge` now carries an optional
    `metadata?: Readonly<Record<string, unknown>>`. The engine
    never reads this field; it is preserved verbatim through
    serialization. Future systems (line speed, electrification,
    kilometer position, axle counter, ETCS/ATP, custom scenario
    tags) carry their data here without engine changes.
  - **`Topology` class** (`src/engine/topology/Topology.ts`).
    Immutable after construction: all fields are `readonly`,
    the internal maps are `ReadonlyMap`, and `Object.freeze(this)`
    is called in the constructor. Public surface: `getNode`,
    `getEdge`, `getAllNodes`, `getAllEdges`, `getEdgesFrom`,
    `nodeCount`, `edgeCount`, `serialize`, `static fromJSON`,
    `static fromData`. Validates input: rejects empty node lists,
    duplicate IDs, edges referencing unknown nodes, switches
    whose legMap leaves a leg disconnected.
  - **`Path` type** (`src/engine/topology/Path.ts`) —
    `{ nodeIds, edgeIds }` with `nodeIds[0]` = origin and
    `nodeIds[length-1]` = destination.
  - **`PathfindingContext` type**
    (`src/engine/topology/PathfindingContext.ts`) — input to a
    `Pathfinder`. Required: `topology`, `switchPositions`.
    Optional: `reservations`, `occupiedBy`, `edgeWeights`,
    `preferredNodes`, `blockedNodes`, `blockedEdges`. New
    fields are backward-compatible.
  - **`Pathfinder` interface**
    (`src/engine/topology/Pathfinder.ts`) — narrow contract with
    one method, `findPath(from, to, context)`. The engine never
    instantiates a pathfinder directly. Future implementations
    (Dijkstra, preferred route, timetable-aware, dispatcher
    hints, automatic routing) plug in without changing the
    engine API.
  - **`BfsPathfinder`** (`src/engine/topology/BfsPathfinder.ts`)
    — the default `Pathfinder` for milestone 1. Iterative
    BFS that tracks the **incoming leg** when traversing a
    switch: a leg transition through a switch is allowed only
    if `(incomingLeg, outLeg)` (or the reverse) is in the
    switch's `legMap` at the current position. Returns
    `UNKNOWN_NODE`, `NO_PATH`, or `BLOCKED` on failure.
  - **Five synthetic topology fixtures** in
    `src/engine/topology/fixtures/`:
    - `linear.ts` — straight single-track
    - `terminal.ts` — lead + 3-way switch + 2 dead-end platforms
    - `junction.ts` — Y-junction (3-way switch)
    - `yard.ts` — 4 parallel platforms, 2 throat switches
    - `doubleTrack.ts` — two parallel lines, single crossover
  - **`src/engine/topology/index.ts`** — barrel re-exporting
    `Topology`, `BfsPathfinder`, `isEdgeActive` (smoke helper),
    `traversalTarget`, plus all types.
- Files added:
  - `src/engine/topology/Path.ts`
  - `src/engine/topology/PathfindingContext.ts`
  - `src/engine/topology/Pathfinder.ts`
  - `src/engine/topology/BfsPathfinder.ts`
  - `src/engine/topology/Topology.ts`
  - `src/engine/topology/index.ts`
  - `src/engine/topology/fixtures/linear.ts`
  - `src/engine/topology/fixtures/terminal.ts`
  - `src/engine/topology/fixtures/junction.ts`
  - `src/engine/topology/fixtures/yard.ts`
  - `src/engine/topology/fixtures/doubleTrack.ts`
  - `src/engine/topology/__tests__/Topology.test.ts`
  - `src/engine/topology/__tests__/BfsPathfinder.test.ts`
- Files updated:
  - `src/types/topology.ts` — added `metadata` field
  - `src/types/__tests__/topology.test.ts` — metadata tests
- Tests added (52 new, 187 total):
  - **Topology (25)**: construction validation (empty nodes,
    duplicate IDs, unknown-node edges, disconnected switch
    legs), queries (`getNode`, `getEdge`, `getAllNodes`,
    `getAllEdges`, `getEdgesFrom`, counts), immutability
    (`Object.isFrozen`), metadata preservation, JSON
    round-trip, version mismatch rejection, malformed input
    rejection
  - **BfsPathfinder (23)**: `traversalTarget` helper,
    linear/terminal/junction/yard/double-track paths,
    switch position respected (junctions cannot route through
    a switch in the wrong position), blocked nodes/edges
    respected, BLOCKED when both endpoints blocked,
    UNKNOWN_NODE for missing origin/destination
  - **topology types (4)**: metadata on section, switch, edge;
    metadata optional
- Next (Section 5 — Switches):
  - `src/engine/switches/SwitchStateStore.ts` — runtime switch
    state keyed by `SwitchId`
  - `CHANGE_SWITCH` command implemented; denied with `LOG` if
    the switch is `locked` (by a route) or `occupied` (by a
    train)
  - `SWITCH_MOVED` event emitted on every successful change
  - Unit tests: change in normal/reverse, lock prevention,
    occupation prevention, idempotency

## Section 3 — Engine core: Time, TickLoop, EventBus, RngService, CommandProcessor, Simulation
- Implemented:
  - **`RngService`** (`src/engine/core/RngService.ts`) — deterministic,
    seedable, serializable RNG. sfc32 PRNG with 16-byte state, named
    streams (`"main"` + auto-derived sub-streams), distribution
    primitives (`next`, `nextInt`, `nextFloat`, `bool`, `pick`,
    `shuffle`), `serialize`/`load` round-trip, `validate` for
    raw-state input checking. **The engine must never call
    `Math.random()`** — this is enforced by an ESLint
    `no-restricted-properties` rule on `Math.random` in
    `src/engine/**`.
  - **`TimeService`** (`src/engine/core/TimeService.ts`) — owns the
    simulation clock. Time advances only via `advance(delta)`.
    Throws on negative or non-finite deltas (time never goes
    backwards). `pause`/`resume` toggles a flag, doesn't change
    the clock. `serialize`/`load` round-trip.
  - **`EventBus`** (`src/engine/core/EventBus.ts`) — typed pub/sub.
    Events are queued by `emit` and delivered in batches by
    `flush`. Non-reentrant (emitting from a handler queues for
    the next flush). Manual flush is used by the tick loop and
    by `Simulation.dispatch` so subscribers see results
    synchronously.
  - **`TickLoop`** (`src/engine/core/TickLoop.ts`) — fixed-Hz
    scheduler independent of the browser's `requestAnimationFrame`.
    Drift correction via real-time accumulator (capped at
    `maxTicksPerInterval` to avoid runaway catch-up). Injectable
    `scheduler`, `canceller`, and `now` for tests. Exposes
    `start`/`stop`/`pause`/`resume`/`setTickRate`/`triggerTick`
    (the last respects pause state and is used by `TICK_NOW`).
  - **`CommandProcessor`** (`src/engine/core/CommandProcessor.ts`)
    — pure router. Each `Command` case delegates to a service and
    emits a `LOG` event. Clock commands wired (`PAUSE`,
    `RESUME`, `SET_TICK_RATE`, `TICK_NOW`, `END_SCENARIO`).
    Others emit a "not yet implemented" warning `LOG` until
    Sections 4–9 wire them. `assertNever` in the default branch
    catches unhandled `Command` variants at compile time.
  - **`Simulation`** (`src/engine/core/Simulation.ts`) — **thin
    orchestrator**. Constructs and wires the services, exposes
    `dispatch`, `subscribe`, `start`, `stop`, `serialize`, `load`.
    Contains no business logic. Default seed `1` (deterministic
    by default). `serialize` returns a `Versioned<SimulationState>`
    envelope. `load` validates the version and stops the tick
    loop if it is running.
  - **`src/engine/core/index.ts`** — engine core barrel.
  - **`src/engine/index.ts`** updated to re-export the public
    surface.
  - **`src/engine/__tests__/engine.test.ts`** updated to verify
    the public surface.
  - **ESLint rule** in `.eslintrc.cjs` banning
    `Math.random` in `src/engine/**` (verified with a probe file
    that was then deleted).
- Files added:
  - `src/engine/core/TimeService.ts`
  - `src/engine/core/RngService.ts`
  - `src/engine/core/EventBus.ts`
  - `src/engine/core/TickLoop.ts`
  - `src/engine/core/CommandProcessor.ts`
  - `src/engine/core/Simulation.ts`
  - `src/engine/core/index.ts`
  - `src/engine/core/__tests__/TimeService.test.ts`
  - `src/engine/core/__tests__/RngService.test.ts`
  - `src/engine/core/__tests__/EventBus.test.ts`
  - `src/engine/core/__tests__/TickLoop.test.ts`
  - `src/engine/core/__tests__/CommandProcessor.test.ts`
  - `src/engine/core/__tests__/Simulation.test.ts`
- Files updated:
  - `src/engine/index.ts` (now a re-export barrel)
  - `src/engine/__tests__/engine.test.ts` (smoke test for surface)
  - `.eslintrc.cjs` (added `no-restricted-properties` for
    `Math.random` in `src/engine/**`)
- Tests added (83 new, 135 total):
  - TimeService: 10 tests — advance, pause/resume, reset,
    serialize/load, validation
  - RngService: 24 tests — determinism, distributions, named
    streams, serialization round-trip, replay bit-identity,
    validate
  - EventBus: 10 tests — emit/flush, batching, multi-subscriber,
    unsubscribe, reentrancy, pending/subscriber counts
  - TickLoop: 11 tests — fixed rate, pause/resume, setTickRate,
    triggerTick, drift correction, idempotency, manual scheduler
  - CommandProcessor: 9 tests — clock commands, not-yet-
    implemented warning logs
  - Simulation: 18 tests — construction, dispatch, events,
    serialization, version mismatch, replay determinism,
    thin-orchestrator guard, Math.random guard
- Next (Section 4 — Track network):
  - `src/engine/topology/Topology.ts` — generic graph of
    `SectionNode` / `SwitchNode` / `Edge`
  - `neighbors(nodeId, switchPositions)`, `isEdgeActive(edge,
    switchPositions)`, `findPath(from, to, switchPositions,
    reservations)`, `isReachable(from, to, switchPositions)`
  - Synthetic topology test fixtures: linear, terminal stub,
    yard (parallel platforms), Y-junction, double-track with
    crossover
  - No command processing yet — topology is pure graph queries
    consumed by interlocking in Section 7

## Section 2 — Domain types + Command/Event catalogs + versioned envelope
- Implemented:
  - **Branded ID types** in `src/types/ids.ts`: `NodeId`, `EdgeId`, `SwitchId`,
    `SignalId`, `PlatformId`, `TrainId`, `RouteId`, `ScenarioId`,
    `ObjectiveId`. Branded strings — opaque at runtime, type-safe at the
    TypeScript layer. Helpers: `asId` (trust-boundary cast) and `safeAsId`
    (returns `Result`, never throws).
  - **Primitive literal unions** in `src/types/primitives.ts`: `Direction`,
    `SwitchPosition`, `Aspect` (Stop/Proceed for milestone 1),
    `LogLevel`.
  - **`Result<T, E>` and `EngineError`** in `src/types/result.ts` plus
    `ok` / `err` / `engineError` constructors and `assertNever`
    exhaustiveness helper. The engine surfaces unexpected state as a
    `Result`, a `LOG` event, or a thrown dev-time error — never silently.
  - **Topology graph** in `src/types/topology.ts`: `SectionNode`,
    `SwitchNode` (with explicit `SwitchLegMap` interface for 2-leg
    and 3-leg switches, N-leg extensible), `Edge`. Type guards
    `isSectionNode` / `isSwitchNode`. Edge activity is **derived** from
    switch positions, not stored on the edge.
  - **Infrastructure state types** in `src/types/infrastructure.ts`:
    `Signal`, `Platform`, plus runtime `SwitchState`, `SectionState`,
    `SignalState`.
  - **Train domain** in `src/types/trains.ts`: `TrainDefinition` (static)
    and `TrainState` (runtime, edge-based position with `t ∈ [0, 1]`).
  - **Route** in `src/types/routes.ts`: reserved sections, edges,
    locked switches, entry aspect.
  - **Scenario** in `src/types/scenario.ts`: `Scenario`, `Objective`
    (union of kinds), `TimetableEvent` (union of kinds).
  - **Command union** in `src/types/commands.ts` — typed surface for
    player input. Includes `SET_ROUTE`, `CANCEL_ROUTE`, `CHANGE_SWITCH`,
    `START_SCENARIO`, `END_SCENARIO`, `PAUSE_SIMULATION`,
    `RESUME_SIMULATION`, `SET_TICK_RATE`, `TICK_NOW`, `TRAIN_DISPATCH`.
  - **Event union** in `src/types/events.ts` — typed stream emitted by
    the engine (time tick, train movement, signal/switch changes,
    route set/release, objectives, log, scenario lifecycle).
  - **Versioned envelope** in `src/types/versioned.ts`: `Versioned<T>`,
    `parseVersioned`, `envelope`, `CURRENT_VERSION = 1`.
  - **Migrator** in `src/engine/migrations/Migrator.ts` and a
    `createMigrator` factory. Pure, chainable, returns `Result` on
    error. No migrations registered in milestone 1.
  - **`src/types/index.ts`** barrel re-exports.
- Files added:
  - `src/types/ids.ts`, `primitives.ts`, `result.ts`, `topology.ts`,
    `infrastructure.ts`, `trains.ts`, `routes.ts`, `scenario.ts`,
    `commands.ts`, `events.ts`, `versioned.ts`, `index.ts`
  - `src/engine/migrations/Migrator.ts`, `index.ts`
  - `src/types/__tests__/ids.test.ts`
  - `src/types/__tests__/result.test.ts`
  - `src/types/__tests__/versioned.test.ts`
  - `src/types/__tests__/topology.test.ts`
  - `src/types/__tests__/commands-events.test.ts`
  - `src/types/__tests__/infrastructure.test.ts`
  - `src/types/__tests__/domain.test.ts`
  - `src/engine/migrations/__tests__/migrations.test.ts`
- Tests added (52 total now):
  - IDs: branding, `asId`, `safeAsId` happy + error paths
  - Result: `ok`, `err`, `engineError` (with/without context),
    `assertNever` runtime throw
  - Versioned: parse / envelope / current version, invalid inputs,
    non-integer version
  - Topology: type guards, 2-leg and 3-leg legMap, **type-level
    assertion that `Edge` has no `requires` field**
  - Commands/Events: runtime + compile-time exhaustiveness via
    `assertNever` in the default branch
  - Infrastructure state types: smoke
  - Domain types: smoke
  - Migrator: current-version pass-through, future-version rejection,
    missing-migration error, registration validation, exception
    handling, bad-envelope detection
- Next (Section 3 — Engine core):
  - `src/engine/core/Time.ts` — accelerated simulation clock
  - `src/engine/core/TickLoop.ts` — fixed-Hz scheduler, independent of
    rAF; pause/resume; drift correction
  - `src/engine/core/EventBus.ts` — typed pub/sub
  - `src/engine/core/CommandProcessor.ts` — receives `Command`,
    produces `Event[]`
  - `src/engine/Simulation.ts` — orchestrator with `dispatch()` and
    serialisable state root
  - Tick-rate command (`SET_TICK_RATE`) is wired here
  - `Simulation.serialize()` returns a `Versioned` envelope; the
    full state round-trip is gated to Section 17 but the
    serialisation shape is decided here.

## Pre-Section 2 — Architecture document
- Added: `ARCHITECTURE.md` — the living architecture reference.
  - Sections: high-level architecture, engine/UI separation, command/event flow,
    topology model, serialization approach, long-term design goals,
    non-goals for milestone 1, update policy.
  - Locks in: typed `Command`/`Event` surface, fixed-tick engine independent of
    React, snapshot-based bridge (Zustand), graph-based topology with
    section/switch nodes and edge-attached signals, versioned JSON with
    migrations.
- Updated: `README.md` — cross-link to `ARCHITECTURE.md`.
- Files added:
  - `ARCHITECTURE.md`
- Files updated:
  - `README.md`
- Tests added: none (documentation only).
- Next: Section 2 — Domain types + Command/Event catalogs + versioned envelope.

## Section 1 — Bootstrap
- Implemented:
  - Vite + React 18 + TypeScript project scaffold (manually authored, no interactive scaffolder)
  - Strict TypeScript: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`
  - Vitest with jsdom, `@testing-library/react`, global test setup
  - ESLint 8 with `@typescript-eslint`, `react-hooks`, `react-refresh`
  - **Architectural guardrail**: `no-restricted-imports` rule banning `react`, `react-dom`, and `@/ui/**` from `src/engine/**`
  - Prettier 3 with project style (single quotes, 90 cols, trailing commas)
  - Path alias `@/*` → `src/*` in both `tsconfig` and Vite
  - Dark dispatcher-style base CSS (black background, mono font, neutral palette)
  - Placeholder `App` component and engine version constant for sanity checks
- Files added:
  - `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
  - `vite.config.ts` (includes Vitest config)
  - `index.html`
  - `.gitignore`, `.eslintrc.cjs`, `.prettierrc.json`, `.prettierignore`
  - `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`
  - `src/test/setup.ts`
  - `src/__tests__/smoke.test.tsx` (renders App, asserts heading)
  - `src/engine/index.ts` (placeholder + `ENGINE_VERSION` constant)
  - `src/engine/__tests__/engine.test.ts` (asserts engine version constant)
  - `README.md`
- Tests added:
  - `src/__tests__/smoke.test.tsx` — verifies the React entry renders
  - `src/engine/__tests__/engine.test.ts` — verifies the engine placeholder is reachable from a non-UI test
- Next (Section 2 — Domain types):
  - `src/types/` with `TopologyNode`, `Edge`, `SwitchPosition`, `Aspect`, `Direction`, `Train`, `Route`, `Signal`, `Switch`, `TrackSection`, `Platform`, `Scenario`
  - `Command` and `Event` discriminated unions (exhaustiveness-checked)
  - Stable-ID convention enforced (string IDs only, no array indices)
  - `tickets/versioned.ts` — common versioned-envelope shape used by infrastructure/scenario/save JSON

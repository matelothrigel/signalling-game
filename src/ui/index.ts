/**
 * UI public surface.
 *
 * The UI module contains the React components that
 * render the simulation. All components are pure: they
 * read from the store via Zustand selectors and
 * dispatch commands through the store's `dispatch`
 * action. No component calls into the engine directly.
 */

export { SimulationCanvas } from './SimulationCanvas';
export type { Selection, SimulationCanvasProps } from './SimulationCanvas';
export { CommandToolbar } from './CommandToolbar';
export type { CommandToolbarProps } from './CommandToolbar';
export { StatusPanel } from './StatusPanel';
export { EventLog } from './EventLog';
export { ScenarioSelector } from './ScenarioSelector';
export type { ScenarioSelectorProps } from './ScenarioSelector';
export { SignalInspector } from './SignalInspector';
export { SwitchInspector } from './SwitchInspector';
export { TrainInspector } from './TrainInspector';
export { Camera } from './Camera';
export { MainMenu } from './MainMenu';
export type { MainMenuProps, MainMenuScenarioEntry } from './MainMenu';
export { computeLayout } from './layout/computeLayout';
export type { TopologyLayout, NodePosition, EdgeLayout } from './layout/computeLayout';
export { EdgeGlyph } from './renderers/EdgeGlyph';
export { NodeGlyph } from './renderers/NodeGlyph';
export type { NodeKind, NodeGlyphProps } from './renderers/NodeGlyph';
export { SignalGlyph } from './renderers/SignalGlyph';
export type { SignalGlyphProps } from './renderers/SignalGlyph';
export { PlatformGlyph } from './renderers/PlatformGlyph';
export type { PlatformGlyphProps } from './renderers/PlatformGlyph';
export { TrainGlyph } from './renderers/TrainGlyph';
export type { TrainGlyphProps } from './renderers/TrainGlyph';

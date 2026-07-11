import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { App } from '../App';
import { useSimulationStore } from '@/store';
import { asId, type SignalId, type ScenarioId } from '@/types/ids';

describe('App — integration (main menu)', () => {
  beforeEach(() => {
    // Reset the store between tests so the engine
    // subscription does not leak.
    useSimulationStore.getState().detach();
  });

  it('renders the main menu on first load', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /railway traffic control simulator/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /start scenario/i }),
    ).toBeInTheDocument();
  });

  it('shows a clickable scenario entry on the main menu', () => {
    render(<App />);
    // The tutorial scenario appears in the scenario list.
    // The help text also mentions "tutorial" so we look
    // for a more specific match.
    expect(screen.getByText(/4 trains · 8 objectives/)).toBeInTheDocument();
  });
});

describe('App — integration (play view)', () => {
  beforeEach(() => {
    useSimulationStore.getState().detach();
  });

  /** Click the "Start scenario" button on the main menu. */
  const startTutorial = (): void => {
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /start scenario/i }));
    });
  };

  it('enters the play view when a scenario is started', () => {
    render(<App />);
    startTutorial();
    // The toolbar exposes the sim time and tick rate.
    expect(screen.getAllByText(/sim time/i).length).toBeGreaterThan(0);
  });

  it('reflects a SET_TICK_RATE command in the snapshot', () => {
    render(<App />);
    startTutorial();
    const before = useSimulationStore.getState().snapshot.tickHz;
    act(() => {
      useSimulationStore.getState().dispatch({ type: 'SET_TICK_RATE', hz: 4 });
    });
    const after = useSimulationStore.getState().snapshot.tickHz;
    expect(after).toBe(4);
    expect(after).not.toBe(before);
  });

  it('captures engine events in the recentEvents buffer', () => {
    render(<App />);
    startTutorial();
    act(() => {
      useSimulationStore.getState().dispatch({ type: 'SET_TICK_RATE', hz: 2 });
    });
    const events = useSimulationStore.getState().recentEvents;
    const tickEvent = events.find(
      (e) => e.type === 'LOG' && e.code === 'CLOCK_TICK_RATE_CHANGED',
    );
    expect(tickEvent).toBeDefined();
  });

  it('includes the tutorial signal in the snapshot', () => {
    render(<App />);
    startTutorial();
    const sig = asId<SignalId>('S_in');
    const snapshot = useSimulationStore.getState().snapshot;
    expect(snapshot.signals.has(sig)).toBe(true);
  });

  it('loads the tutorial objectives into the snapshot', () => {
    render(<App />);
    startTutorial();
    // After starting the scenario via the engine, the
    // objectives should be present in the snapshot.
    act(() => {
      useSimulationStore
        .getState()
        .dispatch({
          type: 'START_SCENARIO',
          scenarioId: asId<ScenarioId>('tutorial'),
        });
    });
    const snapshot = useSimulationStore.getState().snapshot;
    expect(snapshot.objectives.length).toBeGreaterThan(0);
  });
});


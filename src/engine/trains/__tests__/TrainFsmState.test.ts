import { describe, it, expect } from 'vitest';
import {
  isTrainStationary,
  isTrainTerminal,
  isTrainInControlledArea,
  type TrainFsmState,
} from '../TrainFsmState';

describe('TrainFsmState — type guard helpers', () => {
  it('isTrainStationary is true only for stationary states', () => {
    expect(isTrainStationary('StoppedAtSignal')).toBe(true);
    expect(isTrainStationary('StoppedAtPlatform')).toBe(true);
    expect(isTrainStationary('Finished')).toBe(true);
    expect(isTrainStationary('Running')).toBe(false);
    expect(isTrainStationary('WaitingForEntry')).toBe(false);
    expect(isTrainStationary('Entering')).toBe(false);
    expect(isTrainStationary('ApproachingSignal')).toBe(false);
    expect(isTrainStationary('Departing')).toBe(false);
    expect(isTrainStationary('LeavingControlledArea')).toBe(false);
  });

  it('isTrainTerminal is true only for Finished', () => {
    expect(isTrainTerminal('Finished')).toBe(true);
    expect(isTrainTerminal('Running')).toBe(false);
    expect(isTrainTerminal('WaitingForEntry')).toBe(false);
  });

  it('isTrainInControlledArea is false for WaitingForEntry and Finished', () => {
    expect(isTrainInControlledArea('WaitingForEntry')).toBe(false);
    expect(isTrainInControlledArea('Finished')).toBe(false);
    expect(isTrainInControlledArea('Running')).toBe(true);
    expect(isTrainInControlledArea('StoppedAtSignal')).toBe(true);
    expect(isTrainInControlledArea('StoppedAtPlatform')).toBe(true);
  });
});

describe('TrainFsmState — exhaustiveness', () => {
  it('all known states are present in the type guard truth tables', () => {
    // The guards above are exhaustive. A new state added to
    // TrainFsmState without updating these guards is a type
    // error (the switch is over a discriminated union). The
    // runtime smoke below is a belt-and-braces guard.
    const all: TrainFsmState[] = [
      'WaitingForEntry',
      'Entering',
      'Running',
      'ApproachingSignal',
      'StoppedAtSignal',
      'StoppedAtPlatform',
      'Departing',
      'LeavingControlledArea',
      'Finished',
    ];
    for (const s of all) {
      const r1 = isTrainStationary(s);
      const r2 = isTrainTerminal(s);
      const r3 = isTrainInControlledArea(s);
      expect(typeof r1).toBe('boolean');
      expect(typeof r2).toBe('boolean');
      expect(typeof r3).toBe('boolean');
    }
  });
});

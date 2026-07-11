import { describe, it, expect } from 'vitest';
import { Simulation, RngService } from '..';
import { CURRENT_VERSION } from '@/types/versioned';

describe('engine public surface (smoke)', () => {
  it('CURRENT_VERSION is 1', () => {
    expect(CURRENT_VERSION).toBe(1);
  });

  it('Simulation can be constructed', () => {
    const s = new Simulation();
    expect(s.time.now()).toBe(0);
    expect(s.rng).toBeInstanceOf(RngService);
  });
});

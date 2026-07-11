import { describe, it, expect } from 'vitest';
import { asId, safeAsId, type NodeId, type TrainId } from '../ids';

describe('asId', () => {
  it('casts a raw string to a branded ID at the type level', () => {
    const id: NodeId = asId<NodeId>('TRK_001');
    expect(id).toBe('TRK_001');
  });

  it('returns a string at runtime', () => {
    const id = asId<TrainId>('IC101');
    expect(typeof id).toBe('string');
  });
});

describe('safeAsId', () => {
  it('accepts a non-empty string and brands it', () => {
    const result = safeAsId<NodeId>('TRK_001');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('TRK_001');
    }
  });

  it('rejects an empty string with a structured error', () => {
    const result = safeAsId<NodeId>('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_ID');
    }
  });

  it('rejects a non-string input', () => {
    const result = safeAsId<NodeId>(42);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_ID');
    }
  });

  it('rejects null and undefined', () => {
    expect(safeAsId<NodeId>(null).ok).toBe(false);
    expect(safeAsId<NodeId>(undefined).ok).toBe(false);
  });
});

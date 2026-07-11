import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../EventBus';
import type { Event } from '@/types/events';

describe('EventBus', () => {
  it('emits a single event to a subscriber on flush', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe(handler);
    bus.emit({ type: 'TIME_TICK', simTime: 1 });
    expect(handler).not.toHaveBeenCalled();
    bus.flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([{ type: 'TIME_TICK', simTime: 1 }]);
  });

  it('batches multiple events into a single handler call', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe(handler);
    bus.emit({ type: 'TIME_TICK', simTime: 1 });
    bus.emit({ type: 'TIME_TICK', simTime: 2 });
    bus.emit({ type: 'TIME_TICK', simTime: 3 });
    bus.flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it('delivers a batch via emitBatch in one call', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe(handler);
    const events: Event[] = [
      { type: 'TIME_TICK', simTime: 1 },
      { type: 'TIME_TICK', simTime: 2 },
    ];
    bus.emitBatch(events);
    bus.flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('delivers to all subscribers', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    bus.emit({ type: 'TIME_TICK', simTime: 1 });
    bus.flush();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops further deliveries', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const off = bus.subscribe(handler);
    bus.emit({ type: 'TIME_TICK', simTime: 1 });
    bus.flush();
    off();
    bus.emit({ type: 'TIME_TICK', simTime: 2 });
    bus.flush();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns an empty frozen array when flushing an empty queue', () => {
    const bus = new EventBus();
    const r = bus.flush();
    expect(r).toEqual([]);
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('returns the delivered batch as a frozen array', () => {
    const bus = new EventBus();
    bus.emit({ type: 'TIME_TICK', simTime: 1 });
    const r = bus.flush();
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('is non-reentrant: emits during a handler run are queued for the next flush', () => {
    const bus = new EventBus();
    const seen: number[] = [];
    bus.subscribe((events) => {
      for (const e of events) {
        if (e.type === 'TIME_TICK') seen.push(e.simTime);
      }
      // Synchronously emit another event from inside the handler.
      bus.emit({ type: 'TIME_TICK', simTime: 99 });
    });
    bus.emit({ type: 'TIME_TICK', simTime: 1 });
    bus.flush();
    // The emit() inside the handler should not be visible in this batch.
    expect(seen).toEqual([1]);
    // The pending event should be delivered on the next flush.
    bus.flush();
    expect(seen).toEqual([1, 99]);
  });

  it('pendingCount reflects the queue depth', () => {
    const bus = new EventBus();
    expect(bus.pendingCount()).toBe(0);
    bus.emit({ type: 'TIME_TICK', simTime: 1 });
    bus.emit({ type: 'TIME_TICK', simTime: 2 });
    expect(bus.pendingCount()).toBe(2);
    bus.flush();
    expect(bus.pendingCount()).toBe(0);
  });

  it('subscriberCount reflects active subscriptions', () => {
    const bus = new EventBus();
    expect(bus.subscriberCount()).toBe(0);
    const off1 = bus.subscribe(() => undefined);
    const off2 = bus.subscribe(() => undefined);
    expect(bus.subscriberCount()).toBe(2);
    off1();
    expect(bus.subscriberCount()).toBe(1);
    off2();
    expect(bus.subscriberCount()).toBe(0);
  });
});

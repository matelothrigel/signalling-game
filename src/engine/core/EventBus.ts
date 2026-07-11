/**
 * EventBus — typed pub/sub for simulation events.
 *
 * Events are **queued** by `emit` and **delivered in batches** by
 * `flush`. This lets a single tick produce many events (e.g. a
 * train enters a section, a signal changes aspect, an objective
 * completes) that the UI consumes in one re-render.
 *
 * The bus is synchronous and non-reentrant: emitting from inside a
 * subscriber enqueues the new event for the **next** flush, never
 * re-enters the current handler pass.
 *
 * Subscribers receive the entire batch as a single `readonly Event[]`
 * argument. The returned unsubscribe function detaches the handler.
 */

import type { Event } from '@/types/events';

export type EventHandler = (events: readonly Event[]) => void;

const NO_EVENTS: readonly Event[] = Object.freeze([]);

export class EventBus {
  private queue: Event[] = [];
  private readonly handlers = new Set<EventHandler>();
  private flushing = false;

  /** Queue a single event. The event is delivered on the next flush. */
  public emit(event: Event): void {
    this.queue.push(event);
  }

  /** Queue a batch of events. They are delivered together on the next flush. */
  public emitBatch(events: readonly Event[]): void {
    for (const e of events) {
      this.queue.push(e);
    }
  }

  /**
   * Deliver all queued events to every subscriber. Returns the
   * delivered batch (frozen). Safe to call when no events are queued.
   */
  public flush(): readonly Event[] {
    if (this.flushing || this.queue.length === 0) {
      return NO_EVENTS;
    }
    this.flushing = true;
    const batch = this.queue;
    this.queue = [];
    try {
      for (const h of this.handlers) {
        h(batch);
      }
    } finally {
      this.flushing = false;
    }
    return Object.freeze(batch);
  }

  /** Number of events currently queued (not yet delivered). */
  public pendingCount(): number {
    return this.queue.length;
  }

  /** Subscribe to all events. Returns an unsubscribe function. */
  public subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return (): void => {
      this.handlers.delete(handler);
    };
  }

  /** Number of active subscribers. */
  public subscriberCount(): number {
    return this.handlers.size;
  }
}

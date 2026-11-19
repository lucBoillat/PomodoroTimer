import { ErrorHandler, inject, Injectable } from '@angular/core';
import type { AppEvent } from '../domain/app-event';

export type EventListener = (event: AppEvent) => void;

/**
 * A minimal observer: stores emit what happened, listeners (the log, later desktop
 * notifications) react, and neither side knows the other.
 *
 * Not a signal on purpose: a signal holds state and coalesces, so two events in the
 * same tick (e.g. "task completed" + "break started") would reach a listener as one.
 * Delivery here is synchronous and every single event arrives.
 */
@Injectable({ providedIn: 'root' })
export class EventBus {
  private readonly errorHandler = inject(ErrorHandler);
  private readonly listeners = new Set<EventListener>();

  /** Registers a listener and returns a function that removes it again. */
  on(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: AppEvent): void {
    // A copy, so a listener may unsubscribe (itself or others) while we iterate.
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        // A broken listener must neither break the emitting store nor the other listeners.
        this.errorHandler.handleError(error);
      }
    }
  }
}

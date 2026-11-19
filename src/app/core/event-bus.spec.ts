import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AppEvent } from '../domain/app-event';
import { EventBus } from './event-bus';

const added: AppEvent = { type: 'task-added', title: 'A' };
const started: AppEvent = { type: 'task-started', title: 'A' };
const completed: AppEvent = { type: 'task-completed', title: 'A' };
const breakStarted: AppEvent = { type: 'break-started', kind: 'short' };

describe('EventBus', () => {
  let bus: EventBus;
  let handleError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handleError = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: ErrorHandler, useValue: { handleError } }],
    });
    bus = TestBed.inject(EventBus);
  });

  /** Registers a listener that records everything it receives. */
  function record(): AppEvent[] {
    const received: AppEvent[] = [];
    bus.on((event) => received.push(event));
    return received;
  }

  describe('delivery', () => {
    it('does nothing without listeners', () => {
      expect(() => bus.emit(added)).not.toThrow();
    });

    it('delivers an event to a listener', () => {
      const received = record();

      bus.emit(added);

      expect(received).toEqual([added]);
    });

    it('delivers synchronously, before emit returns', () => {
      const received = record();

      bus.emit(added);
      const seenRightAfter = received.length;

      expect(seenRightAfter).toBe(1);
    });

    it('delivers every event of the same tick, in order (unlike a signal)', () => {
      const received = record();

      bus.emit(completed);
      bus.emit(breakStarted);

      expect(received).toEqual([completed, breakStarted]);
    });

    it('delivers the same event to all listeners, in registration order', () => {
      const calls: string[] = [];
      bus.on((e) => calls.push(`first:${e.type}`));
      bus.on((e) => calls.push(`second:${e.type}`));

      bus.emit(added);

      expect(calls).toEqual(['first:task-added', 'second:task-added']);
    });

    it('passes the event object through unchanged', () => {
      let received: AppEvent | undefined;
      bus.on((e) => (received = e));

      bus.emit(started);

      expect(received).toBe(started);
    });

    it('does not deliver events emitted before the listener registered', () => {
      bus.emit(added);

      const received = record();

      expect(received).toEqual([]);
    });

    it('handles a listener that emits, in nesting order', () => {
      const calls: string[] = [];
      bus.on((e) => {
        calls.push(`outer:${e.type}`);
        if (e.type === 'task-completed') bus.emit(breakStarted);
      });
      bus.on((e) => calls.push(`other:${e.type}`));

      bus.emit(completed);

      expect(calls).toEqual([
        'outer:task-completed',
        'outer:break-started',
        'other:break-started',
        'other:task-completed',
      ]);
    });

    it('is a single instance for the whole app', () => {
      expect(TestBed.inject(EventBus)).toBe(bus);
    });
  });

  describe('unsubscribing', () => {
    it('stops delivery after the returned function is called', () => {
      const received: AppEvent[] = [];
      const off = bus.on((e) => received.push(e));

      bus.emit(added);
      off();
      bus.emit(started);

      expect(received).toEqual([added]);
    });

    it('only removes its own listener', () => {
      const off = bus.on(() => undefined);
      const received = record();

      off();
      bus.emit(added);

      expect(received).toEqual([added]);
    });

    it('can be called more than once without harm', () => {
      const off = bus.on(() => undefined);

      off();

      expect(() => off()).not.toThrow();
    });

    it('lets a listener unsubscribe itself while an event is delivered', () => {
      const calls: string[] = [];
      const off = bus.on(() => {
        calls.push('once');
        off();
      });
      bus.on(() => calls.push('other'));

      bus.emit(added);
      bus.emit(started);

      expect(calls).toEqual(['once', 'other', 'other']);
    });

    it('still delivers the current event to a listener removed by an earlier one', () => {
      const calls: string[] = [];
      let offSecond = (): void => undefined;
      bus.on(() => {
        calls.push('first');
        offSecond();
      });
      offSecond = bus.on(() => calls.push('second'));

      bus.emit(added); // already started iterating over both
      bus.emit(started);

      expect(calls).toEqual(['first', 'second', 'first']);
    });

    it('registers the same function only once', () => {
      const received: AppEvent[] = [];
      const listener = (e: AppEvent): void => {
        received.push(e);
      };
      bus.on(listener);
      bus.on(listener);

      bus.emit(added);

      expect(received).toEqual([added]);
    });
  });

  describe('a failing listener', () => {
    const boom = new Error('listener broke');

    beforeEach(() => {
      bus.on(() => {
        throw boom;
      });
    });

    it('does not throw to the emitting code', () => {
      expect(() => bus.emit(added)).not.toThrow();
    });

    it('does not stop the other listeners', () => {
      const received = record();

      bus.emit(added);

      expect(received).toEqual([added]);
    });

    it('reports the error to the ErrorHandler', () => {
      bus.emit(added);

      expect(handleError).toHaveBeenCalledWith(boom);
    });
  });
});

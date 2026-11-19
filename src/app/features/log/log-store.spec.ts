import { TestBed } from '@angular/core/testing';
import { EventBus } from '../../core/event-bus';
import type { AppEvent } from '../../domain/app-event';
import { LOG_LIMIT, LogStore, type LogEntry } from './log-store';

const STORAGE_KEY = 'pomodoro.log';
const NOW = new Date('2026-01-01T10:00:00Z').getTime();

const added = (title = 'A'): AppEvent => ({ type: 'task-added', title });
const overdue = (title = 'A'): AppEvent => ({ type: 'task-overdue', title });
const breakOver: AppEvent = { type: 'break-over', kind: 'short' };

function entry(event: AppEvent, at = NOW): LogEntry {
  return { id: crypto.randomUUID(), at, event };
}

function seed(value: unknown): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function stored(): unknown {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

describe('LogStore', () => {
  let bus: EventBus;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    bus = TestBed.inject(EventBus);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createStore(): LogStore {
    return TestBed.inject(LogStore);
  }

  const events = (store: LogStore): AppEvent[] => store.entries().map((e) => e.event);

  /** Simulates a page reload: new injector, same localStorage. */
  function reload(): LogStore {
    TestBed.tick(); // save first
    TestBed.resetTestingModule();
    bus = TestBed.inject(EventBus);
    return createStore();
  }

  describe('recording', () => {
    it('starts empty', () => {
      expect(createStore().entries()).toEqual([]);
    });

    it('records an event from the bus', () => {
      const store = createStore();

      bus.emit(added('Buy milk'));

      expect(events(store)).toEqual([added('Buy milk')]);
    });

    it('stamps the time of recording', () => {
      const store = createStore();
      vi.setSystemTime(NOW + 1234);

      bus.emit(added());

      expect(store.entries()[0].at).toBe(NOW + 1234);
    });

    it('gives every entry its own id', () => {
      const store = createStore();

      bus.emit(added());
      bus.emit(added());

      const [first, second] = store.entries();
      expect(first.id).not.toBe(second.id);
    });

    it('keeps the newest first', () => {
      const store = createStore();

      bus.emit(added('First'));
      bus.emit(added('Second'));

      expect(events(store)).toEqual([added('Second'), added('First')]);
    });

    it('records every event of the same tick', () => {
      const store = createStore();

      bus.emit({ type: 'task-completed', title: 'A' });
      bus.emit({ type: 'break-started', kind: 'short' });

      expect(store.entries()).toHaveLength(2);
    });

    it('keeps identical ordinary events (e.g. the same title added twice)', () => {
      const store = createStore();

      bus.emit(added('A'));
      bus.emit(added('A'));

      expect(store.entries()).toHaveLength(2);
    });

    it(`keeps at most ${LOG_LIMIT} entries, dropping the oldest`, () => {
      const store = createStore();

      for (let i = 0; i < LOG_LIMIT + 3; i++) bus.emit(added(`#${i}`));

      expect(store.entries()).toHaveLength(LOG_LIMIT);
      expect(store.entries()[0].event).toEqual(added(`#${LOG_LIMIT + 2}`));
      expect(store.entries().at(-1)?.event).toEqual(added('#3'));
    });

    it('stops recording once destroyed', () => {
      const store = createStore();
      const oldBus = bus;
      TestBed.resetTestingModule();

      oldBus.emit(added());

      expect(store.entries()).toEqual([]);
    });
  });

  describe('time-based events after a reload', () => {
    it('ignores "overdue" when it repeats the latest entry', () => {
      const store = createStore();
      bus.emit(overdue('A'));

      bus.emit(overdue('A')); // what the notifier does after a reload

      expect(events(store)).toEqual([overdue('A')]);
    });

    it('ignores "break over" when it repeats the latest entry', () => {
      const store = createStore();
      bus.emit(breakOver);

      bus.emit(breakOver);

      expect(store.entries()).toHaveLength(1);
    });

    it('works across a real reload', () => {
      createStore();
      bus.emit(overdue('A'));

      const reloaded = reload();
      bus.emit(overdue('A'));

      expect(events(reloaded)).toEqual([overdue('A')]);
    });

    it('records it again once something else happened in between', () => {
      const store = createStore();
      bus.emit(overdue('A'));
      bus.emit({ type: 'task-completed', title: 'A' });

      bus.emit(overdue('A'));

      expect(store.entries()).toHaveLength(3);
    });

    it('records "overdue" for a different task', () => {
      const store = createStore();
      bus.emit(overdue('A'));

      bus.emit(overdue('B'));

      expect(store.entries()).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      const store = createStore();
      bus.emit(added());

      store.clear();

      expect(store.entries()).toEqual([]);
    });

    it('keeps recording afterwards', () => {
      const store = createStore();
      bus.emit(added('Old'));
      store.clear();

      bus.emit(added('New'));

      expect(events(store)).toEqual([added('New')]);
    });

    it('is saved', () => {
      const store = createStore();
      bus.emit(added());
      TestBed.tick();

      store.clear();
      TestBed.tick();

      expect(stored()).toEqual([]);
    });
  });

  describe('persistence', () => {
    it('saves entries to localStorage', () => {
      const store = createStore();
      bus.emit(added('Buy milk'));

      TestBed.tick();

      expect(stored()).toEqual(store.entries());
    });

    it('restores them after a reload', () => {
      const before = createStore();
      bus.emit(added('A'));
      bus.emit({ type: 'break-started', kind: 'long' });
      const saved = before.entries();

      expect(reload().entries()).toEqual(saved);
    });

    it('loads stored entries in their stored order', () => {
      const newer = entry(added('Newer'), NOW + 1);
      const older = entry(added('Older'), NOW);
      seed([newer, older]);

      expect(createStore().entries()).toEqual([newer, older]);
    });

    it.each([
      ['invalid JSON', '{not json'],
      ['an object instead of an array', '{"id":"x"}'],
      ['null', 'null'],
      ['a number', '42'],
    ])('starts empty for %s', (_label, raw) => {
      localStorage.setItem(STORAGE_KEY, raw);

      expect(createStore().entries()).toEqual([]);
    });

    it('skips invalid entries and keeps the valid ones', () => {
      const valid = entry(added('Valid'));
      seed([
        { id: 'x', at: NOW, event: { type: 'task-exploded' } },
        { id: 'y', at: 'yesterday', event: added() },
        { at: NOW, event: added() },
        null,
        valid,
      ]);

      expect(createStore().entries()).toEqual([valid]);
    });

    it(`caps an oversized stored log at ${LOG_LIMIT}`, () => {
      seed(Array.from({ length: LOG_LIMIT + 10 }, (_, i) => entry(added(`#${i}`))));

      const store = createStore();

      expect(store.entries()).toHaveLength(LOG_LIMIT);
      expect(store.entries()[0].event).toEqual(added('#0')); // the newest are kept
    });
  });

  it('is read-only from the outside', () => {
    expect('set' in createStore().entries).toBe(false);
  });
});

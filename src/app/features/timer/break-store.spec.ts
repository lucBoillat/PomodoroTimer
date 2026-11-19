import { TestBed } from '@angular/core/testing';
import { Break, type BreakProps } from '../../domain/break';
import { Settings } from '../../domain/settings';
import { SettingsStore } from '../settings/settings-store';
import { BreakStore } from './break-store';

const BREAK_KEY = 'pomodoro.break';
const COUNTER_KEY = 'pomodoro.break.counter';
const NOW = new Date('2026-01-01T10:00:00Z').getTime();
const MINUTE = 60_000;
const SHORT_MS = 5 * MINUTE; // default smallBreakMinutes
const LONG_MS = 15 * MINUTE; // default largeBreakMinutes

/** Creates a fresh store. Anything put in localStorage beforehand is what it loads. */
function createStore(): BreakStore {
  return TestBed.inject(BreakStore);
}

function stored(key: string): unknown {
  const raw = localStorage.getItem(key);
  return raw === null ? undefined : JSON.parse(raw);
}

/** Starts `count` breaks in a row and returns the kinds that came out. */
function startBreaks(store: BreakStore, count: number): string[] {
  const kinds: string[] = [];
  for (let i = 0; i < count; i++) {
    store.start();
    kinds.push(store.currentBreak()?.kind ?? 'none');
  }
  return kinds;
}

describe('BreakStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Only fake Date: Angular's scheduling keeps using real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loading', () => {
    it('starts with no break and a counter of 0 when nothing is stored', () => {
      const store = createStore();

      expect(store.currentBreak()).toBeNull();
      expect(store.currentCounter()).toBe(0);
    });

    it('loads a stored break as a Break instance', () => {
      const saved: BreakProps = { kind: 'long', endsAt: NOW + 10 * MINUTE };
      localStorage.setItem(BREAK_KEY, JSON.stringify(saved));

      const current = createStore().currentBreak();

      expect(current).toBeInstanceOf(Break);
      expect(current?.toJSON()).toEqual(saved);
    });

    it('treats a stored "null" as no break', () => {
      localStorage.setItem(BREAK_KEY, 'null');

      expect(createStore().currentBreak()).toBeNull();
    });

    it('restores a break that ended while the app was closed as over', () => {
      localStorage.setItem(BREAK_KEY, JSON.stringify({ kind: 'short', endsAt: NOW - MINUTE }));

      expect(createStore().currentBreak()?.isOver(Date.now())).toBe(true);
    });

    it.each([
      ['broken JSON', '{"kind":'],
      ['the text "undefined"', 'undefined'],
      ['a number', '42'],
      ['an array', '[]'],
      ['an unknown kind', JSON.stringify({ kind: 'medium', endsAt: NOW })],
      ['a missing endsAt', JSON.stringify({ kind: 'short' })],
    ])('has no break when storage holds %s', (_label, raw) => {
      localStorage.setItem(BREAK_KEY, raw);

      expect(createStore().currentBreak()).toBeNull();
    });

    it('loads a stored counter', () => {
      localStorage.setItem(COUNTER_KEY, '7');

      expect(createStore().currentCounter()).toBe(7);
    });

    it.each([
      ['broken JSON', '{'],
      ['a negative number', '-1'],
      ['a decimal', '1.5'],
      ['a numeric string', '"3"'],
      ['null', 'null'],
      ['an object', '{"count":3}'],
    ])('resets the counter to 0 when storage holds %s', (_label, raw) => {
      localStorage.setItem(COUNTER_KEY, raw);

      expect(createStore().currentCounter()).toBe(0);
    });

    it('loads break and counter independently', () => {
      localStorage.setItem(BREAK_KEY, 'not json');
      localStorage.setItem(COUNTER_KEY, '2');

      const store = createStore();

      expect(store.currentBreak()).toBeNull();
      expect(store.currentCounter()).toBe(2);
    });
  });

  describe('start', () => {
    it('starts a short break with the short break duration from the settings', () => {
      const store = createStore();

      store.start();

      expect(store.currentBreak()?.toJSON()).toEqual({ kind: 'short', endsAt: NOW + SHORT_MS });
    });

    it('counts the completed pomodoro', () => {
      const store = createStore();

      store.start();
      store.start();

      expect(store.currentCounter()).toBe(2);
    });

    it('gives a long break after every 4th pomodoro', () => {
      expect(startBreaks(createStore(), 9)).toEqual([
        'short',
        'short',
        'short',
        'long',
        'short',
        'short',
        'short',
        'long',
        'short',
      ]);
    });

    it('uses the long break duration from the settings for a long break', () => {
      const store = createStore();

      startBreaks(store, 4);

      expect(store.currentBreak()?.toJSON()).toEqual({ kind: 'long', endsAt: NOW + LONG_MS });
    });

    it('continues the rhythm from a stored counter', () => {
      localStorage.setItem(COUNTER_KEY, '3');
      const store = createStore();

      store.start();

      expect(store.currentBreak()?.kind).toBe('long');
    });

    it('uses the current settings, not the ones from when the store was created', () => {
      const store = createStore();
      TestBed.inject(SettingsStore).update(
        Settings.create({ smallBreakMinutes: 7, largeBreakMinutes: 20 }),
      );

      store.start();
      expect(store.currentBreak()?.endsAt).toBe(NOW + 7 * MINUTE);

      startBreaks(store, 3); // 2nd–4th → the 4th is long
      expect(store.currentBreak()?.endsAt).toBe(NOW + 20 * MINUTE);
    });

    it('replaces a break that is still running', () => {
      const store = createStore();
      store.start();
      vi.setSystemTime(NOW + MINUTE);

      store.start();

      expect(store.currentBreak()?.endsAt).toBe(NOW + MINUTE + SHORT_MS);
    });
  });

  describe('end', () => {
    it('removes the current break', () => {
      const store = createStore();
      store.start();

      store.end();

      expect(store.currentBreak()).toBeNull();
    });

    it('keeps the counter', () => {
      const store = createStore();
      startBreaks(store, 2);

      store.end();

      expect(store.currentCounter()).toBe(2);
    });

    it('does nothing when there is no break', () => {
      const store = createStore();

      store.end();

      expect(store.currentBreak()).toBeNull();
      expect(store.currentCounter()).toBe(0);
    });
  });

  describe('saving', () => {
    it('persists a started break and the counter', () => {
      const store = createStore();

      store.start();
      TestBed.tick(); // run pending effects

      expect(stored(BREAK_KEY)).toEqual({ kind: 'short', endsAt: NOW + SHORT_MS });
      expect(stored(COUNTER_KEY)).toBe(1);
    });

    it('persists "no break" after end()', () => {
      const store = createStore();
      store.start();
      TestBed.tick();

      store.end();
      TestBed.tick();

      expect(stored(BREAK_KEY)).toBeNull();
      expect(stored(COUNTER_KEY)).toBe(1);
    });

    it('replaces corrupt data with clean values on startup', () => {
      localStorage.setItem(BREAK_KEY, '{"kind":');
      localStorage.setItem(COUNTER_KEY, '-5');

      createStore();
      TestBed.tick();

      expect(stored(BREAK_KEY)).toBeNull();
      expect(stored(COUNTER_KEY)).toBe(0);
    });

    it('restores break and counter in a new store (simulated page reload)', () => {
      const store = createStore();
      startBreaks(store, 3);
      TestBed.tick();
      const before = store.currentBreak()?.toJSON();

      TestBed.resetTestingModule(); // throw away the old store instance
      const reloaded = createStore();

      expect(reloaded.currentBreak()?.toJSON()).toEqual(before);
      expect(reloaded.currentCounter()).toBe(3);
      reloaded.start();
      expect(reloaded.currentBreak()?.kind).toBe('long'); // the rhythm survives the reload
    });
  });
});

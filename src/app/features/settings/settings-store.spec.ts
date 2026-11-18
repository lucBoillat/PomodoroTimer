import { TestBed } from '@angular/core/testing';
import { Settings, type SettingsProps } from '../../domain/settings';
import { SettingsStore } from './settings-store';

const STORAGE_KEY = 'pomodoro.settings';
const DEFAULTS: SettingsProps = {
  pomodoroMinutes: 25,
  smallBreakMinutes: 5,
  largeBreakMinutes: 15,
};

/** Creates a fresh store. Anything put in localStorage beforehand is what it loads. */
function createStore(): SettingsStore {
  return TestBed.inject(SettingsStore);
}

function stored(): unknown {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

describe('SettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loading', () => {
    it('uses the defaults when nothing is stored', () => {
      const store = createStore();

      expect(store.settings()).toBeInstanceOf(Settings);
      expect(store.settings().toJSON()).toEqual(DEFAULTS);
    });

    it('loads valid stored settings', () => {
      const saved: SettingsProps = {
        pomodoroMinutes: 50,
        smallBreakMinutes: 10,
        largeBreakMinutes: 30,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

      expect(createStore().settings().toJSON()).toEqual(saved);
    });

    it('fills in defaults for fields missing from older stored data', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ pomodoroMinutes: 40 }));

      expect(createStore().settings().toJSON()).toEqual({ ...DEFAULTS, pomodoroMinutes: 40 });
    });

    it.each([
      ['the text "undefined"', 'undefined'],
      ['an empty string', ''],
      ['broken JSON', '{"pomodoroMinutes":'],
      ['null', 'null'],
      ['an array', '[1,2,3]'],
      ['a number', '42'],
      ['an out-of-range value', JSON.stringify({ pomodoroMinutes: 999 })],
      ['a non-integer value', JSON.stringify({ pomodoroMinutes: 2.5 })],
      ['a value of the wrong type', JSON.stringify({ pomodoroMinutes: '25' })],
    ])('falls back to the defaults when storage holds %s', (_label, raw) => {
      localStorage.setItem(STORAGE_KEY, raw);

      expect(createStore().settings().toJSON()).toEqual(DEFAULTS);
    });

    it('drops all stored values if a single field is invalid', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ pomodoroMinutes: 50, smallBreakMinutes: 0, largeBreakMinutes: 30 }),
      );

      expect(createStore().settings().toJSON()).toEqual(DEFAULTS);
    });
  });

  describe('saving', () => {
    it('writes the loaded settings back on startup, replacing corrupt data', () => {
      localStorage.setItem(STORAGE_KEY, 'not json');

      createStore();
      TestBed.tick(); // run pending effects

      expect(stored()).toEqual(DEFAULTS);
    });

    it('stores only the plain settings fields', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, unknownField: true }));

      createStore();
      TestBed.tick();

      expect(stored()).toEqual(DEFAULTS);
    });

    it('update() changes the current settings immediately', () => {
      const store = createStore();
      const next = Settings.create({ pomodoroMinutes: 45 });

      store.update(next);

      expect(store.settings()).toBe(next);
    });

    it('update() persists the new settings', () => {
      const store = createStore();

      store.update(Settings.create({ pomodoroMinutes: 45, largeBreakMinutes: 20 }));
      TestBed.tick();

      expect(stored()).toEqual({ ...DEFAULTS, pomodoroMinutes: 45, largeBreakMinutes: 20 });
    });

    it('keeps only the latest value after several updates', () => {
      const store = createStore();

      store.update(Settings.create({ pomodoroMinutes: 30 }));
      store.update(Settings.create({ pomodoroMinutes: 35 }));
      TestBed.tick();

      expect(stored()).toEqual({ ...DEFAULTS, pomodoroMinutes: 35 });
    });

    it('restores updated settings in a new store (simulated page reload)', () => {
      const saved = Settings.create({
        pomodoroMinutes: 60,
        smallBreakMinutes: 7,
        largeBreakMinutes: 25,
      });
      createStore().update(saved);
      TestBed.tick();

      TestBed.resetTestingModule(); // throw away the old store instance

      expect(createStore().settings().toJSON()).toEqual(saved.toJSON());
    });
  });

  describe('read-only access', () => {
    it('does not expose a setter on settings', () => {
      const store = createStore();

      expect('set' in store.settings).toBe(false);
      expect('update' in store.settings).toBe(false);
    });
  });
});

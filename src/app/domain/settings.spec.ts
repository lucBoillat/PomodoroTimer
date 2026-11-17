import { ZodError } from 'zod';
import { Settings, type SettingsProps } from './settings';

const DEFAULTS: SettingsProps = {
  pomodoroMinutes: 25,
  smallBreakMinutes: 5,
  largeBreakMinutes: 15,
};

/** Bounds per field, mirrored from the schema so a changed bound shows up as a failing test. */
const FIELDS = [
  { field: 'pomodoroMinutes', min: 1, max: 200 },
  { field: 'smallBreakMinutes', min: 1, max: 30 },
  { field: 'largeBreakMinutes', min: 1, max: 90 },
] as const;

describe('Settings', () => {
  describe('create', () => {
    it('uses the defaults when called without input', () => {
      expect(Settings.create().toJSON()).toEqual(DEFAULTS);
    });

    it('uses the defaults for an empty object', () => {
      expect(Settings.create({}).toJSON()).toEqual(DEFAULTS);
    });

    it('fills only the missing fields with defaults', () => {
      const settings = Settings.create({ pomodoroMinutes: 50 });

      expect(settings.toJSON()).toEqual({ ...DEFAULTS, pomodoroMinutes: 50 });
    });

    it('exposes the values as direct properties', () => {
      const settings = Settings.create({
        pomodoroMinutes: 40,
        smallBreakMinutes: 8,
        largeBreakMinutes: 20,
      });

      expect(settings.pomodoroMinutes).toBe(40);
      expect(settings.smallBreakMinutes).toBe(8);
      expect(settings.largeBreakMinutes).toBe(20);
    });

    it('validates typed input too', () => {
      expect(() => Settings.create({ pomodoroMinutes: -3 })).toThrow(ZodError);
    });
  });

  describe.each(FIELDS)('$field bounds', ({ field, min, max }) => {
    it(`accepts the minimum (${min}) and maximum (${max})`, () => {
      expect(Settings.create({ [field]: min })[field]).toBe(min);
      expect(Settings.create({ [field]: max })[field]).toBe(max);
    });

    it(`rejects ${min - 1} and ${max + 1}`, () => {
      expect(() => Settings.create({ [field]: min - 1 })).toThrow(ZodError);
      expect(() => Settings.create({ [field]: max + 1 })).toThrow(ZodError);
    });
  });

  describe('parse (untrusted data, e.g. localStorage)', () => {
    it('returns a Settings instance', () => {
      expect(Settings.parse(DEFAULTS)).toBeInstanceOf(Settings);
    });

    it.each([
      ['a fraction', 2.5],
      ['a numeric string', '25'],
      ['null', null],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['a boolean', true],
      ['an object', {}],
    ])('rejects %s as a value', (_, value) => {
      expect(() => Settings.parse({ pomodoroMinutes: value })).toThrow(ZodError);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'settings'],
      ['a number', 42],
      ['an array', []],
    ])('rejects %s as input', (_, input) => {
      expect(() => Settings.parse(input)).toThrow(ZodError);
    });

    it('treats an explicit undefined like a missing field', () => {
      expect(Settings.parse({ pomodoroMinutes: undefined }).pomodoroMinutes).toBe(25);
    });

    it('fills fields missing from older saved data with defaults', () => {
      const savedByOlderVersion = { pomodoroMinutes: 30, smallBreakMinutes: 6 };

      expect(Settings.parse(savedByOlderVersion).largeBreakMinutes).toBe(15);
    });

    it('drops unknown fields', () => {
      const settings = Settings.parse({ ...DEFAULTS, theme: 'dark' });

      expect(settings.toJSON()).toEqual(DEFAULTS);
    });

    it('reports every invalid field, not just the first', () => {
      const error = captureZodError(() =>
        Settings.parse({ pomodoroMinutes: 0, smallBreakMinutes: 'x', largeBreakMinutes: 999 }),
      );

      expect(error.issues.map((issue) => issue.path.join('.'))).toEqual([
        'pomodoroMinutes',
        'smallBreakMinutes',
        'largeBreakMinutes',
      ]);
    });
  });

  describe('with', () => {
    const current = Settings.create({ pomodoroMinutes: 50, smallBreakMinutes: 10 });

    it('changes the given fields and keeps the others', () => {
      expect(current.with({ smallBreakMinutes: 7 }).toJSON()).toEqual({
        pomodoroMinutes: 50,
        smallBreakMinutes: 7,
        largeBreakMinutes: 15,
      });
    });

    it('returns a new instance and leaves the original unchanged', () => {
      const changed = current.with({ pomodoroMinutes: 30 });

      expect(changed).not.toBe(current);
      expect(current.pomodoroMinutes).toBe(50);
    });

    it('validates the result', () => {
      expect(() => current.with({ pomodoroMinutes: 0 })).toThrow(ZodError);
    });
  });

  describe('toJSON', () => {
    it('returns a plain object with exactly the settings fields', () => {
      const json = Settings.create().toJSON();

      expect(json).not.toBeInstanceOf(Settings);
      expect(Object.keys(json).sort()).toEqual(Object.keys(DEFAULTS).sort());
    });

    it('is used by JSON.stringify, so the stored JSON is flat', () => {
      expect(JSON.parse(JSON.stringify(Settings.create()))).toEqual(DEFAULTS);
    });

    it('round-trips through JSON (save to and load from localStorage)', () => {
      const original = Settings.create({
        pomodoroMinutes: 45,
        smallBreakMinutes: 3,
        largeBreakMinutes: 30,
      });

      const restored = Settings.parse(JSON.parse(JSON.stringify(original)));

      expect(restored.toJSON()).toEqual(original.toJSON());
    });
  });
});

function captureZodError(fn: () => unknown): ZodError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ZodError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected a ZodError, but nothing was thrown');
}

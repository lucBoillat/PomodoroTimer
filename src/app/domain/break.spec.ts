import { ZodError } from 'zod';
import { Break, type BreakKind, type BreakProps } from './break';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
const MINUTE = 60_000;
const SHORT = 5 * MINUTE;
const ENDS_AT = T0 + SHORT;

const shortBreak = (): Break => Break.start('short', T0, SHORT);

describe('Break', () => {
  describe('start', () => {
    it.each<BreakKind>(['short', 'long'])('starts a %s break', (kind) => {
      expect(Break.start(kind, T0, SHORT).kind).toBe(kind);
    });

    it('ends after the given duration', () => {
      expect(shortBreak().endsAt).toBe(ENDS_AT);
    });

    it('accepts a 1 ms duration', () => {
      expect(Break.start('short', T0, 1).endsAt).toBe(T0 + 1);
    });

    it.each([
      ['zero', 0],
      ['negative', -MINUTE],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['-Infinity', -Infinity],
    ])('rejects a %s duration', (_label, durationMs) => {
      expect(() => Break.start('short', T0, durationMs)).toThrow(/positive number/);
    });
  });

  describe('isOver', () => {
    it('is not over right after starting', () => {
      expect(shortBreak().isOver(T0)).toBe(false);
    });

    it('is not over 1 ms before the end', () => {
      expect(shortBreak().isOver(ENDS_AT - 1)).toBe(false);
    });

    it('is over exactly at the end', () => {
      expect(shortBreak().isOver(ENDS_AT)).toBe(true);
    });

    it('stays over afterwards', () => {
      expect(shortBreak().isOver(ENDS_AT + 60 * MINUTE)).toBe(true);
    });
  });

  describe('remainingMs', () => {
    it('is the full duration right after starting', () => {
      expect(shortBreak().remainingMs(T0)).toBe(SHORT);
    });

    it('counts down as time passes', () => {
      expect(shortBreak().remainingMs(T0 + 2 * MINUTE)).toBe(3 * MINUTE);
    });

    it('is 0 exactly at the end', () => {
      expect(shortBreak().remainingMs(ENDS_AT)).toBe(0);
    });

    it('never goes below 0', () => {
      expect(shortBreak().remainingMs(ENDS_AT + MINUTE)).toBe(0);
    });

    it('agrees with isOver', () => {
      const b = shortBreak();
      for (const now of [T0, ENDS_AT - 1, ENDS_AT, ENDS_AT + 1]) {
        expect(b.isOver(now)).toBe(b.remainingMs(now) === 0);
      }
    });
  });

  describe('immutability', () => {
    it('does not change when queried', () => {
      const b = shortBreak();
      const before = b.toJSON();

      b.isOver(ENDS_AT + MINUTE);
      b.remainingMs(ENDS_AT + MINUTE);

      expect(b.toJSON()).toEqual(before);
    });
  });

  describe('toJSON / parse', () => {
    it('serialises to plain data', () => {
      expect(Break.start('long', T0, 15 * MINUTE).toJSON()).toEqual({
        kind: 'long',
        endsAt: T0 + 15 * MINUTE,
      });
    });

    it('round-trips through JSON.stringify and parse', () => {
      const original = Break.start('long', T0, 15 * MINUTE);

      const restored = Break.parse(JSON.parse(JSON.stringify(original)));

      expect(restored).toBeInstanceOf(Break);
      expect(restored.toJSON()).toEqual(original.toJSON());
    });

    it('restores a break that ended while the app was closed as over', () => {
      const restored = Break.parse({ kind: 'short', endsAt: T0 });

      expect(restored.isOver(T0 + MINUTE)).toBe(true);
    });

    it('drops unknown keys', () => {
      const restored = Break.parse({ kind: 'short', endsAt: ENDS_AT, extra: true });

      expect(restored.toJSON()).toEqual({ kind: 'short', endsAt: ENDS_AT });
    });

    it.each<[string, unknown]>([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'short'],
      ['an array', [{ kind: 'short', endsAt: ENDS_AT }]],
      ['an empty object', {}],
      ['an unknown kind', { kind: 'medium', endsAt: ENDS_AT }],
      ['a missing kind', { endsAt: ENDS_AT }],
      ['a missing endsAt', { kind: 'short' }],
      ['endsAt as a string', { kind: 'short', endsAt: String(ENDS_AT) }],
      ['endsAt as NaN', { kind: 'short', endsAt: NaN }],
    ])('rejects %s', (_label, input) => {
      expect(() => Break.parse(input)).toThrow(ZodError);
    });

    it('accepts exactly the shape of BreakProps', () => {
      const props: BreakProps = { kind: 'long', endsAt: ENDS_AT };

      expect(Break.parse(props).toJSON()).toEqual(props);
    });
  });
});

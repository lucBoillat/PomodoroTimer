import { z } from 'zod';
import { settingsSchema } from '../domain/settings';
import { createTaskSchema, TASK_TITLE_MAX_LENGTH } from '../domain/task';
import { germanErrorMap } from './zod-messages';

/** The messages a schema produces for an input; [] when it is valid. */
function messages(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

const minutes = settingsSchema.shape.pomodoroMinutes;

describe('German Zod messages', () => {
  describe('numbers', () => {
    it.each([
      [0, 'Mindestens 1'],
      [-5, 'Mindestens 1'],
      [201, 'Höchstens 200'],
      [2.5, 'Bitte eine ganze Zahl eingeben'],
      [NaN, 'Bitte eine Zahl eingeben'],
      ['25', 'Bitte eine Zahl eingeben'],
    ])('%s → "%s"', (input, message) => {
      expect(messages(minutes, input)).toEqual([message]);
    });

    it("uses each field's own limits", () => {
      expect(messages(settingsSchema.shape.smallBreakMinutes, 31)).toEqual(['Höchstens 30']);
      expect(messages(settingsSchema.shape.largeBreakMinutes, 91)).toEqual(['Höchstens 90']);
    });
  });

  describe('texts', () => {
    const title = createTaskSchema.shape.title;

    it.each([
      ['', 'Darf nicht leer sein'],
      ['   ', 'Darf nicht leer sein'], // trimmed first
      ['x'.repeat(TASK_TITLE_MAX_LENGTH + 1), `Höchstens ${TASK_TITLE_MAX_LENGTH} Zeichen`],
    ])('%j → "%s"', (input, message) => {
      expect(messages(title, input)).toEqual([message]);
    });

    it('counts a minimum above 1 in characters', () => {
      expect(messages(z.string().min(3), 'ab')).toEqual(['Mindestens 3 Zeichen']);
    });
  });

  it('accepts valid values without messages', () => {
    expect(messages(minutes, 25)).toEqual([]);
    expect(messages(createTaskSchema.shape.title, 'Buy milk')).toEqual([]);
  });

  it("falls back to Zod's German locale for everything else", () => {
    const [message] = messages(z.uuid(), 'not-a-uuid');

    expect(message).toMatch(/ungültig/i);
  });

  it('leaves cases it does not cover to the fallback', () => {
    const issue = { code: 'invalid_format', format: 'uuid', input: 'x' } as const;

    expect(
      germanErrorMap(issue as unknown as Parameters<typeof germanErrorMap>[0]),
    ).toBeUndefined();
  });

  it('is active in every test, like in the app (src/test-setup.ts)', () => {
    expect(messages(z.number(), 'x')).toEqual(['Bitte eine Zahl eingeben']);
  });
});

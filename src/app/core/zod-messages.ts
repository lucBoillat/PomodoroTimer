import { z } from 'zod';

/**
 * User-facing German messages for validation errors, in one place.
 * The domain schemas stay free of UI text; this map decides how their rules read.
 * Anything not covered here falls back to Zod's German locale.
 */
export const germanErrorMap: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.expected === 'int') return 'Bitte eine ganze Zahl eingeben';
      if (issue.expected === 'number') return 'Bitte eine Zahl eingeben'; // also an empty number field (NaN)
      return undefined;
    case 'too_small':
      if (issue.origin === 'number') return `Mindestens ${issue.minimum}`;
      if (issue.origin === 'string') {
        return issue.minimum === 1 ? 'Darf nicht leer sein' : `Mindestens ${issue.minimum} Zeichen`;
      }
      return undefined;
    case 'too_big':
      if (issue.origin === 'number') return `Höchstens ${issue.maximum}`;
      if (issue.origin === 'string') return `Höchstens ${issue.maximum} Zeichen`;
      return undefined;
    default:
      return undefined;
  }
};

/** Makes every Zod error in the app German. Called once at startup (and in the test setup). */
export function useGermanZodMessages(): void {
  z.config({ ...z.locales.de(), customError: germanErrorMap });
}

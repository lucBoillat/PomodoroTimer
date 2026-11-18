import { z } from 'zod';

export const settingsSchema = z.object({
  pomodoroMinutes: z.int().min(1).max(200).default(25),
  smallBreakMinutes: z.int().min(1).max(30).default(5),
  largeBreakMinutes: z.int().min(1).max(90).default(15),
});

type SettingsInput = z.input<typeof settingsSchema>;
export type SettingsProps = Readonly<z.output<typeof settingsSchema>>;

export class Settings implements SettingsProps {
  private constructor(
    readonly pomodoroMinutes: number,
    readonly smallBreakMinutes: number,
    readonly largeBreakMinutes: number,
  ) {}

  // used for instancing from form data
  static create(input: SettingsInput = {}): Settings {
    return Settings.parse(input);
  }

  // used for instancing from localStorage
  static parse(input: unknown): Settings {
    const p = settingsSchema.parse(input);
    return new Settings(p.pomodoroMinutes, p.smallBreakMinutes, p.largeBreakMinutes);
  }

  with(changes: SettingsInput): Settings {
    return Settings.create({ ...this.toJSON(), ...changes });
  }

  toJSON(): SettingsProps {
    return {
      pomodoroMinutes: this.pomodoroMinutes,
      smallBreakMinutes: this.smallBreakMinutes,
      largeBreakMinutes: this.largeBreakMinutes,
    };
  }
}

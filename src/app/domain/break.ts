import { z } from 'zod';

const breakSchema = z.object({
  kind: z.enum(['short', 'long']),
  endsAt: z.number(),
});
export type BreakKind = z.infer<typeof breakSchema>['kind']; // 'short' | 'long'
export type BreakProps = Readonly<z.output<typeof breakSchema>>;

export class Break implements BreakProps {
  private constructor(
    readonly kind: BreakKind,
    readonly endsAt: number,
  ) {}

  static start(kind: BreakKind, now: number, durationMs: number): Break {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error(`Duration must be a positive number of milliseconds, got ${durationMs}`);
    }
    return new Break(kind, now + durationMs);
  }

  static parse(input: unknown): Break {
    const p = breakSchema.parse(input);
    return new Break(p.kind, p.endsAt);
  }

  isOver(now: number): boolean {
    return this.endsAt <= now;
  }

  remainingMs(now: number): number {
    return Math.max(0, this.endsAt - now);
  }

  toJSON(): BreakProps {
    return {
      kind: this.kind,
      endsAt: this.endsAt,
    };
  }
}

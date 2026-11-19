import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { z } from 'zod';
import { EventBus } from '../../core/event-bus';
import { appEventSchema, type AppEvent } from '../../domain/app-event';

const STORAGE_KEY = 'pomodoro.log';
/** Keeps localStorage from growing forever; the oldest entries are dropped. */
export const LOG_LIMIT = 500;

const logEntrySchema = z.object({
  id: z.string(),
  at: z.number(),
  event: appEventSchema,
});
export type LogEntry = Readonly<z.output<typeof logEntrySchema>>;

/**
 * Time-based events are detected from state when the app starts. After a reload with a
 * task that was already overdue, that would log "overdue" a second time.
 */
const TIME_BASED: ReadonlySet<AppEvent['type']> = new Set(['task-overdue', 'break-over']);

/**
 * Records every event from the EventBus with a timestamp. The stores don't know it exists.
 * Started in app.config, so it also records while the Log tab was never opened.
 */
@Injectable({ providedIn: 'root' })
export class LogStore {
  private readonly state = signal<readonly LogEntry[]>(this.loadEntries());
  /** Newest first. */
  readonly entries = this.state.asReadonly();

  constructor() {
    const off = inject(EventBus).on((event) => this.record(event));
    inject(DestroyRef).onDestroy(off);

    effect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries())));
  }

  clear(): void {
    this.state.set([]);
  }

  private record(event: AppEvent): void {
    if (this.isRepeatedAfterReload(event)) return;
    const entry: LogEntry = { id: crypto.randomUUID(), at: Date.now(), event };
    this.state.update((entries) => [entry, ...entries].slice(0, LOG_LIMIT));
  }

  private isRepeatedAfterReload(event: AppEvent): boolean {
    if (!TIME_BASED.has(event.type)) return false;
    const last = this.state()[0]?.event;
    return JSON.stringify(last) === JSON.stringify(event);
  }

  private loadEntries(): readonly LogEntry[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap((item: unknown) => {
        const result = logEntrySchema.safeParse(item);
        return result.success ? [result.data] : [];
      })
      .slice(0, LOG_LIMIT);
  }
}

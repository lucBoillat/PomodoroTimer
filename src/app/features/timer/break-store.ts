import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { EventBus } from '../../core/event-bus';
import { Break, type BreakKind } from '../../domain/break';
import { SettingsStore } from '../settings/settings-store';

const STORAGE_KEY_BREAK = 'pomodoro.break';
const STORAGE_KEY_COUNTER = 'pomodoro.break.counter';
export const LONG_BREAK_EVERY = 4;

/** Where the user is in the current round of pomodoros that ends with a long break. */
export interface BreakCycle {
  /** Pomodoros finished in this round (0 … length); `length` while the long break runs. */
  readonly done: number;
  readonly length: number;
  /** The kind of the break that follows the next finished pomodoro. */
  readonly nextBreak: BreakKind;
}

@Injectable({ providedIn: 'root' })
export class BreakStore {
  private readonly settingsStore = inject(SettingsStore);
  private readonly events = inject(EventBus);

  private readonly breakState = signal<Break | null>(this.loadBreak());
  private readonly breakNumber = signal<number>(this.loadCounter());

  readonly currentBreak = this.breakState.asReadonly();
  readonly currentCounter = this.breakNumber.asReadonly();

  readonly cycle = computed<BreakCycle>(() => {
    const count = this.breakNumber();
    const inLongBreak = this.breakState()?.kind === 'long';
    return {
      // The long break is break no. 4, 8, …: count % 4 is 0 then, but the round is complete.
      done: inLongBreak ? LONG_BREAK_EVERY : count % LONG_BREAK_EVERY,
      length: LONG_BREAK_EVERY,
      nextBreak: (count + 1) % LONG_BREAK_EVERY === 0 ? 'long' : 'short',
    };
  });

  constructor() {
    effect(() => localStorage.setItem(STORAGE_KEY_BREAK, JSON.stringify(this.currentBreak())));
    effect(() => localStorage.setItem(STORAGE_KEY_COUNTER, JSON.stringify(this.currentCounter())));
  }

  start(): void {
    this.breakNumber.update((oldValue) => oldValue + 1);
    const breakType: BreakKind = this.breakNumber() % LONG_BREAK_EVERY === 0 ? 'long' : 'short';
    const breakMinutes =
      breakType === 'long'
        ? this.settingsStore.settings().largeBreakMinutes
        : this.settingsStore.settings().smallBreakMinutes;

    this.breakState.set(Break.start(breakType, Date.now(), breakMinutes * 60_000));
    this.events.emit({ type: 'break-started', kind: breakType });
  }

  end(): void {
    const currentBreak = this.breakState();
    // TaskStore.start() calls end() unconditionally; only a real break ending is an event.
    if (currentBreak === null) return;
    this.breakState.set(null);
    this.events.emit({ type: 'break-ended', kind: currentBreak.kind });
  }

  /** No break, and the counter starts over (the next break is short). No events. */
  reset(): void {
    this.breakState.set(null);
    this.breakNumber.set(0);
  }

  private loadBreak(): Break | null {
    const rawBreak = localStorage.getItem(STORAGE_KEY_BREAK);
    if (rawBreak === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(rawBreak);
      return parsed === null ? null : Break.parse(parsed);
    } catch {
      return null;
    }
  }
  private loadCounter(): number {
    const rawCounter = localStorage.getItem(STORAGE_KEY_COUNTER);
    if (rawCounter === null) {
      return 0;
    }
    try {
      const parsed = JSON.parse(rawCounter);
      if (Number.isInteger(parsed) && parsed >= 0) {
        return parsed;
      }
    } catch {
      return 0;
    }
    return 0;
  }
}

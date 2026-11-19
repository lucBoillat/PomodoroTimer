import {
  DestroyRef,
  DOCUMENT,
  effect,
  inject,
  Injectable,
  InjectionToken,
  signal,
} from '@angular/core';
import { EventBus } from './event-bus';

/** Creates the AudioContext, or null where Web Audio does not exist. A token so tests can fake it. */
export const AUDIO_CONTEXT_FACTORY = new InjectionToken<(() => AudioContext) | null>(
  'AUDIO_CONTEXT_FACTORY',
  {
    providedIn: 'root',
    factory: () => (typeof AudioContext === 'undefined' ? null : () => new AudioContext()),
  },
);

export type AlarmPattern = 'task' | 'break';

/** Tones as [frequency in Hz, start offset in s]. Generated, so no audio file is shipped. */
const PATTERNS: Record<AlarmPattern, readonly (readonly [number, number])[]> = {
  task: [
    [880, 0],
    [880, 0.25],
    [1175, 0.5],
  ], // three rising beeps: time is up
  break: [
    [660, 0],
    [880, 0.2],
  ], // two softer steps: back to work
};
const TONE_SECONDS = 0.18;
const VOLUME = 0.2;
const STORAGE_KEY = 'pomodoro.sound';

/**
 * Plays short alarm tones with the Web Audio API.
 *
 * Browsers only let audio start after a user gesture (autoplay policy). So the AudioContext
 * is created on the first click or key press anywhere; a timer that runs out later, even in
 * a background tab, can then play.
 */
@Injectable({ providedIn: 'root' })
export class AlarmSound {
  private readonly createContext = inject(AUDIO_CONTEXT_FACTORY);
  private readonly events = inject(EventBus);
  private context: AudioContext | null = null;

  readonly supported = this.createContext !== null;
  private readonly state = signal(this.loadEnabled());
  /** The user's choice; on by default. */
  readonly enabled = this.state.asReadonly();

  constructor() {
    effect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(this.enabled())));

    const document = inject(DOCUMENT);
    const unlock = (): void => {
      this.ensureContext();
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      void this.context?.close();
    });
  }

  setEnabled(enabled: boolean): void {
    if (this.state() === enabled) return;
    this.state.set(enabled);
    this.events.emit({ type: 'sound-toggled', enabled });
  }

  play(pattern: AlarmPattern): void {
    if (!this.enabled()) return;
    try {
      const context = this.ensureContext();
      if (!context) return;
      const start = context.currentTime;
      for (const [frequency, offset] of PATTERNS[pattern]) {
        this.tone(context, frequency, start + offset);
      }
    } catch {
      // Sound is a nice-to-have: an audio error must never break the timer.
    }
  }

  private tone(context: AudioContext, frequency: number, at: number): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    // A quick fade in and out, otherwise the tone clicks.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(VOLUME, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + TONE_SECONDS);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + TONE_SECONDS);
  }

  private ensureContext(): AudioContext | null {
    if (!this.createContext) return null;
    try {
      this.context ??= this.createContext();
      if (this.context.state === 'suspended') void this.context.resume();
    } catch {
      return null;
    }
    return this.context;
  }

  private loadEnabled(): boolean {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'true') !== false;
    } catch {
      return true;
    }
  }
}

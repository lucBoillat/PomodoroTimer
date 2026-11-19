import { effect, inject, Injectable, signal } from '@angular/core';
import { EventBus } from '../../core/event-bus';
import { Settings } from '../../domain/settings';

const STORAGE_KEY = 'pomodoro.settings';

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly events = inject(EventBus);
  private readonly state = signal<Settings>(this.loadSettings());

  // Public read-only view: components can read and react to it, but can't call set() because set would skip the isrunning check
  readonly settings = this.state.asReadonly();

  constructor() {
    effect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings())));
  }

  update(settings: Settings): void {
    const unchanged = JSON.stringify(settings) === JSON.stringify(this.state());
    this.state.set(settings);
    if (!unchanged) {
      this.events.emit({ type: 'settings-changed', settings: settings.toJSON() });
    }
  }

  /** Back to the defaults. No events: AppReset reports the reset as a whole. */
  reset(): void {
    this.state.set(Settings.create());
  }

  private loadSettings(): Settings {
    const rawSettings = localStorage.getItem(STORAGE_KEY);
    if (rawSettings === null) {
      return Settings.create();
    }
    try {
      return Settings.parse(JSON.parse(rawSettings));
    } catch {
      return Settings.create();
    }
  }
}

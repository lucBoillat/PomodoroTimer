import { inject, Injectable } from '@angular/core';
import { EventBus } from '../core/event-bus';
import { LogStore } from './log/log-store';
import { SettingsStore } from './settings/settings-store';
import { BreakStore } from './timer/break-store';
import { TaskStore } from './timer/task-store';

/**
 * "Alles zurücksetzen": puts every store back to its defaults.
 *
 * Explicit calls instead of each store listening for an 'app-reset' event: the log would
 * have to clear itself on the very event it is supposed to record. The stores' reset()
 * methods emit nothing, so the only entry left afterwards is "Alles zurückgesetzt".
 */
@Injectable({ providedIn: 'root' })
export class AppReset {
  private readonly taskStore = inject(TaskStore);
  private readonly breakStore = inject(BreakStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly logStore = inject(LogStore);
  private readonly events = inject(EventBus);

  run(): void {
    this.taskStore.reset();
    this.breakStore.reset();
    this.settingsStore.reset();
    this.logStore.clear();
    // Last, so it lands in the freshly cleared log.
    this.events.emit({ type: 'app-reset' });
  }
}

import { Component, computed, inject, linkedSignal } from '@angular/core';
import { DesktopNotifications } from '../../core/desktop-notifications';
import { Settings, settingsSchema } from '../../domain/settings';
import {
  disabled,
  form,
  FormField,
  FormRoot,
  validateStandardSchema,
} from '@angular/forms/signals';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { type MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { SettingsStore } from './settings-store';
import { TaskStore } from '../timer/task-store';
import { BreakStore } from '../timer/break-store';

@Component({
  imports: [
    FormField,
    MatFormFieldModule,
    MatInputModule,
    FormRoot,
    MatButtonModule,
    MatSlideToggleModule,
  ],
  selector: 'app-settings-page',
  styleUrl: './settings-page.scss',
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  private readonly settingsStore = inject(SettingsStore);
  private readonly taskStore = inject(TaskStore);
  private readonly breakStore = inject(BreakStore);
  protected readonly model = linkedSignal(() => this.settingsStore.settings().toJSON());
  protected readonly settingsForm = form(
    this.model,
    (path) => {
      disabled(path, {
        when: () =>
          this.taskStore.activeTask() !== null || this.breakStore.currentBreak() !== null
            ? 'Die Einstellungen sind gesperrt solange eine Aufgabe oder Pause läuft.'
            : false,
      });
      validateStandardSchema(path, settingsSchema);
    },
    {
      submission: {
        action: async (field) => {
          const settings = Settings.create(field().value());
          this.settingsStore.update(settings);
        },
      },
    },
  );

  // Desktop notifications are a preference, not a timer setting: not part of the locked form.
  protected readonly notifications = inject(DesktopNotifications);

  protected readonly notificationsUnavailable = computed(() => {
    const permission = this.notifications.permission();
    return permission === 'unsupported' || permission === 'denied';
  });

  protected readonly notificationHint = computed(() => {
    switch (this.notifications.permission()) {
      case 'unsupported':
        return 'Dein Browser unterstützt keine Desktop-Benachrichtigungen.';
      case 'denied':
        return 'Im Browser blockiert. Du kannst sie in den Einstellungen der Website erlauben.';
      default:
        return 'Benachrichtigt dich, wenn die Zeit abläuft und das Fenster nicht sichtbar ist.';
    }
  });

  protected async toggleNotifications(change: MatSlideToggleChange): Promise<void> {
    if (!change.checked) {
      this.notifications.disable();
      return;
    }
    // The click is the user gesture the browser needs for its permission prompt.
    const on = await this.notifications.enable();
    // Declined: `enabled` stayed false, so the binding does not change and won't reset the
    // toggle by itself. Flip it back by hand.
    if (!on) change.source.checked = false;
  }
}

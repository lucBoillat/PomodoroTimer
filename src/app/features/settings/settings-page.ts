import { Component, inject, linkedSignal } from '@angular/core';
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
import { SettingsStore } from './settings-store';
import { TaskStore } from '../timer/task-store';
import { BreakStore } from '../timer/break-store';

@Component({
  imports: [FormField, MatFormFieldModule, MatInputModule, FormRoot, MatButtonModule],
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
}

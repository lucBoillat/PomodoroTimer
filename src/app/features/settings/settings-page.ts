import { Component, inject, linkedSignal } from '@angular/core';
import { Settings, settingsSchema } from '../../domain/settings';
import { form, FormField, FormRoot, validateStandardSchema } from '@angular/forms/signals';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { SettingsStore } from './settings-store';

@Component({
  imports: [FormField, MatFormFieldModule, MatInputModule, FormRoot, MatButtonModule],
  selector: 'app-settings-page',
  styleUrl: './settings-page.scss',
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  private readonly settingsStore = inject(SettingsStore);
  protected readonly model = linkedSignal(() => this.settingsStore.settings().toJSON());
  protected readonly settingsForm = form(
    this.model,
    (path) => {
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

import { Component, output, signal } from '@angular/core';
import { form, FormField, FormRoot, validateStandardSchema } from '@angular/forms/signals';
import { createTaskSchema, TASK_TITLE_MAX_LENGTH } from '../../domain/task';
import { MatButtonModule } from '@angular/material/button';
import { ErrorStateMatcher, ShowOnDirtyErrorStateMatcher } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  imports: [FormField, MatFormFieldModule, MatInputModule, FormRoot, MatButtonModule],
  selector: 'app-task-form',
  styleUrl: './task-form.scss',
  templateUrl: './task-form.html',
  // Errors appear once the user has typed something, not merely after focusing and leaving
  // the empty field (the default, "touched", looks like scolding the user for clicking).
  providers: [{ provide: ErrorStateMatcher, useClass: ShowOnDirtyErrorStateMatcher }],
})
export class TaskForm {
  readonly added = output<string>();
  protected readonly maxLength = TASK_TITLE_MAX_LENGTH;
  protected readonly model = signal({ title: '' });

  protected readonly taskForm = form(
    this.model,
    (path) => {
      validateStandardSchema(path, createTaskSchema);
    },
    {
      submission: {
        action: async (field) => {
          this.added.emit(field().value().title);
          field().reset({ title: '' });
        },
        // "Hinzufügen" on an empty field: not dirty yet, so mark it to show why nothing happened.
        onInvalid: (field) => field.title().markAsDirty(),
      },
    },
  );
}

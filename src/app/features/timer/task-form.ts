import { Component, output, signal } from '@angular/core';
import { form, FormField, FormRoot, validateStandardSchema } from '@angular/forms/signals';
import { createTaskSchema, TASK_TITLE_MAX_LENGTH } from '../../domain/task';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  imports: [FormField, MatFormFieldModule, MatInputModule, FormRoot, MatButtonModule],
  selector: 'app-task-form',
  styleUrl: './task-form.scss',
  templateUrl: './task-form.html',
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
      },
    },
  );
}

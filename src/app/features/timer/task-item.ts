import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { form, FormField, FormRoot, validateStandardSchema } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { createTaskSchema, Task, type TaskState } from '../../domain/task';

const STATUS_LABELS: Record<TaskState['status'], string> = {
  pending: 'Wartend',
  running: 'Läuft',
  paused: 'Pausiert',
  done: 'Erledigt',
};

@Component({
  imports: [
    FormField,
    FormRoot,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
  selector: 'app-task-item',
  styleUrl: './task-item.scss',
  templateUrl: './task-item.html',
  host: {
    '[class.done]': 'task().isDone()',
    '[class.active]': 'task().isRunning() || task().isPaused()',
  },
})
export class TaskItem {
  readonly task = input.required<Task>();
  readonly startBlocked = input<string | null>(null); // a reason string, not a boolean

  readonly start = output<void>();
  readonly complete = output<void>();
  readonly remove = output<void>();
  readonly rename = output<string>();

  protected readonly statusLabel = computed(() => STATUS_LABELS[this.task().state.status]);

  protected readonly editing = signal(false);
  // Re-syncs with the task's title whenever the task changes (e.g. after a rename).
  private readonly editModel = linkedSignal(() => ({ title: this.task().title }));
  protected readonly editForm = form(
    this.editModel,
    (path) => {
      validateStandardSchema(path, createTaskSchema);
    },
    {
      submission: {
        action: async (field) => {
          const title = field.title().value();
          if (title.trim() !== this.task().title) {
            this.rename.emit(title);
          }
          this.editing.set(false);
        },
      },
    },
  );

  protected startEditing(): void {
    this.editForm().reset({ title: this.task().title });
    this.editing.set(true);
  }

  protected cancelEditing(): void {
    this.editing.set(false);
  }
}

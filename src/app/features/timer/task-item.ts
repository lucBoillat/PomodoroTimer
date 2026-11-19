import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { form, FormField, FormRoot, validateStandardSchema } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { createTaskSchema, Task, type TaskState } from '../../domain/task';

const STATUS_LABELS: Record<TaskState['status'], string> = {
  pending: 'Neu',
  running: 'Läuft',
  paused: 'Pausiert',
  done: 'Erledigt',
};

@Component({
  imports: [
    DragDropModule,
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

  // Reordering: the page knows the queue, so it says which directions are possible.
  readonly canMoveUp = input(false);
  readonly canMoveDown = input(false);
  readonly moveUp = output<void>();
  readonly moveDown = output<void>();

  /** Only items that can move at all get the drag handle and the arrows. */
  protected readonly reorderable = computed(() => this.canMoveUp() || this.canMoveDown());

  private readonly injector = inject(Injector);
  private readonly upButton = viewChild('upButton', { read: ElementRef<HTMLButtonElement> });
  private readonly downButton = viewChild('downButton', { read: ElementRef<HTMLButtonElement> });

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

  /**
   * Emits the move. For keyboard users it also keeps the focus on an arrow afterwards, so they
   * can press again: the list re-renders (the DOM node may be moved, which drops focus), and at
   * the top/bottom the pressed arrow becomes disabled.
   * Mouse users don't need that, and moving focus would pop up the arrow's tooltip.
   */
  protected move(direction: 'up' | 'down', event: MouseEvent): void {
    (direction === 'up' ? this.moveUp : this.moveDown).emit();
    // A click triggered by Enter/Space has detail 0; a real mouse click counts its clicks (≥ 1).
    if (event.detail !== 0) return;
    afterNextRender(
      () => {
        const canGoOn = direction === 'up' ? this.canMoveUp() : this.canMoveDown();
        const same = direction === 'up' ? this.upButton() : this.downButton();
        const other = direction === 'up' ? this.downButton() : this.upButton();
        (canGoOn ? same : other)?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  protected startEditing(): void {
    this.editForm().reset({ title: this.task().title });
    this.editing.set(true);
  }

  protected cancelEditing(): void {
    this.editing.set(false);
  }
}

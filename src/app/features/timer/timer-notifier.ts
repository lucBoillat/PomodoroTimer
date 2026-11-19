import { computed, effect, inject, Injectable, untracked } from '@angular/core';
import {
  MatSnackBar,
  type MatSnackBarRef,
  type TextOnlySnackBar,
} from '@angular/material/snack-bar';
import { Clock } from '../../core/clock';
import { EventBus } from '../../core/event-bus';
import { BreakStore } from './break-store';
import { TaskStore } from './task-store';

type SnackBarRef = MatSnackBarRef<TextOnlySnackBar>;

/**
 * Shows a snackbar when the active task runs out of time, and when a break is over.
 *
 * Lives app-wide (started in app.config), so the message also appears on the other tabs:
 * the TimerPage is a lazy route and is destroyed when the user switches tabs.
 */
@Injectable({ providedIn: 'root' })
export class TimerNotifier {
  private readonly taskStore = inject(TaskStore);
  private readonly breakStore = inject(BreakStore);
  private readonly clock = inject(Clock);
  private readonly snackBar = inject(MatSnackBar);
  private readonly events = inject(EventBus);

  private taskRef: SnackBarRef | null = null;
  private breakRef: SnackBarRef | null = null;

  /*
   * These turn a state into an event. `now` changes every second, but a computed only
   * notifies when its *value* changes: null → id (or endsAt) and back. So each effect
   * below runs once per overdue task / finished break, not once per tick.
   * Hence a string/number and not the Task/Break object.
   */
  private readonly overdueTaskId = computed(() => {
    const task = this.taskStore.activeTask();
    return task?.isOverdue(this.clock.now()) ? task.id : null;
  });

  private readonly overBreakEndsAt = computed(() => {
    const currentBreak = this.breakStore.currentBreak();
    return currentBreak?.isOver(this.clock.now()) ? currentBreak.endsAt : null;
  });

  constructor() {
    effect(() => {
      const id = this.overdueTaskId();
      // Opening a snackbar must not add dependencies to this effect.
      untracked(() => (id === null ? this.dismissTask() : this.showOverdue(id)));
    });

    effect(() => {
      const endsAt = this.overBreakEndsAt();
      untracked(() => (endsAt === null ? this.dismissBreak() : this.showBreakOver()));
    });
  }

  private showOverdue(id: string): void {
    const title = this.taskStore.tasks().find((task) => task.id === id)?.title ?? '';
    // Time-based: no store method knows this moment, but this transition is exactly it.
    this.events.emit({ type: 'task-overdue', title });
    // No duration: it is an alarm and stays until the user reacts.
    this.taskRef = this.snackBar.open(`Zeit abgelaufen: „${title}“`, 'Erledigt', {
      politeness: 'assertive',
    });
    this.taskRef.onAction().subscribe(() => this.taskStore.complete(id));
  }

  private showBreakOver(): void {
    const kind = this.breakStore.currentBreak()?.kind;
    if (kind) this.events.emit({ type: 'break-over', kind });
    this.breakRef = this.snackBar.open('Pause vorbei', 'Pause beenden', {
      politeness: 'assertive',
    });
    this.breakRef.onAction().subscribe(() => this.breakStore.end());
  }

  // Separate refs: each kind only ever closes its own snackbar.
  private dismissTask(): void {
    this.taskRef?.dismiss();
    this.taskRef = null;
  }

  private dismissBreak(): void {
    this.breakRef?.dismiss();
    this.breakRef = null;
  }
}

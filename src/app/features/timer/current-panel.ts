import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { Break, BreakKind } from '../../domain/break';
import type { Task } from '../../domain/task';
import { formatDuration } from '../../shared/format-duration';

const BREAK_LABELS: Record<BreakKind, string> = {
  short: 'Kurze Pause',
  long: 'Lange Pause',
};

@Component({
  imports: [MatButtonModule, MatIconModule],
  selector: 'app-current-panel',
  styleUrl: './current-panel.scss',
  templateUrl: './current-panel.html',
})
export class CurrentPanel {
  readonly task = input<Task | null>(null);
  readonly activeBreak = input<Break | null>(null);
  readonly now = input.required<number>();

  readonly pauseTask = output<void>();
  readonly resumeTask = output<void>();
  readonly complete = output<void>();
  readonly endBreak = output<void>();

  protected readonly breakLabels = BREAK_LABELS;

  protected readonly overdue = computed(() => this.task()?.isOverdue(this.now()) ?? false);
  protected readonly breakOver = computed(() => this.activeBreak()?.isOver(this.now()) ?? false);

  /** The big number: time left, time over (with "+"), or null when nothing is active. */
  protected readonly time = computed(() => {
    const now = this.now();
    const task = this.task();
    if (task) {
      return task.isOverdue(now)
        ? `+${formatDuration(task.overdueByMs(now))}`
        : formatDuration(task.remainingMs(now) ?? 0);
    }
    const activeBreak = this.activeBreak();
    return activeBreak ? formatDuration(activeBreak.remainingMs(now)) : null;
  });
}

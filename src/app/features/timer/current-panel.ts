import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { Break, BreakKind } from '../../domain/break';
import type { Task } from '../../domain/task';
import { formatDuration } from '../../shared/format-duration';
import { type BreakCycle, LONG_BREAK_EVERY } from './break-store';

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
  readonly cycle = input<BreakCycle>({ done: 0, length: LONG_BREAK_EVERY, nextBreak: 'short' });

  readonly pauseTask = output<void>();
  readonly resumeTask = output<void>();
  readonly complete = output<void>();
  readonly endBreak = output<void>();

  protected readonly breakLabels = BREAK_LABELS;

  /** One entry per pomodoro of the round, for the dots. */
  protected readonly cycleDots = computed(() =>
    Array.from({ length: this.cycle().length }, (_, i) => i < this.cycle().done),
  );

  protected readonly cycleText = computed(() => {
    const { done, length, nextBreak } = this.cycle();
    if (this.activeBreak()?.kind === 'long') return 'Runde geschafft – lange Pause';
    if (nextBreak === 'long') return 'Als Nächstes: lange Pause';
    const left = length - done;
    return `Lange Pause nach ${left} Pomodoros`;
  });

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

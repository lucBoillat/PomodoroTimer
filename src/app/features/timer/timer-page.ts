import { Component, computed, inject } from '@angular/core';
import { Clock } from '../../core/clock';
import { CurrentPanel } from './current-panel';
import { TaskForm } from './task-form';
import { TaskStore } from './task-store';
import { BreakStore } from './break-store';
import { TaskItem } from './task-item';

@Component({
  imports: [CurrentPanel, TaskForm, TaskItem],
  selector: 'app-timer-page',
  styleUrl: './timer-page.scss',
  templateUrl: './timer-page.html',
})
export class TimerPage {
  protected readonly taskStore = inject(TaskStore);
  protected readonly breakStore = inject(BreakStore);
  protected readonly clock = inject(Clock);
  protected readonly startBlocked = computed(() =>
    !this.taskStore.activeTask()
      ? !this.breakStore.currentBreak()
        ? null
        : 'Pause läuft'
      : 'Eine andere Aufgabe ist aktiv',
  );

  protected pauseActive(): void {
    const task = this.taskStore.activeTask();
    if (task) this.taskStore.pause(task.id);
  }

  protected resumeActive(): void {
    const task = this.taskStore.activeTask();
    if (task) this.taskStore.resume(task.id);
  }

  protected completeActive(): void {
    const task = this.taskStore.activeTask();
    if (task) this.taskStore.complete(task.id);
  }
}

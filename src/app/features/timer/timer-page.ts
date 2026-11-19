import { Component, computed, inject } from '@angular/core';
import { TaskForm } from './task-form';
import { TaskStore } from './task-store';
import { BreakStore } from './break-store';
import { TaskItem } from './task-item';

@Component({
  imports: [TaskForm, TaskItem],
  selector: 'app-timer-page',
  styleUrl: './timer-page.scss',
  templateUrl: './timer-page.html',
})
export class TimerPage {
  protected readonly taskStore = inject(TaskStore);
  protected readonly breakStore = inject(BreakStore);
  protected readonly startBlocked = computed(() =>
    !this.taskStore.activeTask()
      ? !this.breakStore.currentBreak()
        ? null
        : 'Pause läuft'
      : 'Eine andere Aufgabe ist aktiv',
  );
}

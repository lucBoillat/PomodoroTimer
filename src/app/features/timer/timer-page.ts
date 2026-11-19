import { Component, inject } from '@angular/core';
import { TaskForm } from './task-form';
import { TaskStore } from './task-store';

@Component({
  imports: [TaskForm],
  selector: 'app-timer-page',
  styleUrl: './timer-page.scss',
  templateUrl: './timer-page.html',
})
export class TimerPage {
  protected readonly taskStore = inject(TaskStore);
}

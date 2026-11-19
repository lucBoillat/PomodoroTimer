import { Component } from '@angular/core';
import { TaskForm } from './task-form';

@Component({
  imports: [TaskForm],
  selector: 'app-timer-page',
  styleUrl: './timer-page.scss',
  templateUrl: './timer-page.html',
})
export class TimerPage {}

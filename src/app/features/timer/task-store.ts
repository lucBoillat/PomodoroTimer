import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { EventBus } from '../../core/event-bus';
import { InvalidTransitionError, Task } from '../../domain/task';
import { SettingsStore } from '../settings/settings-store';
import { BreakStore } from './break-store';
import { SAMPLE_TASKS } from './sample-tasks';

const STORAGE_KEY = 'pomodoro.tasks';

@Injectable({ providedIn: 'root' })
export class TaskStore {
  private readonly settingsStore = inject(SettingsStore);
  private readonly breakStore = inject(BreakStore);
  private readonly events = inject(EventBus);
  private readonly state = signal<readonly Task[]>(this.loadTasks());
  readonly tasks = this.state.asReadonly();
  readonly activeTask = computed(
    () => this.tasks().find((t) => t.isRunning() || t.isPaused()) ?? null,
  );

  constructor() {
    effect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tasks())));
  }

  add(title: string): void {
    const task = Task.create({ title });
    this.state.update((oldTasks) => [...oldTasks, task]);
    this.events.emit({ type: 'task-added', title: task.title });
  }

  /** Appends the sample tasks; existing tasks stay. One log event for the whole batch. */
  loadSamples(): void {
    const samples = SAMPLE_TASKS.map(({ title, done }) => {
      const task = Task.create({ title });
      return done ? task.complete() : task;
    });
    this.state.update((oldTasks) => [...oldTasks, ...samples]);
    this.events.emit({ type: 'sample-data-loaded', count: samples.length });
  }

  /** Back to an empty list. No events: AppReset reports the reset as a whole. */
  reset(): void {
    this.state.set([]);
  }

  delete(id: string): void {
    const task = this.state().find((t) => t.id === id);
    if (!task) return;
    if (!task.canDelete()) throw new InvalidTransitionError('delete', task.state.status);
    this.state.update((tasks) => tasks.filter((t) => t.id !== id));
    this.events.emit({ type: 'task-deleted', title: task.title });
  }

  edit(id: string, title: string): void {
    const task = this.state().find((t) => t.id === id);
    if (!task) return;
    const edited = task.edit(title);
    this.replaceTask(edited);
    // Saving an unchanged title is not worth a log entry.
    if (edited.title !== task.title) {
      this.events.emit({ type: 'task-edited', from: task.title, to: edited.title });
    }
  }

  start(id: string): void {
    const activeTask = this.activeTask();
    if (activeTask !== null) {
      throw new InvalidTransitionError(
        'start',
        activeTask.state.status,
        'another task is already active',
      );
    }
    const task = this.state().find((task) => task.id === id);
    if (task) {
      const transitionedTask = task.start(
        Date.now(),
        this.settingsStore.settings().pomodoroMinutes * 60_000,
      );
      this.breakStore.end();
      this.replaceTask(transitionedTask);
      this.events.emit({ type: 'task-started', title: task.title });
    }
  }

  pause(id: string): void {
    const task = this.state().find((task) => task.id === id);
    if (task) {
      const transitionedTask = task.pause(Date.now());
      this.replaceTask(transitionedTask);
      this.events.emit({ type: 'task-paused', title: task.title });
    }
  }

  resume(id: string): void {
    const task = this.state().find((task) => task.id === id);
    if (task) {
      const transitionedTask = task.resume(Date.now());
      this.replaceTask(transitionedTask);
      this.events.emit({ type: 'task-resumed', title: task.title });
    }
  }

  complete(id: string): void {
    const task = this.state().find((task) => task.id === id);
    if (task) {
      const wasStarted = task.isRunning() || task.isPaused();
      const transitionedTask = task.complete();
      this.replaceTask(transitionedTask);
      this.events.emit({ type: 'task-completed', title: task.title });
      // After the completion, so the log reads "completed" → "break started".
      if (wasStarted) this.breakStore.start();
    }
  }

  private replaceTask(newTask: Task): void {
    this.state.update((oldTasks) =>
      oldTasks.map((task) => (task.id === newTask.id ? newTask : task)),
    );
  }

  private loadTasks(): readonly Task[] {
    const rawTasks = localStorage.getItem(STORAGE_KEY);
    if (rawTasks === null) {
      return [];
    }
    let parsedTasks: unknown;
    try {
      parsedTasks = JSON.parse(rawTasks);
    } catch {
      return [];
    }
    if (!Array.isArray(parsedTasks)) {
      return [];
    }
    return parsedTasks.flatMap((rawTask: unknown) => {
      try {
        return [Task.parse(rawTask)];
      } catch {
        return [];
      }
    });
  }
}

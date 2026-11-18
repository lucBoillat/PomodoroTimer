import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { InvalidTransitionError, Task } from '../../domain/task';
import { SettingsStore } from '../settings/settings-store';

const STORAGE_KEY = 'pomodoro.tasks';

@Injectable({ providedIn: 'root' })
export class TaskStore {
  private readonly settingsStore = inject(SettingsStore);
  private readonly state = signal<readonly Task[]>(this.loadTasks());
  readonly tasks = this.state.asReadonly();
  readonly activeTask = computed(
    () => this.tasks().find((t) => t.isRunning() || t.isPaused()) ?? null,
  );

  constructor() {
    effect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tasks())));
  }

  add(title: string): void {
    this.state.update((oldTasks) => [...oldTasks, Task.create({ title })]);
  }

  delete(id: string): void {
    const task = this.state().find((t) => t.id === id);
    if (!task) return;
    if (!task.canDelete()) throw new InvalidTransitionError('delete', task.state.status);
    this.state.update((tasks) => tasks.filter((t) => t.id !== id));
  }

  edit(id: string, title: string): void {
    this.state.update((oldTasks) =>
      oldTasks.map((task) => (task.id === id ? task.edit(title) : task)),
    );
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
      this.replaceTask(transitionedTask);
    }
  }

  pause(id: string): void {
    const task = this.state().find((task) => task.id === id);
    if (task) {
      const transitionedTask = task.pause(Date.now());
      this.replaceTask(transitionedTask);
    }
  }

  resume(id: string): void {
    const task = this.state().find((task) => task.id === id);
    if (task) {
      const transitionedTask = task.resume(Date.now());
      this.replaceTask(transitionedTask);
    }
  }

  complete(id: string): void {
    const task = this.state().find((task) => task.id === id);
    if (task) {
      const transitionedTask = task.complete();
      this.replaceTask(transitionedTask);
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

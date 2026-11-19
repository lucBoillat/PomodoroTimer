import { TestBed } from '@angular/core/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import type { TaskState } from '../../domain/task';
import { BreakStore } from './break-store';
import { TaskStore } from './task-store';
import { TimerPage } from './timer-page';

const TASKS_KEY = 'pomodoro.tasks';
const BREAK_KEY = 'pomodoro.break';
const MINUTE = 60_000;

/** Puts tasks into storage, so the TaskStore loads them. */
function seedTasks(...tasks: [title: string, state?: TaskState][]): void {
  const raw = tasks.map(([title, state = { status: 'pending' }]) => ({
    id: crypto.randomUUID(),
    title,
    state,
  }));
  localStorage.setItem(TASKS_KEY, JSON.stringify(raw));
}

/**
 * Integration test for the page: real stores, real child components.
 * The logic itself is tested in the stores and in TaskItem / TaskForm;
 * here we only check that everything is wired together correctly.
 */
describe('TimerPage', () => {
  let loader: HarnessLoader;
  let host: HTMLElement;
  let taskStore: TaskStore;

  async function render(): Promise<void> {
    const fixture = TestBed.createComponent(TimerPage);
    loader = TestbedHarnessEnvironment.loader(fixture);
    host = fixture.nativeElement;
    taskStore = TestBed.inject(TaskStore);
    await fixture.whenStable();
  }

  /** Titles of the rendered task items, in display order. */
  function shownTitles(): string[] {
    return Array.from(host.querySelectorAll('app-task-item .title')).map(
      (el) => el.textContent?.trim() ?? '',
    );
  }

  function shownStatusOf(title: string): string | undefined {
    const item = itemElement(title);
    return item?.querySelector('.status')?.textContent?.trim();
  }

  function itemElement(title: string): Element | undefined {
    return Array.from(host.querySelectorAll('app-task-item')).find(
      (el) => el.querySelector('.title')?.textContent?.trim() === title,
    );
  }

  /** A button inside the item with the given title, found by its aria-label. */
  function buttonIn(title: string, label: string): Promise<MatButtonHarness> {
    const items = Array.from(host.querySelectorAll('app-task-item'));
    const index = items.findIndex((el) => el === itemElement(title));
    if (index === -1) throw new Error(`No task item titled "${title}"`);
    return loader.getHarness(
      MatButtonHarness.with({
        ancestor: `app-task-item:nth-of-type(${index + 1})`,
        selector: `[aria-label="${label}"]`,
      }),
    );
  }

  async function addViaForm(title: string): Promise<void> {
    const input = await loader.getHarness(MatInputHarness);
    await input.setValue(title);
    const button = await loader.getHarness(MatButtonHarness.with({ text: 'Hinzufügen' }));
    await button.click();
  }

  beforeEach(() => {
    localStorage.clear();
  });

  describe('list', () => {
    it('shows a hint when there are no tasks', async () => {
      await render();

      expect(host.textContent).toContain('Noch keine Aufgaben.');
      expect(shownTitles()).toEqual([]);
    });

    it('shows the stored tasks in order', async () => {
      seedTasks(['A'], ['B'], ['C']);
      await render();

      expect(shownTitles()).toEqual(['A', 'B', 'C']);
      expect(host.textContent).not.toContain('Noch keine Aufgaben.');
    });
  });

  describe('wiring to the store', () => {
    it('adds a task typed into the form', async () => {
      await render();

      await addViaForm('Buy milk');

      expect(shownTitles()).toEqual(['Buy milk']);
      expect(taskStore.tasks().map((t) => t.title)).toEqual(['Buy milk']);
    });

    it('starts a task', async () => {
      seedTasks(['A']);
      await render();

      await (await buttonIn('A', 'Starten')).click();

      expect(taskStore.activeTask()?.title).toBe('A');
      expect(shownStatusOf('A')).toBe('Läuft');
    });

    it('marks a pending task as done', async () => {
      seedTasks(['A']);
      await render();

      await (await buttonIn('A', 'Als erledigt markieren')).click();

      expect(taskStore.tasks()[0].isDone()).toBe(true);
      expect(shownStatusOf('A')).toBe('Erledigt');
    });

    it('deletes a task', async () => {
      seedTasks(['A'], ['B']);
      await render();

      await (await buttonIn('A', 'Löschen')).click();

      expect(shownTitles()).toEqual(['B']);
      expect(taskStore.tasks().map((t) => t.title)).toEqual(['B']);
    });

    it('renames a task', async () => {
      seedTasks(['Old']);
      await render();

      await (await buttonIn('Old', 'Bearbeiten')).click();
      const input = await loader.getHarness(MatInputHarness.with({ ancestor: 'app-task-item' }));
      await input.setValue('New');
      await (
        await loader.getHarness(MatButtonHarness.with({ selector: '[aria-label="Speichern"]' }))
      ).click();

      expect(shownTitles()).toEqual(['New']);
      expect(taskStore.tasks()[0].title).toBe('New');
    });
  });

  describe('blocking "Start"', () => {
    it('allows starting when nothing is active', async () => {
      seedTasks(['A'], ['B']);
      await render();

      expect(await (await buttonIn('A', 'Starten')).isDisabled()).toBe(false);
      expect(await (await buttonIn('B', 'Starten')).isDisabled()).toBe(false);
    });

    it('blocks the other tasks once one is started', async () => {
      seedTasks(['A'], ['B']);
      await render();

      await (await buttonIn('A', 'Starten')).click();

      expect(await (await buttonIn('B', 'Starten')).isDisabled()).toBe(true);
    });

    it.each<[string, TaskState]>([
      ['running', { status: 'running', endsAt: Date.now() + MINUTE }],
      ['paused', { status: 'paused', remainingMs: MINUTE }],
    ])('blocks starting while a task is %s', async (_label, state) => {
      seedTasks(['Active', state], ['Waiting']);
      await render();

      expect(await (await buttonIn('Waiting', 'Starten')).isDisabled()).toBe(true);
    });

    it('blocks starting during a break', async () => {
      seedTasks(['Waiting']);
      localStorage.setItem(
        BREAK_KEY,
        JSON.stringify({ kind: 'short', endsAt: Date.now() + MINUTE }),
      );
      await render();

      expect(await (await buttonIn('Waiting', 'Starten')).isDisabled()).toBe(true);
    });

    it('unblocks when the break ends', async () => {
      seedTasks(['Waiting']);
      localStorage.setItem(
        BREAK_KEY,
        JSON.stringify({ kind: 'short', endsAt: Date.now() + MINUTE }),
      );
      await render();

      TestBed.inject(BreakStore).end();

      expect(await (await buttonIn('Waiting', 'Starten')).isDisabled()).toBe(false);
    });

    it('unblocks when the active task is completed and its break is ended', async () => {
      seedTasks(['Active', { status: 'running', endsAt: Date.now() + MINUTE }], ['Waiting']);
      await render();

      taskStore.complete(taskStore.tasks()[0].id);
      expect(await (await buttonIn('Waiting', 'Starten')).isDisabled()).toBe(true); // break started

      TestBed.inject(BreakStore).end();
      expect(await (await buttonIn('Waiting', 'Starten')).isDisabled()).toBe(false);
    });
  });
});

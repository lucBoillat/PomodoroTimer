import { TestBed } from '@angular/core/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { LogStore } from '../log/log-store';
import { SettingsStore } from '../settings/settings-store';
import { Settings } from '../../domain/settings';
import type { TaskState } from '../../domain/task';
import { BreakStore } from './break-store';
import { SAMPLE_TASKS } from './sample-tasks';
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
  let rootLoader: HarnessLoader; // for overlays such as dialogs
  let host: HTMLElement;
  let taskStore: TaskStore;

  async function render(): Promise<void> {
    const fixture = TestBed.createComponent(TimerPage);
    loader = TestbedHarnessEnvironment.loader(fixture);
    rootLoader = TestbedHarnessEnvironment.documentRootLoader(fixture);
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

  describe('current panel', () => {
    /** A button in the panel, found by its visible text (the icon ligature comes first). */
    async function panelButton(label: string): Promise<MatButtonHarness> {
      return loader.getHarness(
        MatButtonHarness.with({ ancestor: 'app-current-panel', text: new RegExp(`${label}$`) }),
      );
    }

    function panelTitle(): string | undefined {
      return host.querySelector('app-current-panel .title')?.textContent?.trim();
    }

    it('shows that nothing is active', async () => {
      seedTasks(['A']);
      await render();

      expect(host.querySelector('app-current-panel')?.textContent).toContain(
        'Keine aktive Aufgabe',
      );
    });

    it('shows a task once it is started from the list', async () => {
      seedTasks(['A']);
      await render();

      await (await buttonIn('A', 'Starten')).click();

      expect(panelTitle()).toBe('A');
    });

    it('pauses the active task', async () => {
      seedTasks(['A', { status: 'running', endsAt: Date.now() + MINUTE }]);
      await render();

      await (await panelButton('Pausieren')).click();

      expect(taskStore.tasks()[0].isPaused()).toBe(true);
      expect(shownStatusOf('A')).toBe('Pausiert');
      expect(await panelButton('Fortsetzen')).toBeTruthy();
    });

    it('resumes the paused task', async () => {
      seedTasks(['A', { status: 'paused', remainingMs: MINUTE }]);
      await render();

      await (await panelButton('Fortsetzen')).click();

      expect(taskStore.tasks()[0].isRunning()).toBe(true);
      expect(shownStatusOf('A')).toBe('Läuft');
    });

    it.each<[string, TaskState]>([
      ['running', { status: 'running', endsAt: Date.now() + MINUTE }],
      ['paused', { status: 'paused', remainingMs: MINUTE }],
    ])('completes a %s task and starts a break', async (_label, state) => {
      seedTasks(['A', state]);
      await render();

      await (await panelButton('Erledigt')).click();

      expect(taskStore.tasks()[0].isDone()).toBe(true);
      expect(shownStatusOf('A')).toBe('Erledigt');
      expect(TestBed.inject(BreakStore).currentBreak()).not.toBeNull();
      expect(panelTitle()).toBe('Kurze Pause');
    });

    it('only acts on the active task, not on the others', async () => {
      seedTasks(['Waiting'], ['Active', { status: 'running', endsAt: Date.now() + MINUTE }]);
      await render();

      await (await panelButton('Erledigt')).click();

      expect(shownStatusOf('Active')).toBe('Erledigt');
      expect(shownStatusOf('Waiting')).toBe('Wartend');
    });

    it('ends the break and unblocks starting', async () => {
      seedTasks(['Waiting']);
      localStorage.setItem(
        BREAK_KEY,
        JSON.stringify({ kind: 'long', endsAt: Date.now() + MINUTE }),
      );
      await render();
      expect(panelTitle()).toBe('Lange Pause');

      await (await panelButton('Pause beenden')).click();

      expect(TestBed.inject(BreakStore).currentBreak()).toBeNull();
      expect(host.querySelector('app-current-panel')?.textContent).toContain(
        'Keine aktive Aufgabe',
      );
      expect(await (await buttonIn('Waiting', 'Starten')).isDisabled()).toBe(false);
    });

    it('shows the countdown of a freshly started task', async () => {
      seedTasks(['A']);
      await render();

      await (await buttonIn('A', 'Starten')).click();

      // Default pomodoro length; the clock lags behind Date.now(), never ahead, so this is exact.
      expect(host.querySelector('app-current-panel .time')?.textContent?.trim()).toBe('25:00');
    });

    it('shows an overdue task without "Pausieren"', async () => {
      seedTasks(['A', { status: 'running', endsAt: Date.now() - 2 * MINUTE }]);
      await render();

      expect(host.querySelector('app-current-panel .kicker')?.textContent?.trim()).toBe(
        'Überfällig',
      );
      expect(
        await loader.getAllHarnesses(
          MatButtonHarness.with({ ancestor: 'app-current-panel', text: /Pausieren$/ }),
        ),
      ).toEqual([]);
    });

    it('runs a full cycle: start → pause → resume → complete → end break', async () => {
      seedTasks(['A'], ['B']);
      await render();

      await (await buttonIn('A', 'Starten')).click();
      await (await panelButton('Pausieren')).click();
      await (await panelButton('Fortsetzen')).click();
      await (await panelButton('Erledigt')).click();
      expect(await (await buttonIn('B', 'Starten')).isDisabled()).toBe(true); // break

      await (await panelButton('Pause beenden')).click();

      expect(shownStatusOf('A')).toBe('Erledigt');
      expect(await (await buttonIn('B', 'Starten')).isDisabled()).toBe(false);
    });
  });

  describe('Beispieldaten laden', () => {
    it('adds the sample tasks to the list', async () => {
      seedTasks(['Mine']);
      await render();

      await (
        await loader.getHarness(MatButtonHarness.with({ text: /Beispieldaten laden$/ }))
      ).click();

      expect(shownTitles()).toEqual(['Mine', ...SAMPLE_TASKS.map((t) => t.title)]);
    });
  });

  describe('Alles zurücksetzen', () => {
    async function openResetDialog(): Promise<MatDialogHarness> {
      await (
        await loader.getHarness(MatButtonHarness.with({ text: /Alles zurücksetzen$/ }))
      ).click();
      return rootLoader.getHarness(MatDialogHarness);
    }

    async function clickInDialog(text: string): Promise<void> {
      await (
        await rootLoader.getHarness(
          MatButtonHarness.with({ text, ancestor: 'mat-dialog-container' }),
        )
      ).click();
    }

    /** Waits until the dialog has closed and the page has re-rendered. */
    async function dialogClosed(): Promise<void> {
      await vi.waitFor(async () =>
        expect(await rootLoader.getAllHarnesses(MatDialogHarness)).toHaveLength(0),
      );
    }

    beforeEach(() => {
      seedTasks(['A', { status: 'running', endsAt: Date.now() + MINUTE }], ['B']);
    });

    it('asks for confirmation first and explains what gets lost', async () => {
      await render();

      const dialog = await openResetDialog();

      expect(await dialog.getTitleText()).toBe('Alles zurücksetzen?');
      expect(await dialog.getContentText()).toContain('Einstellungen');
      expect(shownTitles()).toEqual(['A', 'B']); // nothing happened yet
    });

    it('changes nothing when cancelled', async () => {
      await render();
      await openResetDialog();

      await clickInDialog('Abbrechen');
      await dialogClosed();

      expect(shownTitles()).toEqual(['A', 'B']);
      expect(taskStore.activeTask()?.title).toBe('A');
    });

    it('changes nothing when closed with Escape', async () => {
      await render();
      const dialog = await openResetDialog();

      await dialog.close();
      await dialogClosed();

      expect(shownTitles()).toEqual(['A', 'B']);
    });

    it('resets everything when confirmed', async () => {
      await render();
      TestBed.inject(SettingsStore).update(Settings.create({ pomodoroMinutes: 50 }));
      await openResetDialog();

      await clickInDialog('Zurücksetzen');
      await dialogClosed();
      await vi.waitFor(() => expect(shownTitles()).toEqual([]));

      expect(host.textContent).toContain('Noch keine Aufgaben.');
      expect(host.querySelector('app-current-panel')?.textContent).toContain(
        'Keine aktive Aufgabe',
      );
      expect(TestBed.inject(SettingsStore).settings().pomodoroMinutes).toBe(25);
      expect(
        TestBed.inject(LogStore)
          .entries()
          .map((e) => e.event),
      ).toEqual([{ type: 'app-reset' }]);
    });
  });
});

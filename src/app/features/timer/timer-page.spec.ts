import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CdkDropList } from '@angular/cdk/drag-drop';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
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
  let fixture: ComponentFixture<TimerPage>;
  let loader: HarnessLoader;
  let rootLoader: HarnessLoader; // for overlays such as dialogs
  let host: HTMLElement;
  let taskStore: TaskStore;

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(TimerPage);
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
    const item = itemElement(title);
    if (!item?.parentElement) throw new Error(`No task item titled "${title}"`);
    // Items live in two sections; nth-of-type counts within one parent, so name the section.
    const section = item.parentElement.classList.contains('queue') ? 'queue' : 'done-list';
    const index = Array.from(item.parentElement.children).indexOf(item);
    return loader.getHarness(
      MatButtonHarness.with({
        ancestor: `.${section} > app-task-item:nth-of-type(${index + 1})`,
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
      // It leaves the queue and is shown in the panel instead.
      expect(shownTitles()).toEqual([]);
      expect(host.querySelector('app-current-panel .title')?.textContent?.trim()).toBe('A');
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
      expect(host.querySelector('app-current-panel .kicker')?.textContent?.trim()).toBe('Pausiert');
      expect(await panelButton('Fortsetzen')).toBeTruthy();
    });

    it('resumes the paused task', async () => {
      seedTasks(['A', { status: 'paused', remainingMs: MINUTE }]);
      await render();

      await (await panelButton('Fortsetzen')).click();

      expect(taskStore.tasks()[0].isRunning()).toBe(true);
      expect(host.querySelector('app-current-panel .kicker')?.textContent?.trim()).toBe('Läuft');
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
      expect(shownStatusOf('Waiting')).toBe('Neu');
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
      expect(shownTitles()).toEqual(['B']); // nothing happened yet (A is active, in the panel)
    });

    it('changes nothing when cancelled', async () => {
      await render();
      await openResetDialog();

      await clickInDialog('Abbrechen');
      await dialogClosed();

      expect(shownTitles()).toEqual(['B']);
      expect(taskStore.activeTask()?.title).toBe('A');
    });

    it('changes nothing when closed with Escape', async () => {
      await render();
      const dialog = await openResetDialog();

      await dialog.close();
      await dialogClosed();

      expect(shownTitles()).toEqual(['B']);
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

  describe('sections', () => {
    const sectionTitles = (selector: string): string[] =>
      Array.from(host.querySelectorAll(`${selector} app-task-item .title`)).map(
        (el) => el.textContent?.trim() ?? '',
      );
    const headings = (): string[] =>
      Array.from(host.querySelectorAll('section[aria-labelledby] > h2')).map(
        (h) => h.textContent?.trim() ?? '',
      );

    it('puts waiting tasks in the queue and done tasks below, without the active one', async () => {
      seedTasks(
        ['Done', { status: 'done' }],
        ['Wait 1'],
        ['Active', { status: 'running', endsAt: Date.now() + MINUTE }],
        ['Wait 2'],
      );
      await render();

      expect(headings()).toEqual(['Warteschlange (2)', 'Erledigt (1)']);
      expect(sectionTitles('.queue')).toEqual(['Wait 1', 'Wait 2']);
      expect(sectionTitles('.done-list')).toEqual(['Done']);
    });

    it('hides the done section while nothing is done', async () => {
      seedTasks(['A']);
      await render();

      expect(headings()).toEqual(['Warteschlange (1)']);
    });

    it('says when the queue is empty but other tasks exist', async () => {
      seedTasks(['Done', { status: 'done' }]);
      await render();

      expect(host.textContent).toContain('Keine neuen Aufgaben.');
      expect(host.textContent).not.toContain('Noch keine Aufgaben.');
    });

    it('moves a task to "Erledigt" when it is ticked off', async () => {
      seedTasks(['A'], ['B']);
      await render();

      await (await buttonIn('A', 'Als erledigt markieren')).click();

      expect(sectionTitles('.queue')).toEqual(['B']);
      expect(sectionTitles('.done-list')).toEqual(['A']);
    });

    it('marks the sections up as lists for screen readers', async () => {
      seedTasks(['A'], ['B', { status: 'done' }]);
      await render();

      expect(host.querySelectorAll('[role="list"]')).toHaveLength(2);
      expect(host.querySelectorAll('[role="list"] > [role="listitem"]')).toHaveLength(2);
    });
  });

  describe('reordering', () => {
    const queueTitles = (): string[] =>
      Array.from(host.querySelectorAll('.queue app-task-item .title')).map(
        (el) => el.textContent?.trim() ?? '',
      );
    let announce: ReturnType<typeof vi.spyOn>;

    async function renderQueue(...titles: string[]): Promise<void> {
      seedTasks(...titles.map((t): [string] => [t]));
      await render();
      announce = vi.spyOn(TestBed.inject(LiveAnnouncer), 'announce').mockResolvedValue();
    }

    it('disables "up" for the first and "down" for the last task', async () => {
      await renderQueue('A', 'B', 'C');

      expect(await (await buttonIn('A', 'Nach oben verschieben')).isDisabled()).toBe(true);
      expect(await (await buttonIn('A', 'Nach unten verschieben')).isDisabled()).toBe(false);
      expect(await (await buttonIn('B', 'Nach oben verschieben')).isDisabled()).toBe(false);
      expect(await (await buttonIn('C', 'Nach unten verschieben')).isDisabled()).toBe(true);
    });

    it('shows no arrows for a single waiting task', async () => {
      await renderQueue('A');

      expect(itemElement('A')?.querySelector('[aria-label="Nach oben verschieben"]')).toBeNull();
    });

    it('shows no arrows for done tasks', async () => {
      seedTasks(['A'], ['B'], ['Done', { status: 'done' }], ['Done 2', { status: 'done' }]);
      await render();

      expect(itemElement('Done')?.querySelector('[aria-label^="Nach"]')).toBeNull();
    });

    it('moves a task down with the arrow', async () => {
      await renderQueue('A', 'B', 'C');

      await (await buttonIn('A', 'Nach unten verschieben')).click();

      expect(queueTitles()).toEqual(['B', 'A', 'C']);
      expect(taskStore.queue().map((t) => t.title)).toEqual(['B', 'A', 'C']);
    });

    it('moves a task up with the arrow', async () => {
      await renderQueue('A', 'B', 'C');

      await (await buttonIn('C', 'Nach oben verschieben')).click();

      expect(queueTitles()).toEqual(['A', 'C', 'B']);
    });

    it('lets keyboard users press the same arrow repeatedly (focus stays on it)', async () => {
      await renderQueue('A', 'B', 'C');
      /** Enter on the focused element: a click with detail 0. */
      const pressEnter = async (): Promise<void> => {
        document.activeElement?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, detail: 0 }),
        );
        await fixture.whenStable();
      };

      itemElement('A')
        ?.querySelector<HTMLElement>('[aria-label="Nach unten verschieben"]')
        ?.focus();
      await pressEnter();
      await pressEnter();

      expect(queueTitles()).toEqual(['B', 'C', 'A']);
      // A is at the bottom now, so focus moved to its "up" arrow.
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Nach oben verschieben');
      expect(document.activeElement?.closest('app-task-item')).toBe(itemElement('A'));
    });

    it('announces the new position for screen readers', async () => {
      await renderQueue('A', 'B', 'C');

      await (await buttonIn('A', 'Nach unten verschieben')).click();

      expect(announce).toHaveBeenCalledWith('„A“ auf Position 2 von 3 verschoben');
    });

    it('logs the move', async () => {
      await renderQueue('A', 'B');

      await (await buttonIn('B', 'Nach oben verschieben')).click();

      expect(TestBed.inject(LogStore).entries()[0].event).toEqual({
        type: 'task-moved',
        title: 'B',
        position: 1,
      });
    });

    describe('drag and drop', () => {
      /** Fires the CDK's drop event directly: a real pointer drag needs layout the test DOM lacks. */
      async function drop(
        title: string,
        previousIndex: number,
        currentIndex: number,
      ): Promise<void> {
        const task = taskStore.queue().find((t) => t.title === title);
        fixture.debugElement
          .query(By.directive(CdkDropList))
          .triggerEventHandler('cdkDropListDropped', {
            previousIndex,
            currentIndex,
            item: { data: task },
          });
        await fixture.whenStable();
      }

      it('makes every waiting task draggable by its handle', async () => {
        await renderQueue('A', 'B');

        expect(host.querySelectorAll('.queue app-task-item.cdk-drag')).toHaveLength(2);
        expect(host.querySelectorAll('.queue .drag-handle')).toHaveLength(2);
      });

      it('moves the dropped task to the drop position', async () => {
        await renderQueue('A', 'B', 'C', 'D');

        await drop('D', 3, 1);

        expect(queueTitles()).toEqual(['A', 'D', 'B', 'C']);
        expect(announce).toHaveBeenCalledWith('„D“ auf Position 2 von 4 verschoben');
      });

      it('renders the new order right away, without waiting for the next task', async () => {
        await renderQueue('A', 'B', 'C');
        const task = taskStore.queue()[0];

        fixture.debugElement
          .query(By.directive(CdkDropList))
          .triggerEventHandler('cdkDropListDropped', {
            previousIndex: 0,
            currentIndex: 2,
            item: { data: task },
          });
        // Deliberately no `await fixture.whenStable()`: the DOM must already be updated.

        expect(queueTitles()).toEqual(['B', 'C', 'A']);
      });

      it('does nothing when dropped where it was', async () => {
        await renderQueue('A', 'B');

        await drop('A', 0, 0);

        expect(queueTitles()).toEqual(['A', 'B']);
        expect(announce).not.toHaveBeenCalled();
        expect(TestBed.inject(LogStore).entries()).toEqual([]);
      });
    });
  });

  describe('break cycle', () => {
    it('counts a finished pomodoro in the panel', async () => {
      seedTasks(['A', { status: 'running', endsAt: Date.now() + MINUTE }]);
      await render();
      expect(host.querySelectorAll('app-current-panel .dot.filled')).toHaveLength(0);

      await (
        await loader.getHarness(
          MatButtonHarness.with({ text: /Erledigt$/, ancestor: 'app-current-panel' }),
        )
      ).click();

      expect(host.querySelectorAll('app-current-panel .dot.filled')).toHaveLength(1);
      expect(host.querySelector('app-current-panel .cycle-text')?.textContent?.trim()).toBe(
        'Lange Pause nach 3 Pomodoros',
      );
    });
  });
});

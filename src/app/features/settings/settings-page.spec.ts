import { TestBed } from '@angular/core/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { MatSlideToggleHarness } from '@angular/material/slide-toggle/testing';
import {
  createFakeNotificationApi,
  type FakeNotificationApi,
} from '../../../testing/fake-notification';
import { NOTIFICATION_API } from '../../core/desktop-notifications';
import { Settings, type SettingsProps } from '../../domain/settings';
import { SettingsPage } from './settings-page';
import { SettingsStore } from './settings-store';
import type { TaskState } from '../../domain/task';
import { TaskStore } from '../timer/task-store';
import { BreakStore } from '../timer/break-store';

const STORAGE_KEY = 'pomodoro.settings';
const DEFAULTS: SettingsProps = {
  pomodoroMinutes: 25,
  smallBreakMinutes: 5,
  largeBreakMinutes: 15,
};

const LABELS = {
  pomodoroMinutes: 'Arbeitszeit (Minuten)',
  smallBreakMinutes: 'Kurze Pause (Minuten)',
  largeBreakMinutes: 'Lange Pause (Minuten)',
} as const;
type FieldName = keyof typeof LABELS;
const FIELD_NAMES = Object.keys(LABELS) as FieldName[];

const TASKS_KEY = 'pomodoro.tasks';
const BREAK_KEY = 'pomodoro.break';
const LOCKED_MESSAGE = 'Die Einstellungen sind gesperrt solange eine Aufgabe oder Pause läuft.';

/** Puts tasks with the given states into storage, so the TaskStore loads them. */
function seedTasks(...states: TaskState[]): void {
  const tasks = states.map((state, i) => ({ id: crypto.randomUUID(), title: `Task ${i}`, state }));
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

/** Puts a break into storage, so the BreakStore loads it. */
function seedBreak(endsAt: number): void {
  localStorage.setItem(BREAK_KEY, JSON.stringify({ kind: 'short', endsAt }));
}

describe('SettingsPage', () => {
  let loader: HarnessLoader;
  let store: SettingsStore;
  let host: HTMLElement;

  /** Renders the page. Anything put in localStorage beforehand is what the store loads. */
  async function render(): Promise<void> {
    const fixture = TestBed.createComponent(SettingsPage);
    loader = TestbedHarnessEnvironment.loader(fixture);
    host = fixture.nativeElement;
    store = TestBed.inject(SettingsStore);
    await fixture.whenStable();
  }

  function formField(name: FieldName): Promise<MatFormFieldHarness> {
    return loader.getHarness(MatFormFieldHarness.with({ floatingLabelText: LABELS[name] }));
  }

  async function input(name: FieldName): Promise<MatInputHarness> {
    const control = await (await formField(name)).getControl(MatInputHarness);
    if (!control) throw new Error(`No input found for ${name}`);
    return control;
  }

  /** Types into a field and leaves it, like a user tabbing out. */
  async function type(name: FieldName, value: string): Promise<void> {
    const field = await input(name);
    await field.setValue(value);
    await field.blur();
  }

  async function errors(name: FieldName): Promise<string[]> {
    return (await formField(name)).getTextErrors();
  }

  function saveButton(): Promise<MatButtonHarness> {
    return loader.getHarness(MatButtonHarness.with({ text: 'Speichern' }));
  }

  async function submit(): Promise<void> {
    await (await saveButton()).click();
  }

  async function disabledFields(): Promise<FieldName[]> {
    const result: FieldName[] = [];
    for (const name of FIELD_NAMES) {
      if (await (await input(name)).isDisabled()) result.push(name);
    }
    return result;
  }

  /** The visible "why is this locked" text, or null when none is shown. */
  function lockedHint(): string | null {
    return host.querySelector('.locked-hint')?.textContent?.trim() ?? null;
  }

  beforeEach(() => {
    localStorage.clear();
  });

  describe('initial values', () => {
    it('shows the defaults when nothing is stored', async () => {
      await render();

      expect(await (await input('pomodoroMinutes')).getValue()).toBe('25');
      expect(await (await input('smallBreakMinutes')).getValue()).toBe('5');
      expect(await (await input('largeBreakMinutes')).getValue()).toBe('15');
    });

    it('shows the stored settings', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ pomodoroMinutes: 50, smallBreakMinutes: 10, largeBreakMinutes: 30 }),
      );
      await render();

      expect(await (await input('pomodoroMinutes')).getValue()).toBe('50');
      expect(await (await input('smallBreakMinutes')).getValue()).toBe('10');
      expect(await (await input('largeBreakMinutes')).getValue()).toBe('30');
    });

    it('shows no errors before the user has done anything', async () => {
      await render();

      for (const name of FIELD_NAMES) {
        expect(await errors(name)).toEqual([]);
      }
    });
  });

  describe('saving', () => {
    it('saves valid changes to the store and to localStorage', async () => {
      await render();

      await type('pomodoroMinutes', '45');
      await type('largeBreakMinutes', '20');
      await submit();
      TestBed.tick(); // run the store's save effect

      const expected = { ...DEFAULTS, pomodoroMinutes: 45, largeBreakMinutes: 20 };
      expect(store.settings().toJSON()).toEqual(expected);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual(expected);
    });

    it('does not touch the store while the user is still typing', async () => {
      await render();

      await type('pomodoroMinutes', '45');

      expect(store.settings().toJSON()).toEqual(DEFAULTS);
    });
  });

  describe('validation', () => {
    it.each<[string, FieldName, string]>([
      ['too small', 'pomodoroMinutes', '0'],
      ['too large', 'pomodoroMinutes', '201'],
      ['not a whole number', 'pomodoroMinutes', '2.5'],
      ['empty', 'pomodoroMinutes', ''],
      ['too large', 'smallBreakMinutes', '31'],
      ['too large', 'largeBreakMinutes', '91'],
    ])(
      'shows an error and does not save when the value is %s (%s = "%s")',
      async (_case, name, value) => {
        await render();

        await type(name, value);
        expect((await errors(name)).length).toBeGreaterThan(0);

        await submit();
        expect(store.settings().toJSON()).toEqual(DEFAULTS);
      },
    );

    it('accepts the boundary values', async () => {
      await render();

      await type('pomodoroMinutes', '200');
      await type('smallBreakMinutes', '1');
      await type('largeBreakMinutes', '90');
      await submit();

      expect(store.settings().toJSON()).toEqual({
        pomodoroMinutes: 200,
        smallBreakMinutes: 1,
        largeBreakMinutes: 90,
      });
    });

    it('shows errors on submit even for fields the user never left', async () => {
      await render();

      const field = await input('smallBreakMinutes');
      await field.setValue('0'); // no blur, so the field is not "touched" yet
      expect(await errors('smallBreakMinutes')).toEqual([]);

      await submit();

      expect((await errors('smallBreakMinutes')).length).toBeGreaterThan(0);
    });

    it('clears the error once the value is fixed', async () => {
      await render();

      await type('pomodoroMinutes', '0');
      expect((await errors('pomodoroMinutes')).length).toBeGreaterThan(0);

      await type('pomodoroMinutes', '30');
      expect(await errors('pomodoroMinutes')).toEqual([]);
    });
  });

  describe('syncing with the store', () => {
    it('shows new values when the store changes from elsewhere', async () => {
      await render();

      store.update(Settings.create({ pomodoroMinutes: 35 }));

      expect(await (await input('pomodoroMinutes')).getValue()).toBe('35');
    });
  });

  describe('locking while a task or break is active', () => {
    it.each<[string, TaskState]>([
      ['running', { status: 'running', endsAt: Date.now() + 60_000 }],
      ['overdue', { status: 'running', endsAt: Date.now() - 60_000 }],
      ['paused', { status: 'paused', remainingMs: 60_000 }],
    ])('disables all fields and the button when a task is %s', async (_label, state) => {
      seedTasks({ status: 'pending' }, state);
      await render();

      expect(await disabledFields()).toEqual(FIELD_NAMES);
      expect(await (await saveButton()).isDisabled()).toBe(true);
    });

    it('explains why the settings are locked', async () => {
      seedTasks({ status: 'running', endsAt: Date.now() + 60_000 });
      await render();

      expect(lockedHint()).toBe(LOCKED_MESSAGE);
    });

    it('stays editable when tasks are only pending or done', async () => {
      seedTasks({ status: 'pending' }, { status: 'done' });
      await render();

      expect(await disabledFields()).toEqual([]);
      expect(await (await saveButton()).isDisabled()).toBe(false);
      expect(lockedHint()).toBeNull();
    });

    it('locks as soon as a task is started while the page is open', async () => {
      seedTasks({ status: 'pending' });
      await render();
      const taskStore = TestBed.inject(TaskStore);

      taskStore.start(taskStore.tasks()[0].id);

      expect(await disabledFields()).toEqual(FIELD_NAMES);
      expect(await (await saveButton()).isDisabled()).toBe(true);
      expect(lockedHint()).toBe(LOCKED_MESSAGE);
    });

    it('stays locked after completing a task, because the break starts', async () => {
      seedTasks({ status: 'running', endsAt: Date.now() + 60_000 });
      await render();
      const taskStore = TestBed.inject(TaskStore);

      taskStore.complete(taskStore.tasks()[0].id);

      expect(await disabledFields()).toEqual(FIELD_NAMES);
      expect(await (await saveButton()).isDisabled()).toBe(true);
      expect(lockedHint()).toBe(LOCKED_MESSAGE);
    });

    it('stays editable when a pending task is ticked off (no break)', async () => {
      seedTasks({ status: 'pending' });
      await render();
      const taskStore = TestBed.inject(TaskStore);

      taskStore.complete(taskStore.tasks()[0].id);

      expect(await disabledFields()).toEqual([]);
      expect(lockedHint()).toBeNull();
    });

    it('disables all fields and the button while a break is running', async () => {
      seedBreak(Date.now() + 60_000);
      await render();

      expect(await disabledFields()).toEqual(FIELD_NAMES);
      expect(await (await saveButton()).isDisabled()).toBe(true);
      expect(lockedHint()).toBe(LOCKED_MESSAGE);
    });

    // Current rule: a break locks until it is ended, even after its time has run out.
    it('stays locked for a break whose time has run out but was not ended', async () => {
      seedBreak(Date.now() - 60_000);
      await render();

      expect(await disabledFields()).toEqual(FIELD_NAMES);
    });

    it('unlocks once the break is ended', async () => {
      seedBreak(Date.now() + 60_000);
      await render();

      TestBed.inject(BreakStore).end();

      expect(await disabledFields()).toEqual([]);
      expect(await (await saveButton()).isDisabled()).toBe(false);
      expect(lockedHint()).toBeNull();
    });

    it('can save again after the task is completed and the break is ended', async () => {
      seedTasks({ status: 'paused', remainingMs: 60_000 });
      await render();
      const taskStore = TestBed.inject(TaskStore);
      taskStore.complete(taskStore.tasks()[0].id);
      TestBed.inject(BreakStore).end();

      await type('pomodoroMinutes', '40');
      await submit();

      expect(store.settings().pomodoroMinutes).toBe(40);
    });
  });

  describe('desktop notifications', () => {
    let fake: FakeNotificationApi;

    async function renderWith(api: FakeNotificationApi | null): Promise<void> {
      TestBed.configureTestingModule({
        providers: [{ provide: NOTIFICATION_API, useValue: api?.api ?? null }],
      });
      await render();
    }

    function toggle(): Promise<MatSlideToggleHarness> {
      return loader.getHarness(MatSlideToggleHarness.with({ label: 'Desktop-Benachrichtigungen' }));
    }

    function hint(): string | undefined {
      return host.querySelector('#notifications-hint')?.textContent?.trim();
    }

    beforeEach(() => {
      fake = createFakeNotificationApi('default');
    });

    it('starts off with an explanation', async () => {
      await renderWith(fake);

      expect(await (await toggle()).isChecked()).toBe(false);
      expect(await (await toggle()).isDisabled()).toBe(false);
      expect(hint()).toBe(
        'Benachrichtigt dich, wenn die Zeit abläuft und das Fenster nicht sichtbar ist.',
      );
    });

    it('connects the explanation to the toggle for screen readers', async () => {
      await renderWith(fake);

      const control = host.querySelector('mat-slide-toggle button');
      expect(control?.getAttribute('aria-describedby')).toContain('notifications-hint');
    });

    it('asks the browser on the first click and stays on when allowed', async () => {
      await renderWith(fake);
      fake.answer = 'granted';

      await (await toggle()).toggle();

      expect(fake.prompts).toBe(1);
      await vi.waitFor(async () => expect(await (await toggle()).isChecked()).toBe(true));
    });

    it('flips back off when the user declines', async () => {
      await renderWith(fake);
      fake.answer = 'denied';

      await (await toggle()).toggle();

      await vi.waitFor(async () => expect(await (await toggle()).isChecked()).toBe(false));
      await vi.waitFor(async () => expect(await (await toggle()).isDisabled()).toBe(true));
      expect(hint()).toContain('Im Browser blockiert');
    });

    it('can be switched off again', async () => {
      fake.permission = 'granted';
      await renderWith(fake);
      await (await toggle()).toggle();
      await vi.waitFor(async () => expect(await (await toggle()).isChecked()).toBe(true));

      await (await toggle()).toggle();

      expect(await (await toggle()).isChecked()).toBe(false);
      expect(JSON.parse(localStorage.getItem('pomodoro.notifications') ?? 'null')).toBe(false);
    });

    it('is disabled and says why when the browser blocks notifications', async () => {
      fake.permission = 'denied';
      await renderWith(fake);

      expect(await (await toggle()).isDisabled()).toBe(true);
      expect(hint()).toBe(
        'Im Browser blockiert. Du kannst sie in den Einstellungen der Website erlauben.',
      );
    });

    it('is disabled and says why when the browser has no notifications', async () => {
      await renderWith(null);

      expect(await (await toggle()).isDisabled()).toBe(true);
      expect(hint()).toBe('Dein Browser unterstützt keine Desktop-Benachrichtigungen.');
    });

    it('stays usable while the settings form is locked', async () => {
      seedTasks({ status: 'running', endsAt: Date.now() + 60_000 });
      fake.permission = 'granted';
      await renderWith(fake);
      expect(lockedHint()).toBe(LOCKED_MESSAGE);

      await (await toggle()).toggle();

      expect(await (await toggle()).isDisabled()).toBe(false);
      await vi.waitFor(async () => expect(await (await toggle()).isChecked()).toBe(true));
    });
  });
});

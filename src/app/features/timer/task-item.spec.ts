import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HarnessLoader, TestKey } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { MatTooltipHarness } from '@angular/material/tooltip/testing';
import { Task } from '../../domain/task';
import { TaskItem } from './task-item';

const MINUTE = 60_000;

// One factory per state, so each test starts from a fresh, known task.
const pending = (title = 'Write tests'): Task => Task.create({ title });
const running = (): Task => pending().start(Date.now(), 25 * MINUTE);
const paused = (): Task => running().pause(Date.now());
const done = (): Task => pending().complete();

/** aria-labels of the buttons, as a user with a screen reader would hear them. */
const LABEL = {
  start: 'Starten',
  complete: 'Als erledigt markieren',
  edit: 'Bearbeiten',
  remove: 'Löschen',
  save: 'Speichern',
  cancel: 'Abbrechen',
  up: 'Nach oben verschieben',
  down: 'Nach unten verschieben',
} as const;
type ButtonName = keyof typeof LABEL;

describe('TaskItem', () => {
  let fixture: ComponentFixture<TaskItem>;
  let loader: HarnessLoader;
  let host: HTMLElement;

  // Everything the component emitted, per output.
  let emitted: {
    start: number;
    complete: number;
    remove: number;
    rename: string[];
    moveUp: number;
    moveDown: number;
  };

  async function render(task: Task, startBlocked: string | null = null): Promise<void> {
    fixture = TestBed.createComponent(TaskItem);
    fixture.componentRef.setInput('task', task);
    fixture.componentRef.setInput('startBlocked', startBlocked);
    loader = TestbedHarnessEnvironment.loader(fixture);
    host = fixture.nativeElement;

    emitted = { start: 0, complete: 0, remove: 0, rename: [], moveUp: 0, moveDown: 0 };
    const item = fixture.componentInstance;
    item.start.subscribe(() => emitted.start++);
    item.complete.subscribe(() => emitted.complete++);
    item.remove.subscribe(() => emitted.remove++);
    item.rename.subscribe((title) => emitted.rename.push(title));
    item.moveUp.subscribe(() => emitted.moveUp++);
    item.moveDown.subscribe(() => emitted.moveDown++);

    await fixture.whenStable();
  }

  async function setTask(task: Task): Promise<void> {
    fixture.componentRef.setInput('task', task);
    await fixture.whenStable();
  }

  function button(name: ButtonName): Promise<MatButtonHarness> {
    return loader.getHarness(MatButtonHarness.with({ selector: `[aria-label="${LABEL[name]}"]` }));
  }

  /** The buttons currently shown, in display order. */
  async function visibleButtons(): Promise<ButtonName[]> {
    const shown: ButtonName[] = [];
    for (const name of Object.keys(LABEL) as ButtonName[]) {
      const matches = await loader.getAllHarnesses(
        MatButtonHarness.with({ selector: `[aria-label="${LABEL[name]}"]` }),
      );
      if (matches.length > 0) shown.push(name);
    }
    return shown;
  }

  async function click(name: ButtonName): Promise<void> {
    await (await button(name)).click();
  }

  function titleInput(): Promise<MatInputHarness> {
    return loader.getHarness(MatInputHarness);
  }

  async function editErrors(): Promise<string[]> {
    return (await loader.getHarness(MatFormFieldHarness)).getTextErrors();
  }

  function shownTitle(): string | null {
    return host.querySelector('.title')?.textContent?.trim() ?? null;
  }

  function shownStatus(): string | null {
    return host.querySelector('.status')?.textContent?.trim() ?? null;
  }

  async function isEditing(): Promise<boolean> {
    return (await loader.getAllHarnesses(MatInputHarness)).length > 0;
  }

  describe('display', () => {
    it('shows the title', async () => {
      await render(pending('Buy milk'));

      expect(shownTitle()).toBe('Buy milk');
    });

    it.each([
      ['pending', pending, 'Neu'],
      ['running', running, 'Läuft'],
      ['paused', paused, 'Pausiert'],
      ['done', done, 'Erledigt'],
    ])('labels a %s task as "%s"', async (_state, make, label) => {
      await render(make());

      expect(shownStatus()).toBe(label);
    });

    it.each<[string, () => Task, ButtonName[]]>([
      ['pending', pending, ['start', 'complete', 'edit', 'remove']],
      ['running', running, []],
      ['paused', paused, []],
      ['done', done, ['edit', 'remove']],
    ])('shows the right buttons for a %s task', async (_state, make, buttons) => {
      await render(make());

      expect(await visibleButtons()).toEqual(buttons);
    });

    it.each<[string, () => Task, string[]]>([
      ['pending', pending, []],
      ['running', running, ['active']],
      ['paused', paused, ['active']],
      ['done', done, ['done']],
    ])('marks the host element of a %s task', async (_state, make, classes) => {
      await render(make());

      expect(host.classList.contains('active')).toBe(classes.includes('active'));
      expect(host.classList.contains('done')).toBe(classes.includes('done'));
    });

    it('updates when the task input changes', async () => {
      await render(pending('Old'));

      await setTask(pending('New').complete());

      expect(shownTitle()).toBe('New');
      expect(shownStatus()).toBe('Erledigt');
      expect(host.classList.contains('done')).toBe(true);
    });
  });

  describe('actions', () => {
    it.each<[ButtonName, 'start' | 'complete' | 'remove']>([
      ['start', 'start'],
      ['complete', 'complete'],
      ['remove', 'remove'],
    ])('emits %s when its button is clicked', async (name, output) => {
      await render(pending());

      await click(name);

      expect(emitted[output]).toBe(1);
    });

    it('can delete a done task', async () => {
      await render(done());

      await click('remove');

      expect(emitted.remove).toBe(1);
    });
  });

  describe('startBlocked', () => {
    it('enables the start button when nothing blocks it', async () => {
      await render(pending(), null);

      expect(await (await button('start')).isDisabled()).toBe(false);
    });

    it('disables the start button and does not emit when blocked', async () => {
      await render(pending(), 'Pause läuft');

      const start = await button('start');
      expect(await start.isDisabled()).toBe(true);

      await start.click();
      expect(emitted.start).toBe(0);
    });

    it('explains in a tooltip why starting is blocked', async () => {
      await render(pending(), 'Eine andere Aufgabe ist aktiv');

      // The first tooltip trigger in the row is the wrapper around the start button.
      const [startTooltip] = await loader.getAllHarnesses(MatTooltipHarness);
      await startTooltip.show();

      expect(await startTooltip.getTooltipText()).toBe('Eine andere Aufgabe ist aktiv');
    });

    it('re-enables the start button when the block goes away', async () => {
      await render(pending(), 'Pause läuft');

      fixture.componentRef.setInput('startBlocked', null);
      await fixture.whenStable();

      expect(await (await button('start')).isDisabled()).toBe(false);
    });

    it('does not block the other buttons', async () => {
      await render(pending(), 'Pause läuft');

      for (const name of ['complete', 'edit', 'remove'] as const) {
        expect(await (await button(name)).isDisabled()).toBe(false);
      }
    });
  });

  describe('inline editing', () => {
    it('switches to a field with the current title', async () => {
      await render(pending('Buy milk'));

      await click('edit');

      expect(await (await titleInput()).getValue()).toBe('Buy milk');
      expect(await visibleButtons()).toEqual(['save', 'cancel']);
      expect(shownTitle()).toBeNull();
    });

    it('emits the new title on save and leaves edit mode', async () => {
      await render(pending('Buy milk'));
      await click('edit');

      await (await titleInput()).setValue('Buy oat milk');
      await click('save');

      expect(emitted.rename).toEqual(['Buy oat milk']);
      expect(await isEditing()).toBe(false);
    });

    it('can rename a done task', async () => {
      await render(pending('Old').complete());
      await click('edit');

      await (await titleInput()).setValue('New');
      await click('save');

      expect(emitted.rename).toEqual(['New']);
    });

    it.each([
      ['unchanged', 'Buy milk'],
      ['only padded with spaces', '  Buy milk  '],
    ])('emits nothing when the title is %s', async (_label, value) => {
      await render(pending('Buy milk'));
      await click('edit');

      await (await titleInput()).setValue(value);
      await click('save');

      expect(emitted.rename).toEqual([]);
      expect(await isEditing()).toBe(false);
    });

    it.each([
      ['empty', '', 'Darf nicht leer sein'],
      ['only whitespace', '   ', 'Darf nicht leer sein'],
      ['too long', 'x'.repeat(41), 'Höchstens 40 Zeichen'],
    ])(
      'shows a German error, emits nothing and stays in edit mode when the title is %s',
      async (_label, value, message) => {
        await render(pending('Buy milk'));
        await click('edit');

        await (await titleInput()).setValue(value);
        await click('save');

        expect(await editErrors()).toEqual([message]);
        expect(emitted.rename).toEqual([]);
        expect(await isEditing()).toBe(true);
      },
    );

    it('cancels with the cancel button without emitting', async () => {
      await render(pending('Buy milk'));
      await click('edit');
      await (await titleInput()).setValue('Something else');

      await click('cancel');

      expect(emitted.rename).toEqual([]);
      expect(await isEditing()).toBe(false);
      expect(shownTitle()).toBe('Buy milk');
    });

    it('cancels with Escape without emitting', async () => {
      await render(pending('Buy milk'));
      await click('edit');
      const input = await titleInput();
      await input.setValue('Something else');

      await (await input.host()).sendKeys(TestKey.ESCAPE);

      expect(emitted.rename).toEqual([]);
      expect(await isEditing()).toBe(false);
    });

    it('starts from the original title again after a cancelled edit', async () => {
      await render(pending('Buy milk'));
      await click('edit');
      await (await titleInput()).setValue('');
      await click('save'); // invalid → error shown, still editing
      await click('cancel');

      await click('edit');

      expect(await (await titleInput()).getValue()).toBe('Buy milk');
      expect(await editErrors()).toEqual([]); // the old error is gone too
    });

    it('starts from the latest title after the task was renamed from outside', async () => {
      await render(pending('Old'));

      await setTask(Task.parse({ ...pending('Old').toJSON(), title: 'Renamed' }));
      await click('edit');

      expect(await (await titleInput()).getValue()).toBe('Renamed');
    });
  });

  describe('reordering', () => {
    async function renderInQueue(canMoveUp: boolean, canMoveDown: boolean): Promise<void> {
      await render(pending());
      fixture.componentRef.setInput('canMoveUp', canMoveUp);
      fixture.componentRef.setInput('canMoveDown', canMoveDown);
      await fixture.whenStable();
    }

    const handle = (): Element | null => host.querySelector('.drag-handle');
    const focusedLabel = (): string | null =>
      document.activeElement?.getAttribute('aria-label') ?? null;

    it('shows no arrows and no handle by default (done list, single task, other states)', async () => {
      await render(pending());

      expect(await visibleButtons()).not.toContain('up');
      expect(await visibleButtons()).not.toContain('down');
      expect(handle()).toBeNull();
    });

    it('shows both arrows and a drag handle in the middle of the queue', async () => {
      await renderInQueue(true, true);

      expect(await visibleButtons()).toEqual(['start', 'complete', 'edit', 'remove', 'up', 'down']);
      expect(await (await button('up')).isDisabled()).toBe(false);
      expect(await (await button('down')).isDisabled()).toBe(false);
      expect(handle()).not.toBeNull();
    });

    it('hides the drag handle from screen readers (they use the arrows)', async () => {
      await renderInQueue(true, true);

      expect(handle()?.getAttribute('aria-hidden')).toBe('true');
    });

    it.each([
      ['at the top', false, true, 'up'],
      ['at the bottom', true, false, 'down'],
    ] as const)('disables the arrow that leads nowhere %s', async (_label, up, down, disabled) => {
      await renderInQueue(up, down);

      expect(await (await button(disabled)).isDisabled()).toBe(true);
      expect(await (await button(disabled === 'up' ? 'down' : 'up')).isDisabled()).toBe(false);
    });

    it.each([
      ['up', 'moveUp'],
      ['down', 'moveDown'],
    ] as const)('emits %s', async (name, output) => {
      await renderInQueue(true, true);

      await click(name);

      expect(emitted[output]).toBe(1);
    });

    describe('focus after a move', () => {
      /** Plays the parent: the queue changes as soon as the item reports a move. */
      function parentUpdatesOn(
        output: 'moveUp' | 'moveDown',
        inputs: Record<string, boolean>,
      ): void {
        fixture.componentInstance[output].subscribe(() => {
          for (const [name, value] of Object.entries(inputs)) {
            fixture.componentRef.setInput(name, value);
          }
        });
      }

      /** Enter/Space on a focused button: the browser fires a click with detail 0. */
      async function pressWithKeyboard(name: 'up' | 'down'): Promise<void> {
        const arrow = host.querySelector<HTMLButtonElement>(`[aria-label="${LABEL[name]}"]`);
        arrow?.focus();
        arrow?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
        await fixture.whenStable();
      }

      it('stays on the pressed arrow while it can go on', async () => {
        await renderInQueue(true, true);
        parentUpdatesOn('moveUp', { canMoveUp: true, canMoveDown: true });

        await pressWithKeyboard('up');

        expect(focusedLabel()).toBe(LABEL.up);
      });

      it('jumps to "down" when the item reached the top', async () => {
        await renderInQueue(true, true);
        parentUpdatesOn('moveUp', { canMoveUp: false, canMoveDown: true });

        await pressWithKeyboard('up');

        expect(focusedLabel()).toBe(LABEL.down);
      });

      it('jumps to "up" when the item reached the bottom', async () => {
        await renderInQueue(true, true);
        parentUpdatesOn('moveDown', { canMoveUp: true, canMoveDown: false });

        await pressWithKeyboard('down');

        expect(focusedLabel()).toBe(LABEL.up);
      });

      it('leaves focus alone after a mouse click (moving it would pop up a tooltip)', async () => {
        await renderInQueue(true, true);
        parentUpdatesOn('moveUp', { canMoveUp: false, canMoveDown: true });

        await click('up'); // the harness clicks like a mouse: detail 1
        await fixture.whenStable();

        expect(focusedLabel()).not.toBe(LABEL.down);
        expect(emitted.moveUp).toBe(1);
      });
    });
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { TASK_TITLE_MAX_LENGTH } from '../../domain/task';
import { TaskForm } from './task-form';

describe('TaskForm', () => {
  let fixture: ComponentFixture<TaskForm>;
  let loader: HarnessLoader;
  let added: string[];

  beforeEach(async () => {
    fixture = TestBed.createComponent(TaskForm);
    loader = TestbedHarnessEnvironment.loader(fixture);
    added = [];
    fixture.componentInstance.added.subscribe((title) => added.push(title));
    await fixture.whenStable();
  });

  function input(): Promise<MatInputHarness> {
    return loader.getHarness(MatInputHarness);
  }

  function formField(): Promise<MatFormFieldHarness> {
    return loader.getHarness(MatFormFieldHarness);
  }

  async function errors(): Promise<string[]> {
    return (await formField()).getTextErrors();
  }

  async function counter(): Promise<string | undefined> {
    const hints = await (await formField()).getTextHints();
    return hints.find((hint) => hint.includes('/'));
  }

  async function submit(): Promise<void> {
    const button = await loader.getHarness(MatButtonHarness.with({ text: 'Hinzufügen' }));
    await button.click();
  }

  /** Types a title and submits, like a user would. */
  async function add(title: string): Promise<void> {
    await (await input()).setValue(title);
    await submit();
  }

  describe('adding', () => {
    it('emits the typed title', async () => {
      await add('Buy milk');

      expect(added).toEqual(['Buy milk']);
    });

    it('clears the field afterwards without showing an error for the now empty field', async () => {
      await add('Buy milk');

      expect(await (await input()).getValue()).toBe('');
      expect(await errors()).toEqual([]);
    });

    it('can add several tasks in a row', async () => {
      await add('First');
      await add('Second');

      expect(added).toEqual(['First', 'Second']);
    });

    it(`accepts a title of exactly ${TASK_TITLE_MAX_LENGTH} characters`, async () => {
      const longest = 'x'.repeat(TASK_TITLE_MAX_LENGTH);

      await add(longest);

      expect(added).toEqual([longest]);
    });
  });

  describe('validation', () => {
    it('shows no error before the user has done anything', async () => {
      expect(await errors()).toEqual([]);
    });

    it.each([
      ['empty', '', 'Darf nicht leer sein'],
      ['only whitespace', '   ', 'Darf nicht leer sein'],
      [
        'too long',
        'x'.repeat(TASK_TITLE_MAX_LENGTH + 1),
        `Höchstens ${TASK_TITLE_MAX_LENGTH} Zeichen`,
      ],
    ])(
      'shows a German error and emits nothing when the title is %s',
      async (_label, title, message) => {
        await add(title);

        expect(await errors()).toEqual([message]);
        expect(added).toEqual([]);
      },
    );

    it('keeps the invalid text so the user can fix it', async () => {
      const tooLong = 'x'.repeat(TASK_TITLE_MAX_LENGTH + 1);

      await add(tooLong);

      expect(await (await input()).getValue()).toBe(tooLong);
    });

    it('accepts the title once it is fixed', async () => {
      await add('');

      await add('Fixed');

      expect(added).toEqual(['Fixed']);
      expect(await errors()).toEqual([]);
    });
  });

  describe('character counter', () => {
    it('starts at 0', async () => {
      expect(await counter()).toBe(`0 / ${TASK_TITLE_MAX_LENGTH}`);
    });

    it('counts while typing', async () => {
      await (await input()).setValue('Hello');

      expect(await counter()).toBe(`5 / ${TASK_TITLE_MAX_LENGTH}`);
    });

    it('goes back to 0 after adding', async () => {
      await add('Hello');

      expect(await counter()).toBe(`0 / ${TASK_TITLE_MAX_LENGTH}`);
    });
  });
});

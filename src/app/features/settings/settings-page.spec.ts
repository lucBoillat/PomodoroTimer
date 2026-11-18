import { TestBed } from '@angular/core/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { Settings, type SettingsProps } from '../../domain/settings';
import { SettingsPage } from './settings-page';
import { SettingsStore } from './settings-store';

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

describe('SettingsPage', () => {
  let loader: HarnessLoader;
  let store: SettingsStore;

  /** Renders the page. Anything put in localStorage beforehand is what the store loads. */
  async function render(): Promise<void> {
    const fixture = TestBed.createComponent(SettingsPage);
    loader = TestbedHarnessEnvironment.loader(fixture);
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

  async function submit(): Promise<void> {
    const button = await loader.getHarness(MatButtonHarness.with({ text: 'Speichern' }));
    await button.click();
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

      for (const name of Object.keys(LABELS) as FieldName[]) {
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
});

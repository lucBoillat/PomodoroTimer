import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { Break } from '../../domain/break';
import { Task } from '../../domain/task';
import { CurrentPanel } from './current-panel';

const MINUTE = 60_000;

const running = (title = 'Write tests'): Task =>
  Task.create({ title }).start(Date.now(), 25 * MINUTE);
const paused = (title = 'Write tests'): Task => running(title).pause(Date.now());
const shortBreak = (): Break => Break.start('short', Date.now(), 5 * MINUTE);
const longBreak = (): Break => Break.start('long', Date.now(), 15 * MINUTE);

type OutputName = 'pauseTask' | 'resumeTask' | 'complete' | 'endBreak';

describe('CurrentPanel', () => {
  let fixture: ComponentFixture<CurrentPanel>;
  let loader: HarnessLoader;
  let host: HTMLElement;
  let emitted: Record<OutputName, number>;

  async function render(task: Task | null = null, activeBreak: Break | null = null): Promise<void> {
    fixture = TestBed.createComponent(CurrentPanel);
    fixture.componentRef.setInput('task', task);
    fixture.componentRef.setInput('activeBreak', activeBreak);
    loader = TestbedHarnessEnvironment.loader(fixture);
    host = fixture.nativeElement;

    emitted = { pauseTask: 0, resumeTask: 0, complete: 0, endBreak: 0 };
    const panel = fixture.componentInstance;
    for (const name of Object.keys(emitted) as OutputName[]) {
      panel[name].subscribe(() => emitted[name]++);
    }

    await fixture.whenStable();
  }

  async function setInputs(task: Task | null, activeBreak: Break | null): Promise<void> {
    fixture.componentRef.setInput('task', task);
    fixture.componentRef.setInput('activeBreak', activeBreak);
    await fixture.whenStable();
  }

  const text = (selector: string): string | null =>
    host.querySelector(selector)?.textContent?.trim() ?? null;

  /** Button labels in display order, without the icon ligature text. */
  function shownButtons(): string[] {
    return Array.from(host.querySelectorAll('button')).map(
      (button) => button.querySelector('.mdc-button__label')?.textContent?.trim() ?? '',
    );
  }

  async function click(label: string): Promise<void> {
    const button = await loader.getHarness(
      MatButtonHarness.with({ text: new RegExp(`${label}$`) }),
    );
    await button.click();
  }

  describe('nothing active', () => {
    it('shows a hint and no buttons', async () => {
      await render();

      expect(text('.empty')).toBe('Keine aktive Aufgabe');
      expect(text('.title')).toBeNull();
      expect(shownButtons()).toEqual([]);
    });
  });

  describe('running task', () => {
    it('shows the title, the state and Pausieren + Erledigt', async () => {
      await render(running('Buy milk'));

      expect(text('.kicker')).toBe('Läuft');
      expect(text('.title')).toBe('Buy milk');
      expect(shownButtons()).toEqual(['Pausieren', 'Erledigt']);
    });

    it.each<[string, OutputName]>([
      ['Pausieren', 'pauseTask'],
      ['Erledigt', 'complete'],
    ])('emits when "%s" is clicked', async (label, output) => {
      await render(running());

      await click(label);

      expect(emitted[output]).toBe(1);
      expect(Object.values(emitted).reduce((a, b) => a + b)).toBe(1); // nothing else
    });
  });

  describe('paused task', () => {
    it('shows the title, the state and Fortsetzen + Erledigt', async () => {
      await render(paused('Buy milk'));

      expect(text('.kicker')).toBe('Pausiert');
      expect(text('.title')).toBe('Buy milk');
      expect(shownButtons()).toEqual(['Fortsetzen', 'Erledigt']);
    });

    it.each<[string, OutputName]>([
      ['Fortsetzen', 'resumeTask'],
      ['Erledigt', 'complete'],
    ])('emits when "%s" is clicked', async (label, output) => {
      await render(paused());

      await click(label);

      expect(emitted[output]).toBe(1);
      expect(Object.values(emitted).reduce((a, b) => a + b)).toBe(1);
    });
  });

  describe('break', () => {
    it.each([
      ['short', shortBreak, 'Kurze Pause'],
      ['long', longBreak, 'Lange Pause'],
    ])('labels a %s break as "%s"', async (_kind, make, label) => {
      await render(null, make());

      expect(text('.kicker')).toBe('Pause');
      expect(text('.title')).toBe(label);
      expect(shownButtons()).toEqual(['Pause beenden']);
    });

    it('emits endBreak when "Pause beenden" is clicked', async () => {
      await render(null, shortBreak());

      await click('Pause beenden');

      expect(emitted.endBreak).toBe(1);
    });
  });

  describe('switching', () => {
    it('prefers the task if both a task and a break are given', async () => {
      await render(running('Buy milk'), shortBreak());

      expect(text('.title')).toBe('Buy milk');
      expect(shownButtons()).not.toContain('Pause beenden');
    });

    it('follows the inputs: task → paused → break → nothing', async () => {
      await render(running('Buy milk'));
      expect(shownButtons()).toEqual(['Pausieren', 'Erledigt']);

      await setInputs(paused('Buy milk'), null);
      expect(shownButtons()).toEqual(['Fortsetzen', 'Erledigt']);

      await setInputs(null, longBreak());
      expect(text('.title')).toBe('Lange Pause');

      await setInputs(null, null);
      expect(text('.empty')).toBe('Keine aktive Aufgabe');
    });
  });

  describe('accessibility', () => {
    it('announces changes politely', async () => {
      await render();

      expect(host.querySelector('[aria-live]')?.getAttribute('aria-live')).toBe('polite');
    });

    it('uses the task title as a heading', async () => {
      await render(running('Buy milk'));

      expect(host.querySelector('h2')?.textContent?.trim()).toBe('Buy milk');
    });
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { Break } from '../../domain/break';
import { Task } from '../../domain/task';
import type { BreakCycle } from './break-store';
import { CurrentPanel } from './current-panel';

const MINUTE = 60_000;

const NOW = new Date('2026-01-01T12:00:00Z').getTime();

// All tasks and breaks start at NOW; tests move `now` instead of waiting.
const running = (title = 'Write tests'): Task => Task.create({ title }).start(NOW, 25 * MINUTE);
const paused = (title = 'Write tests'): Task => running(title).pause(NOW + 5 * MINUTE); // 20 min left
const shortBreak = (): Break => Break.start('short', NOW, 5 * MINUTE);
const longBreak = (): Break => Break.start('long', NOW, 15 * MINUTE);

type OutputName = 'pauseTask' | 'resumeTask' | 'complete' | 'endBreak';

describe('CurrentPanel', () => {
  let fixture: ComponentFixture<CurrentPanel>;
  let loader: HarnessLoader;
  let host: HTMLElement;
  let emitted: Record<OutputName, number>;

  async function render(
    task: Task | null = null,
    activeBreak: Break | null = null,
    now = NOW,
  ): Promise<void> {
    fixture = TestBed.createComponent(CurrentPanel);
    fixture.componentRef.setInput('task', task);
    fixture.componentRef.setInput('activeBreak', activeBreak);
    fixture.componentRef.setInput('now', now);
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

  /** Lets time pass, like the Clock ticking. */
  async function setNow(now: number): Promise<void> {
    fixture.componentRef.setInput('now', now);
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

  describe('time', () => {
    const SECOND = 1000;

    it('shows no time when nothing is active', async () => {
      await render();

      expect(text('.time')).toBeNull();
    });

    it('shows the full duration right after the start', async () => {
      await render(running());

      expect(text('.time')).toBe('25:00');
    });

    it('counts down as time passes', async () => {
      await render(running());

      await setNow(NOW + SECOND);
      expect(text('.time')).toBe('24:59');

      await setNow(NOW + 12 * MINUTE + 30 * SECOND);
      expect(text('.time')).toBe('12:30');
    });

    it('stands still while paused', async () => {
      await render(paused());
      expect(text('.time')).toBe('20:00');

      await setNow(NOW + 10 * MINUTE);

      expect(text('.time')).toBe('20:00');
      expect(text('.kicker')).toBe('Pausiert');
    });

    it('counts down a break', async () => {
      await render(null, shortBreak(), NOW + 2 * MINUTE);

      expect(text('.time')).toBe('03:00');
    });

    it('marks the time as a timer, so it is not read out every second', async () => {
      await render(running());

      const time = host.querySelector('.time');
      expect(time?.getAttribute('role')).toBe('timer');
      expect(time?.closest('[aria-live]')).toBeNull();
    });
  });

  describe('overdue task', () => {
    const SECOND = 1000;

    it('is not overdue one millisecond before the end', async () => {
      await render(running(), null, NOW + 25 * MINUTE - 1);

      expect(text('.kicker')).toBe('Läuft');
      expect(text('.time')).toBe('00:00');
      expect(shownButtons()).toEqual(['Pausieren', 'Erledigt']);
    });

    it('becomes overdue exactly at the end', async () => {
      await render(running(), null, NOW + 25 * MINUTE);

      expect(text('.kicker')).toBe('Überfällig');
      expect(text('.time')).toBe('+00:00');
    });

    it('switches to overdue while it is shown', async () => {
      await render(running());

      await setNow(NOW + 25 * MINUTE + 3 * SECOND);

      expect(text('.kicker')).toBe('Überfällig');
      expect(text('.time')).toBe('+00:03');
    });

    it('counts the time over upwards', async () => {
      await render(running(), null, NOW + 27 * MINUTE + 15 * SECOND);

      expect(text('.time')).toBe('+02:15');
    });

    it('switches to hours after a long time', async () => {
      await render(running(), null, NOW + 25 * MINUTE + 61 * MINUTE);

      expect(text('.time')).toBe('+1:01:00');
    });

    it('only offers "Erledigt", because it can no longer be paused', async () => {
      await render(running(), null, NOW + 26 * MINUTE);

      expect(shownButtons()).toEqual(['Erledigt']);
    });

    it('still emits complete', async () => {
      await render(running(), null, NOW + 26 * MINUTE);

      await click('Erledigt');

      expect(emitted.complete).toBe(1);
    });

    it('highlights the label and the time', async () => {
      await render(running(), null, NOW + 26 * MINUTE);

      expect(host.querySelector('.kicker')?.classList).toContain('overdue');
      expect(host.querySelector('.time')?.classList).toContain('overdue');
    });

    it('is not highlighted while running in time', async () => {
      await render(running());

      expect(host.querySelectorAll('.overdue').length).toBe(0);
    });
  });

  describe('break over', () => {
    it('says the break is over once its time is up', async () => {
      await render(null, shortBreak(), NOW + 5 * MINUTE);

      expect(text('.kicker')).toBe('Pause vorbei');
      expect(text('.title')).toBe('Kurze Pause');
      expect(text('.time')).toBe('00:00');
    });

    it('stays until it is ended', async () => {
      await render(null, shortBreak(), NOW + 60 * MINUTE);

      expect(text('.time')).toBe('00:00'); // no "+" for breaks
      expect(shownButtons()).toEqual(['Pause beenden']);
    });

    it('switches while it is shown', async () => {
      await render(null, shortBreak());
      expect(text('.kicker')).toBe('Pause');

      await setNow(NOW + 5 * MINUTE);

      expect(text('.kicker')).toBe('Pause vorbei');
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

  describe('break cycle', () => {
    async function renderCycle(
      cycle: BreakCycle,
      task: Task | null = null,
      activeBreak: Break | null = null,
    ): Promise<void> {
      await render(task, activeBreak);
      fixture.componentRef.setInput('cycle', cycle);
      await fixture.whenStable();
    }

    const filledDots = (): number => host.querySelectorAll('.dot.filled').length;
    const allDots = (): number => host.querySelectorAll('.dot').length;

    it('shows one dot per pomodoro of the round, filled for the finished ones', async () => {
      await renderCycle({ done: 2, length: 4, nextBreak: 'short' }, running());

      expect(allDots()).toBe(4);
      expect(filledDots()).toBe(2);
    });

    it.each([
      [0, 'Lange Pause nach 4 Pomodoros'],
      [1, 'Lange Pause nach 3 Pomodoros'],
      [2, 'Lange Pause nach 2 Pomodoros'],
    ])('says how far the long break is (%i done)', async (done, message) => {
      await renderCycle({ done, length: 4, nextBreak: 'short' });

      expect(text('.cycle-text')).toBe(message);
    });

    it('announces the long break as next', async () => {
      await renderCycle({ done: 3, length: 4, nextBreak: 'long' }, running());

      expect(text('.cycle-text')).toBe('Als Nächstes: lange Pause');
    });

    it('celebrates the finished round during the long break', async () => {
      await renderCycle({ done: 4, length: 4, nextBreak: 'short' }, null, longBreak());

      expect(text('.cycle-text')).toBe('Runde geschafft – lange Pause');
      expect(filledDots()).toBe(4);
    });

    it('is shown even when nothing is active', async () => {
      await renderCycle({ done: 1, length: 4, nextBreak: 'short' });

      expect(text('.empty')).toBe('Keine aktive Aufgabe');
      expect(text('.cycle-text')).toBe('Lange Pause nach 3 Pomodoros');
    });

    it('hides the dots from screen readers; the text carries the information', async () => {
      await renderCycle({ done: 1, length: 4, nextBreak: 'short' });

      expect(host.querySelector('.dots')?.getAttribute('aria-hidden')).toBe('true');
    });
  });
});

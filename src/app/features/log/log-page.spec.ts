import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { Clock } from '../../core/clock';
import { EventBus } from '../../core/event-bus';
import type { AppEvent } from '../../domain/app-event';
import { LogPage } from './log-page';
import { LogStore, type LogEntry } from './log-store';

const LOG_KEY = 'pomodoro.log';
// Local time on purpose: "today" is decided in the user's time zone.
const TODAY_NOON = new Date(2026, 0, 15, 12, 0, 0).getTime();
const YESTERDAY = new Date(2026, 0, 14, 18, 30, 0).getTime();

function entry(event: AppEvent, at: number): LogEntry {
  return { id: crypto.randomUUID(), at, event };
}

describe('LogPage', () => {
  let now: WritableSignal<number>;
  let host: HTMLElement;
  let loader: HarnessLoader;
  let fixture: ReturnType<typeof TestBed.createComponent<LogPage>>;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY_NOON);
    now = signal(TODAY_NOON);
    TestBed.configureTestingModule({ providers: [{ provide: Clock, useValue: { now } }] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function render(...entries: LogEntry[]): Promise<void> {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries));
    fixture = TestBed.createComponent(LogPage);
    host = fixture.nativeElement;
    loader = TestbedHarnessEnvironment.loader(fixture);
    await fixture.whenStable();
  }

  const items = (): HTMLElement[] => Array.from(host.querySelectorAll('.log li'));
  const texts = (): string[] =>
    items().map((li) => li.querySelector('.text')?.textContent?.trim() ?? '');
  const times = (): string[] =>
    items().map((li) => li.querySelector('time')?.textContent?.trim() ?? '');

  function clearButton(): Promise<MatButtonHarness> {
    return loader.getHarness(MatButtonHarness.with({ text: /Log leeren$/ }));
  }

  describe('empty', () => {
    it('shows a hint and no list', async () => {
      await render();

      expect(host.textContent).toContain('Noch keine Ereignisse.');
      expect(host.querySelector('.log')).toBeNull();
    });

    it('disables "Log leeren"', async () => {
      await render();

      expect(await (await clearButton()).isDisabled()).toBe(true);
    });
  });

  describe('entries', () => {
    it('shows the German text of each entry, newest first', async () => {
      await render(
        entry({ type: 'break-started', kind: 'short' }, TODAY_NOON),
        entry({ type: 'task-completed', title: 'Write tests' }, TODAY_NOON - 1000),
      );

      expect(texts()).toEqual(['Kurze Pause gestartet', 'Aufgabe „Write tests“ erledigt']);
      expect(host.textContent).not.toContain('Noch keine Ereignisse.');
    });

    it('shows only the time for entries from today', async () => {
      await render(entry({ type: 'app-reset' }, new Date(2026, 0, 15, 9, 5, 7).getTime()));

      expect(times()).toEqual(['09:05:07']);
    });

    it('adds the date for older entries', async () => {
      await render(entry({ type: 'app-reset' }, YESTERDAY));

      expect(times()).toEqual(['14.01.2026 18:30']);
    });

    it('puts a machine-readable timestamp on <time>', async () => {
      await render(entry({ type: 'app-reset' }, new Date(2026, 0, 15, 9, 5, 7).getTime()));

      expect(host.querySelector('time')?.getAttribute('datetime')).toBe('2026-01-15T09:05:07');
    });

    it('shows the matching icon, hidden from screen readers', async () => {
      await render(entry({ type: 'task-paused', title: 'A' }, TODAY_NOON));

      const icon = host.querySelector('.log mat-icon');
      expect(icon?.textContent?.trim()).toBe('pause');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
    });

    it('highlights alerts only', async () => {
      await render(
        entry({ type: 'task-overdue', title: 'A' }, TODAY_NOON),
        entry({ type: 'task-started', title: 'A' }, TODAY_NOON - 1000),
      );

      expect(items().map((li) => li.classList.contains('alert'))).toEqual([true, false]);
    });

    it('enables "Log leeren"', async () => {
      await render(entry({ type: 'app-reset' }, TODAY_NOON));

      expect(await (await clearButton()).isDisabled()).toBe(false);
    });
  });

  describe('live', () => {
    it('shows new events as they happen', async () => {
      await render();

      vi.setSystemTime(TODAY_NOON + 5000);
      TestBed.inject(EventBus).emit({ type: 'task-added', title: 'Buy milk' });
      await fixture.whenStable();

      expect(texts()).toEqual(['Aufgabe „Buy milk“ hinzugefügt']);
      expect(times()).toEqual(['12:00:05']);
    });

    it("switches today's entries to the date format after midnight", async () => {
      await render(entry({ type: 'app-reset' }, TODAY_NOON));
      expect(times()).toEqual(['12:00:00']);

      now.set(new Date(2026, 0, 16, 0, 0, 1).getTime());
      await fixture.whenStable();

      expect(times()).toEqual(['15.01.2026 12:00']);
    });
  });

  describe('Log leeren', () => {
    it('empties the log', async () => {
      await render(entry({ type: 'app-reset' }, TODAY_NOON));

      await (await clearButton()).click();

      expect(TestBed.inject(LogStore).entries()).toEqual([]);
      expect(host.textContent).toContain('Noch keine Ereignisse.');
    });
  });
});

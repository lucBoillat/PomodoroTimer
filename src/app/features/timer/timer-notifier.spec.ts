import { Component, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSnackBarHarness } from '@angular/material/snack-bar/testing';
import { Clock } from '../../core/clock';
import { EventBus } from '../../core/event-bus';
import type { AppEvent } from '../../domain/app-event';
import type { TaskState } from '../../domain/task';
import { BreakStore } from './break-store';
import { TaskStore } from './task-store';
import { TimerNotifier } from './timer-notifier';

const TASKS_KEY = 'pomodoro.tasks';
const BREAK_KEY = 'pomodoro.break';
const MINUTE = 60_000;
const T0 = Date.now();

/** The snackbar lives in an overlay; the harness needs some fixture to find the document. */
@Component({ template: '' })
class Host {}

function seedTask(title: string, state: TaskState): string {
  const id = crypto.randomUUID();
  const existing = JSON.parse(localStorage.getItem(TASKS_KEY) ?? '[]') as unknown[];
  localStorage.setItem(TASKS_KEY, JSON.stringify([...existing, { id, title, state }]));
  return id;
}

function seedBreak(endsAt: number, kind: 'short' | 'long' = 'short'): void {
  localStorage.setItem(BREAK_KEY, JSON.stringify({ kind, endsAt }));
}

describe('TimerNotifier', () => {
  let now: WritableSignal<number>;
  let fixture: ComponentFixture<Host>;
  let loader: HarnessLoader;
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    now = signal(T0);
    // A Clock we move by hand: no interval, no fake timers needed.
    TestBed.configureTestingModule({ providers: [{ provide: Clock, useValue: { now } }] });
  });

  /** Starts the notifier, like the app initializer does. Seed storage before calling this. */
  async function start(): Promise<void> {
    fixture = TestBed.createComponent(Host);
    loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    openSpy = vi.spyOn(TestBed.inject(MatSnackBar), 'open');
    TestBed.inject(TimerNotifier);
    await settle();
  }

  /** Runs the effects and waits until the snackbar has rendered. */
  async function settle(): Promise<void> {
    TestBed.tick();
    await fixture.whenStable();
  }

  async function tickTo(time: number): Promise<void> {
    now.set(time);
    await settle();
  }

  function snackBars(): Promise<MatSnackBarHarness[]> {
    return loader.getAllHarnesses(MatSnackBarHarness);
  }

  async function snackBar(): Promise<MatSnackBarHarness> {
    const all = await snackBars();
    expect(all).toHaveLength(1);
    return all[0];
  }

  /** Dismissing animates out; wait until it is really gone. */
  async function expectNoSnackBar(): Promise<void> {
    await vi.waitFor(async () => expect(await snackBars()).toHaveLength(0));
  }

  describe('overdue task', () => {
    it('shows nothing while the task is still in time', async () => {
      seedTask('Write tests', { status: 'running', endsAt: T0 + 25 * MINUTE });
      await start();

      await tickTo(T0 + 25 * MINUTE - 1);

      expect(await snackBars()).toHaveLength(0);
    });

    it('shows a message with the title as soon as the time runs out', async () => {
      seedTask('Write tests', { status: 'running', endsAt: T0 + 25 * MINUTE });
      await start();

      await tickTo(T0 + 25 * MINUTE);

      const bar = await snackBar();
      expect(await bar.getMessage()).toBe('Zeit abgelaufen: „Write tests“');
      expect(await bar.getActionDescription()).toBe('Erledigt');
    });

    it('announces it assertively, since it is an alarm', async () => {
      seedTask('Write tests', { status: 'running', endsAt: T0 });
      await start();

      expect(await (await snackBar()).getAriaLive()).toBe('assertive');
    });

    it('shows it only once, not on every tick', async () => {
      seedTask('Write tests', { status: 'running', endsAt: T0 + MINUTE });
      await start();

      for (let i = 0; i < 5; i++) await tickTo(T0 + MINUTE + i * 1000);

      expect(openSpy).toHaveBeenCalledTimes(1);
    });

    it('stays open until the user reacts', async () => {
      seedTask('Write tests', { status: 'running', endsAt: T0 });
      await start();

      await new Promise((resolve) => setTimeout(resolve, 100));
      await tickTo(T0 + 60 * MINUTE);

      expect(await snackBars()).toHaveLength(1);
    });

    it('shows it right away after a reload with an already overdue task', async () => {
      seedTask('Write tests', { status: 'running', endsAt: T0 - 5 * MINUTE });

      await start();

      expect(await (await snackBar()).getMessage()).toContain('Write tests');
    });

    it('never fires for a paused task', async () => {
      seedTask('Write tests', { status: 'paused', remainingMs: MINUTE });
      await start();

      await tickTo(T0 + 60 * MINUTE);

      expect(openSpy).not.toHaveBeenCalled();
    });

    it('never fires for pending or done tasks', async () => {
      seedTask('Pending', { status: 'pending' });
      seedTask('Done', { status: 'done' });
      await start();

      await tickTo(T0 + 60 * MINUTE);

      expect(openSpy).not.toHaveBeenCalled();
    });

    it('completes the task with the "Erledigt" action', async () => {
      const id = seedTask('Write tests', { status: 'running', endsAt: T0 });
      await start();

      await (await snackBar()).dismissWithAction();
      await settle();

      const taskStore = TestBed.inject(TaskStore);
      expect(
        taskStore
          .tasks()
          .find((t) => t.id === id)
          ?.isDone(),
      ).toBe(true);
      expect(TestBed.inject(BreakStore).currentBreak()).not.toBeNull(); // the usual break follows
    });

    it('closes by itself when the task is completed elsewhere', async () => {
      const id = seedTask('Write tests', { status: 'running', endsAt: T0 });
      await start();
      expect(await snackBars()).toHaveLength(1);

      TestBed.inject(TaskStore).complete(id);
      await settle();

      await expectNoSnackBar();
    });

    it('fires again for the next task that runs out', async () => {
      const first = seedTask('First', { status: 'running', endsAt: T0 });
      const second = seedTask('Second', { status: 'pending' });
      await start();
      const taskStore = TestBed.inject(TaskStore);

      taskStore.complete(first);
      TestBed.inject(BreakStore).end();
      taskStore.start(second); // uses Date.now(); 25 min by default
      await tickTo(Date.now() + 25 * MINUTE);

      expect(openSpy).toHaveBeenCalledTimes(2);
      expect(await (await snackBar()).getMessage()).toBe('Zeit abgelaufen: „Second“');
    });
  });

  describe('break over', () => {
    it('shows nothing while the break is running', async () => {
      seedBreak(T0 + 5 * MINUTE);
      await start();

      await tickTo(T0 + 5 * MINUTE - 1);

      expect(await snackBars()).toHaveLength(0);
    });

    it('says the break is over as soon as its time is up', async () => {
      seedBreak(T0 + 5 * MINUTE);
      await start();

      await tickTo(T0 + 5 * MINUTE);

      const bar = await snackBar();
      expect(await bar.getMessage()).toBe('Pause vorbei');
      expect(await bar.getActionDescription()).toBe('Pause beenden');
      expect(await bar.getAriaLive()).toBe('assertive');
    });

    it.each(['short', 'long'] as const)('works for a %s break', async (kind) => {
      seedBreak(T0, kind);

      await start();

      expect(await (await snackBar()).getMessage()).toBe('Pause vorbei');
    });

    it('shows it only once, not on every tick', async () => {
      seedBreak(T0 + MINUTE);
      await start();

      for (let i = 0; i < 5; i++) await tickTo(T0 + MINUTE + i * 1000);

      expect(openSpy).toHaveBeenCalledTimes(1);
    });

    it('shows it right away after a reload with a break that is already over', async () => {
      seedBreak(T0 - MINUTE);

      await start();

      expect(await snackBars()).toHaveLength(1);
    });

    it('ends the break with the "Pause beenden" action', async () => {
      seedBreak(T0);
      await start();

      await (await snackBar()).dismissWithAction();
      await settle();

      expect(TestBed.inject(BreakStore).currentBreak()).toBeNull();
    });

    it('closes by itself when the break is ended elsewhere', async () => {
      seedBreak(T0);
      await start();

      TestBed.inject(BreakStore).end();
      await settle();

      await expectNoSnackBar();
    });

    it('closes by itself when the next task is started', async () => {
      seedBreak(T0);
      const id = seedTask('Next', { status: 'pending' });
      await start();

      TestBed.inject(TaskStore).start(id);
      await settle();

      await expectNoSnackBar();
    });
  });

  describe('events', () => {
    /** Registers before the notifier starts, so nothing is missed. */
    function recordEvents(): AppEvent[] {
      const received: AppEvent[] = [];
      TestBed.inject(EventBus).on((event) => received.push(event));
      return received;
    }

    it('emits task-overdue once when the time runs out', async () => {
      seedTask('Write tests', { status: 'running', endsAt: T0 + MINUTE });
      const events = recordEvents();
      await start();

      for (let i = 0; i < 3; i++) await tickTo(T0 + MINUTE + i * 1000);

      expect(events).toEqual([{ type: 'task-overdue', title: 'Write tests' }]);
    });

    it('emits nothing while the task is in time', async () => {
      seedTask('Write tests', { status: 'running', endsAt: T0 + MINUTE });
      const events = recordEvents();
      await start();

      await tickTo(T0 + MINUTE - 1);

      expect(events).toEqual([]);
    });

    it.each(['short', 'long'] as const)('emits break-over once for a %s break', async (kind) => {
      seedBreak(T0 + MINUTE, kind);
      const events = recordEvents();
      await start();

      for (let i = 0; i < 3; i++) await tickTo(T0 + MINUTE + i * 1000);

      expect(events).toEqual([{ type: 'break-over', kind }]);
    });
  });
});

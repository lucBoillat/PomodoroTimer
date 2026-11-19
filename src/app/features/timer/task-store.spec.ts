import { TestBed } from '@angular/core/testing';
import { EventBus } from '../../core/event-bus';
import type { AppEvent } from '../../domain/app-event';
import { InvalidTransitionError, Task, type TaskProps, type TaskState } from '../../domain/task';
import { Settings } from '../../domain/settings';
import { SettingsStore } from '../settings/settings-store';
import { BreakStore } from './break-store';
import { SAMPLE_TASKS } from './sample-tasks';
import { TaskStore } from './task-store';

const STORAGE_KEY = 'pomodoro.tasks';
const NOW = new Date('2026-01-01T10:00:00Z').getTime();
const MINUTE = 60_000;
const DEFAULT_POMODORO_MS = 25 * MINUTE;

/** Raw task data as it would sit in localStorage. */
function rawTask(title: string, state: TaskState = { status: 'pending' }): TaskProps {
  return { id: crypto.randomUUID(), title, state };
}

function seed(...tasks: unknown[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function stored(): unknown {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

/** Creates a fresh store. Anything put in localStorage beforehand is what it loads. */
function createStore(): TaskStore {
  return TestBed.inject(TaskStore);
}

function byTitle(store: TaskStore, title: string): Task {
  const task = store.tasks().find((t) => t.title === title);
  if (!task) throw new Error(`No task titled "${title}"`);
  return task;
}

/** Moves the fake clock forward. */
function advance(ms: number): void {
  vi.setSystemTime(Date.now() + ms);
}

describe('TaskStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Only fake Date: Angular's scheduling keeps using real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loading', () => {
    it('starts with an empty list when nothing is stored', () => {
      expect(createStore().tasks()).toEqual([]);
    });

    it('loads stored tasks in their stored order', () => {
      seed(rawTask('A'), rawTask('B'), rawTask('C'));

      expect(
        createStore()
          .tasks()
          .map((t) => t.title),
      ).toEqual(['A', 'B', 'C']);
    });

    it('loads stored tasks as Task instances with their id and state', () => {
      const paused = rawTask('Paused', { status: 'paused', remainingMs: 3 * MINUTE });
      seed(paused);

      const [task] = createStore().tasks();

      expect(task).toBeInstanceOf(Task);
      expect(task.toJSON()).toEqual(paused);
    });

    it.each([
      ['broken JSON', '[{"id":'],
      ['the text "undefined"', 'undefined'],
      ['null', 'null'],
      ['an object instead of an array', '{"title":"A"}'],
      ['a number', '42'],
    ])('starts with an empty list when storage holds %s', (_label, raw) => {
      localStorage.setItem(STORAGE_KEY, raw);

      expect(createStore().tasks()).toEqual([]);
    });

    it('skips invalid items but keeps the valid ones', () => {
      seed(
        rawTask('A'),
        { ...rawTask('bad id'), id: 'not-a-uuid' },
        { ...rawTask(''), title: '' },
        rawTask('B'),
        { ...rawTask('bad state'), state: { status: 'flying' } },
        null,
        'just a string',
        rawTask('C'),
      );

      expect(
        createStore()
          .tasks()
          .map((t) => t.title),
      ).toEqual(['A', 'B', 'C']);
    });

    it('restores a running task whose time ran out while the app was closed as overdue', () => {
      seed(rawTask('Old', { status: 'running', endsAt: NOW - MINUTE }));

      const task = byTitle(createStore(), 'Old');

      expect(task.isRunning()).toBe(true);
      expect(task.isOverdue(Date.now())).toBe(true);
    });
  });

  describe('saving', () => {
    it('writes the loaded tasks back on startup, dropping invalid items', () => {
      const valid = rawTask('A');
      seed(valid, { title: 'no id' });

      createStore();
      TestBed.tick(); // run pending effects

      expect(stored()).toEqual([valid]);
    });

    it('persists every change', () => {
      const store = createStore();

      store.add('A');
      TestBed.tick();

      expect(stored()).toEqual([byTitle(store, 'A').toJSON()]);
    });

    it('restores everything in a new store (simulated page reload)', () => {
      const store = createStore();
      store.add('Pending');
      store.add('Running');
      store.start(byTitle(store, 'Running').id);
      TestBed.tick();
      const before = store.tasks().map((t) => t.toJSON());

      TestBed.resetTestingModule(); // throw away the old store instance

      expect(
        createStore()
          .tasks()
          .map((t) => t.toJSON()),
      ).toEqual(before);
    });
  });

  describe('add', () => {
    it('appends a pending task with the given title', () => {
      const store = createStore();

      store.add('First');
      store.add('Second');

      expect(store.tasks().map((t) => t.title)).toEqual(['First', 'Second']);
      expect(byTitle(store, 'Second').isPending()).toBe(true);
    });

    it('gives every task its own id', () => {
      const store = createStore();

      store.add('Same');
      store.add('Same');

      const [a, b] = store.tasks();
      expect(a.id).not.toBe(b.id);
    });

    it('trims the title', () => {
      const store = createStore();

      store.add('  Padded  ');

      expect(store.tasks()[0].title).toBe('Padded');
    });

    it.each([
      ['empty', ''],
      ['only whitespace', '   '],
      ['longer than 40 characters', 'x'.repeat(41)],
    ])('rejects a title that is %s and leaves the list unchanged', (_label, title) => {
      const store = createStore();
      store.add('Existing');

      expect(() => store.add(title)).toThrow();
      expect(store.tasks().map((t) => t.title)).toEqual(['Existing']);
    });
  });

  describe('edit', () => {
    it('changes the title of the matching task only', () => {
      const store = createStore();
      store.add('A');
      store.add('B');
      const { id } = byTitle(store, 'A');

      store.edit(id, 'A renamed');

      expect(store.tasks().map((t) => t.title)).toEqual(['A renamed', 'B']);
      expect(store.tasks()[0].id).toBe(id);
    });

    it('can edit a done task', () => {
      seed(rawTask('Done', { status: 'done' }));
      const store = createStore();

      store.edit(byTitle(store, 'Done').id, 'Done renamed');

      expect(store.tasks()[0].title).toBe('Done renamed');
    });

    it.each<[string, TaskState]>([
      ['running', { status: 'running', endsAt: NOW + MINUTE }],
      ['paused', { status: 'paused', remainingMs: MINUTE }],
    ])('refuses to edit a %s task and leaves it unchanged', (_label, state) => {
      const task = rawTask('Active', state);
      seed(task);
      const store = createStore();

      expect(() => store.edit(task.id, 'New')).toThrow(InvalidTransitionError);
      expect(store.tasks()[0].toJSON()).toEqual(task);
    });

    it('rejects an invalid title and leaves the task unchanged', () => {
      const store = createStore();
      store.add('A');

      expect(() => store.edit(byTitle(store, 'A').id, '')).toThrow();
      expect(store.tasks()[0].title).toBe('A');
    });

    it('does nothing for an unknown id', () => {
      const store = createStore();
      store.add('A');
      const before = store.tasks();

      store.edit(crypto.randomUUID(), 'New');

      expect(store.tasks().map((t) => t.toJSON())).toEqual(before.map((t) => t.toJSON()));
    });
  });

  describe('delete', () => {
    it('removes the matching task only', () => {
      const store = createStore();
      store.add('A');
      store.add('B');
      store.add('C');

      store.delete(byTitle(store, 'B').id);

      expect(store.tasks().map((t) => t.title)).toEqual(['A', 'C']);
    });

    it('can delete a done task', () => {
      seed(rawTask('Done', { status: 'done' }));
      const store = createStore();

      store.delete(byTitle(store, 'Done').id);

      expect(store.tasks()).toEqual([]);
    });

    it('does nothing for an unknown id', () => {
      const store = createStore();
      store.add('A');

      store.delete(crypto.randomUUID());

      expect(store.tasks().map((t) => t.title)).toEqual(['A']);
    });

    // Task.canDelete() says active tasks can't be deleted; the store has to enforce it.
    it.each<[string, TaskState]>([
      ['running', { status: 'running', endsAt: NOW + MINUTE }],
      ['paused', { status: 'paused', remainingMs: MINUTE }],
    ])('refuses to delete a %s task', (_label, state) => {
      const task = rawTask('Active', state);
      seed(task);
      const store = createStore();

      expect(() => store.delete(task.id)).toThrow(InvalidTransitionError);
      expect(store.tasks().map((t) => t.toJSON())).toEqual([task]);
    });
  });

  describe('start', () => {
    it('starts a pending task with the pomodoro duration from the settings', () => {
      const store = createStore();
      store.add('A');

      store.start(byTitle(store, 'A').id);

      expect(byTitle(store, 'A').state).toEqual({
        status: 'running',
        endsAt: NOW + DEFAULT_POMODORO_MS,
      });
    });

    it('uses the current settings, not the ones from when the store was created', () => {
      const store = createStore();
      TestBed.inject(SettingsStore).update(Settings.create({ pomodoroMinutes: 50 }));
      store.add('A');

      store.start(byTitle(store, 'A').id);

      expect(byTitle(store, 'A').state).toEqual({ status: 'running', endsAt: NOW + 50 * MINUTE });
    });

    it('becomes the active task', () => {
      const store = createStore();
      store.add('A');

      store.start(byTitle(store, 'A').id);

      expect(store.activeTask()?.title).toBe('A');
    });

    it.each<[string, TaskState]>([
      ['running', { status: 'running', endsAt: NOW + MINUTE }],
      ['paused', { status: 'paused', remainingMs: MINUTE }],
      ['overdue', { status: 'running', endsAt: NOW - MINUTE }],
    ])('refuses to start while another task is %s', (_label, state) => {
      const pendingTask = rawTask('Pending');
      seed(rawTask('Active', state), pendingTask);
      const store = createStore();

      expect(() => store.start(pendingTask.id)).toThrow();
      expect(byTitle(store, 'Pending').isPending()).toBe(true);
    });

    it('can start a task when the other tasks are only pending or done', () => {
      seed(rawTask('Done', { status: 'done' }), rawTask('Pending'), rawTask('Next'));
      const store = createStore();

      store.start(byTitle(store, 'Next').id);

      expect(byTitle(store, 'Next').isRunning()).toBe(true);
    });

    it('refuses to restart a done task', () => {
      const done = rawTask('Done', { status: 'done' });
      seed(done);
      const store = createStore();

      expect(() => store.start(done.id)).toThrow(InvalidTransitionError);
      expect(byTitle(store, 'Done').isDone()).toBe(true);
    });

    it('does nothing for an unknown id', () => {
      const store = createStore();
      store.add('A');

      store.start(crypto.randomUUID());

      expect(byTitle(store, 'A').isPending()).toBe(true);
      expect(store.activeTask()).toBeNull();
    });
  });

  describe('pause', () => {
    it('pauses a running task and keeps the remaining time', () => {
      const store = createStore();
      store.add('A');
      const { id } = byTitle(store, 'A');
      store.start(id);
      advance(10 * MINUTE);

      store.pause(id);

      expect(byTitle(store, 'A').state).toEqual({
        status: 'paused',
        remainingMs: DEFAULT_POMODORO_MS - 10 * MINUTE,
      });
    });

    it('keeps the paused task as the active task', () => {
      const store = createStore();
      store.add('A');
      const { id } = byTitle(store, 'A');
      store.start(id);

      store.pause(id);

      expect(store.activeTask()?.id).toBe(id);
    });

    it('refuses to pause an overdue task', () => {
      const store = createStore();
      store.add('A');
      const { id } = byTitle(store, 'A');
      store.start(id);
      advance(DEFAULT_POMODORO_MS);

      expect(() => store.pause(id)).toThrow(InvalidTransitionError);
      expect(byTitle(store, 'A').isRunning()).toBe(true);
    });

    it('refuses to pause a pending task', () => {
      const store = createStore();
      store.add('A');

      expect(() => store.pause(byTitle(store, 'A').id)).toThrow(InvalidTransitionError);
    });
  });

  describe('resume', () => {
    it('resumes a paused task with the remaining time from now', () => {
      const store = createStore();
      store.add('A');
      const { id } = byTitle(store, 'A');
      store.start(id);
      advance(10 * MINUTE);
      store.pause(id);
      advance(60 * MINUTE); // time spent paused doesn't count

      store.resume(id);

      expect(byTitle(store, 'A').state).toEqual({
        status: 'running',
        endsAt: Date.now() + DEFAULT_POMODORO_MS - 10 * MINUTE,
      });
    });

    it('refuses to resume a running task', () => {
      const store = createStore();
      store.add('A');
      const { id } = byTitle(store, 'A');
      store.start(id);

      expect(() => store.resume(id)).toThrow(InvalidTransitionError);
    });
  });

  describe('complete', () => {
    it.each<[string, TaskState]>([
      ['running', { status: 'running', endsAt: NOW + MINUTE }],
      ['overdue', { status: 'running', endsAt: NOW - MINUTE }],
      ['paused', { status: 'paused', remainingMs: MINUTE }],
    ])('marks a %s task as done', (_label, state) => {
      const task = rawTask('A', state);
      seed(task);
      const store = createStore();

      store.complete(task.id);

      expect(byTitle(store, 'A').isDone()).toBe(true);
    });

    it('clears the active task, so the next one can start', () => {
      const store = createStore();
      store.add('A');
      store.add('B');
      store.start(byTitle(store, 'A').id);

      store.complete(byTitle(store, 'A').id);
      store.start(byTitle(store, 'B').id);

      expect(store.activeTask()?.title).toBe('B');
    });

    it('refuses to complete a done task', () => {
      const done = rawTask('Done', { status: 'done' });
      seed(done);
      const store = createStore();

      expect(() => store.complete(done.id)).toThrow(InvalidTransitionError);
    });
  });

  describe('activeTask', () => {
    it('is null when no task has been started', () => {
      seed(rawTask('Pending'), rawTask('Done', { status: 'done' }));

      expect(createStore().activeTask()).toBeNull();
    });

    it('is the running task, even when overdue', () => {
      seed(rawTask('Pending'), rawTask('Overdue', { status: 'running', endsAt: NOW - MINUTE }));

      expect(createStore().activeTask()?.title).toBe('Overdue');
    });

    it('is the paused task', () => {
      seed(rawTask('Paused', { status: 'paused', remainingMs: MINUTE }));

      expect(createStore().activeTask()?.title).toBe('Paused');
    });
  });

  it('runs a full work cycle', () => {
    const store = createStore();
    store.add('Write tests');
    store.add('Review');
    const first = byTitle(store, 'Write tests').id;

    store.start(first);
    advance(5 * MINUTE);
    store.pause(first);
    advance(MINUTE);
    store.resume(first);
    advance(DEFAULT_POMODORO_MS); // runs out → overdue
    expect(byTitle(store, 'Write tests').isOverdue(Date.now())).toBe(true);
    store.complete(first);
    store.start(byTitle(store, 'Review').id);
    TestBed.tick();

    expect(store.tasks().map((t) => t.state.status)).toEqual(['done', 'running']);
    expect(stored()).toEqual(store.tasks().map((t) => t.toJSON()));
  });

  describe('breaks', () => {
    let breaks: BreakStore;

    beforeEach(() => {
      breaks = TestBed.inject(BreakStore);
    });

    it.each<[string, TaskState]>([
      ['running', { status: 'running', endsAt: NOW + MINUTE }],
      ['overdue', { status: 'running', endsAt: NOW - MINUTE }],
      ['paused', { status: 'paused', remainingMs: MINUTE }],
    ])('starts a break when a %s task is completed', (_label, state) => {
      const task = rawTask('A', state);
      seed(task);
      const store = createStore();

      store.complete(task.id);

      expect(breaks.currentBreak()?.kind).toBe('short');
      expect(breaks.currentCounter()).toBe(1);
    });

    it('does not start a break when a pending task is ticked off', () => {
      const store = createStore();
      store.add('A');

      store.complete(byTitle(store, 'A').id);

      expect(breaks.currentBreak()).toBeNull();
      expect(breaks.currentCounter()).toBe(0);
    });

    it('does not start a break when completing fails', () => {
      const done = rawTask('Done', { status: 'done' });
      seed(done);
      const store = createStore();

      expect(() => store.complete(done.id)).toThrow(InvalidTransitionError);
      expect(breaks.currentBreak()).toBeNull();
      expect(breaks.currentCounter()).toBe(0);
    });

    it('ends a running break when the next task starts', () => {
      const store = createStore();
      store.add('A');
      breaks.start();

      store.start(byTitle(store, 'A').id);

      expect(breaks.currentBreak()).toBeNull();
    });

    it('keeps the break when starting a task fails', () => {
      const done = rawTask('Done', { status: 'done' });
      seed(done);
      const store = createStore();
      breaks.start();

      expect(() => store.start(done.id)).toThrow(InvalidTransitionError);
      expect(breaks.currentBreak()).not.toBeNull();
    });

    it('gives a long break after the 4th worked pomodoro, ignoring ticked-off tasks', () => {
      const store = createStore();
      const kinds: (string | undefined)[] = [];
      for (const title of ['1', '2', '3', '4']) {
        store.add(title);
        store.add(`${title} ticked off`);
        store.complete(byTitle(store, `${title} ticked off`).id); // no pomodoro, no break
        store.start(byTitle(store, title).id);
        advance(DEFAULT_POMODORO_MS);
        store.complete(byTitle(store, title).id);
        kinds.push(breaks.currentBreak()?.kind);
      }

      expect(kinds).toEqual(['short', 'short', 'short', 'long']);
      expect(breaks.currentCounter()).toBe(4);
    });
  });

  describe('events', () => {
    /** Everything emitted on the bus from now on. */
    function recordEvents(): AppEvent[] {
      const received: AppEvent[] = [];
      TestBed.inject(EventBus).on((event) => received.push(event));
      return received;
    }

    it('emits task-added with the stored (trimmed) title', () => {
      const store = createStore();
      const events = recordEvents();

      store.add('  Buy milk  ');

      expect(events).toEqual([{ type: 'task-added', title: store.tasks()[0].title }]);
    });

    it('emits task-edited with the old and the new title', () => {
      seed(rawTask('Old'));
      const store = createStore();
      const events = recordEvents();

      store.edit(byTitle(store, 'Old').id, 'New');

      expect(events).toEqual([{ type: 'task-edited', from: 'Old', to: 'New' }]);
    });

    it('emits nothing when the title did not change', () => {
      seed(rawTask('Same'));
      const store = createStore();
      const events = recordEvents();

      store.edit(byTitle(store, 'Same').id, 'Same');

      expect(events).toEqual([]);
    });

    it('emits task-deleted with the title of the removed task', () => {
      seed(rawTask('Gone'));
      const store = createStore();
      const events = recordEvents();

      store.delete(byTitle(store, 'Gone').id);

      expect(events).toEqual([{ type: 'task-deleted', title: 'Gone' }]);
    });

    it('emits task-started, task-paused and task-resumed', () => {
      seed(rawTask('A'));
      const store = createStore();
      const events = recordEvents();
      const id = byTitle(store, 'A').id;

      store.start(id);
      store.pause(id);
      store.resume(id);

      expect(events).toEqual([
        { type: 'task-started', title: 'A' },
        { type: 'task-paused', title: 'A' },
        { type: 'task-resumed', title: 'A' },
      ]);
    });

    it('emits break-ended before task-started when a task ends a break', () => {
      seed(rawTask('A'), rawTask('B'));
      const store = createStore();
      store.start(byTitle(store, 'A').id);
      store.complete(byTitle(store, 'A').id); // starts a break
      const events = recordEvents();

      store.start(byTitle(store, 'B').id);

      expect(events).toEqual([
        { type: 'break-ended', kind: 'short' },
        { type: 'task-started', title: 'B' },
      ]);
    });

    it('emits task-completed, then break-started, for a started task', () => {
      seed(rawTask('A'));
      const store = createStore();
      store.start(byTitle(store, 'A').id);
      const events = recordEvents();

      store.complete(byTitle(store, 'A').id);

      expect(events).toEqual([
        { type: 'task-completed', title: 'A' },
        { type: 'break-started', kind: 'short' },
      ]);
    });

    it('emits only task-completed when a pending task is ticked off', () => {
      seed(rawTask('A'));
      const store = createStore();
      const events = recordEvents();

      store.complete(byTitle(store, 'A').id);

      expect(events).toEqual([{ type: 'task-completed', title: 'A' }]);
    });

    it('emits nothing for a failed transition', () => {
      seed(rawTask('A', { status: 'done' }));
      const store = createStore();
      const events = recordEvents();

      expect(() => store.complete(byTitle(store, 'A').id)).toThrow();
      expect(events).toEqual([]);
    });

    it('emits nothing for an unknown id', () => {
      const store = createStore();
      const events = recordEvents();

      store.edit('nope', 'X');
      store.delete('nope');
      store.start('nope');
      store.complete('nope');

      expect(events).toEqual([]);
    });
  });

  describe('loadSamples', () => {
    it('adds the sample tasks in order', () => {
      const store = createStore();

      store.loadSamples();

      expect(store.tasks().map((t) => t.title)).toEqual(SAMPLE_TASKS.map((s) => s.title));
    });

    it('adds most as pending and marks the done ones as done', () => {
      const store = createStore();

      store.loadSamples();

      expect(store.tasks().map((t) => t.isDone())).toEqual(SAMPLE_TASKS.map((s) => !!s.done));
      expect(store.tasks().some((t) => t.isPending())).toBe(true);
    });

    it('appends to the existing tasks instead of replacing them', () => {
      seed(rawTask('Mine'));
      const store = createStore();

      store.loadSamples();

      expect(store.tasks()[0].title).toBe('Mine');
      expect(store.tasks()).toHaveLength(SAMPLE_TASKS.length + 1);
    });

    it('works while a task is active and leaves it running', () => {
      seed(rawTask('Active', { status: 'running', endsAt: NOW + MINUTE }));
      const store = createStore();

      store.loadSamples();

      expect(store.activeTask()?.title).toBe('Active');
    });

    it('creates new ids every time, so loading twice is fine', () => {
      const store = createStore();

      store.loadSamples();
      store.loadSamples();

      const ids = store.tasks().map((t) => t.id);
      expect(new Set(ids).size).toBe(2 * SAMPLE_TASKS.length);
    });

    it('emits one sample-data-loaded event with the count, not one per task', () => {
      const store = createStore();
      const events: AppEvent[] = [];
      TestBed.inject(EventBus).on((e) => events.push(e));

      store.loadSamples();

      expect(events).toEqual([{ type: 'sample-data-loaded', count: SAMPLE_TASKS.length }]);
    });

    it('is saved', () => {
      const store = createStore();

      store.loadSamples();
      TestBed.tick();

      expect(stored()).toHaveLength(SAMPLE_TASKS.length);
    });
  });

  describe('reset', () => {
    it('removes all tasks, including an active one', () => {
      seed(rawTask('A'), rawTask('B', { status: 'running', endsAt: NOW + MINUTE }));
      const store = createStore();

      store.reset();

      expect(store.tasks()).toEqual([]);
      expect(store.activeTask()).toBeNull();
    });

    it('is saved', () => {
      seed(rawTask('A'));
      const store = createStore();

      store.reset();
      TestBed.tick();

      expect(stored()).toEqual([]);
    });

    it('emits nothing and does not touch the break', () => {
      seed(rawTask('A', { status: 'running', endsAt: NOW + MINUTE }));
      const store = createStore();
      store.complete(byTitle(store, 'A').id); // starts a break
      const events: AppEvent[] = [];
      TestBed.inject(EventBus).on((e) => events.push(e));

      store.reset();

      expect(events).toEqual([]);
      expect(TestBed.inject(BreakStore).currentBreak()).not.toBeNull();
    });
  });

  describe('queue and doneTasks', () => {
    it('splits the tasks into waiting and done, without the active one', () => {
      seed(
        rawTask('Done 1', { status: 'done' }),
        rawTask('Wait 1'),
        rawTask('Active', { status: 'running', endsAt: NOW + MINUTE }),
        rawTask('Wait 2'),
        rawTask('Done 2', { status: 'done' }),
      );
      const store = createStore();

      expect(store.queue().map((t) => t.title)).toEqual(['Wait 1', 'Wait 2']);
      expect(store.doneTasks().map((t) => t.title)).toEqual(['Done 1', 'Done 2']);
    });

    it('follows changes', () => {
      seed(rawTask('A'), rawTask('B'));
      const store = createStore();

      store.complete(byTitle(store, 'A').id);

      expect(store.queue().map((t) => t.title)).toEqual(['B']);
      expect(store.doneTasks().map((t) => t.title)).toEqual(['A']);
    });
  });

  describe('move', () => {
    const titles = (store: TaskStore): string[] => store.queue().map((t) => t.title);

    function storeWith(...names: string[]): TaskStore {
      seed(...names.map((n) => rawTask(n)));
      return createStore();
    }

    it('moves a task down', () => {
      const store = storeWith('A', 'B', 'C');

      store.move(byTitle(store, 'A').id, 2);

      expect(titles(store)).toEqual(['B', 'C', 'A']);
    });

    it('moves a task up', () => {
      const store = storeWith('A', 'B', 'C');

      store.move(byTitle(store, 'C').id, 0);

      expect(titles(store)).toEqual(['C', 'A', 'B']);
    });

    it('swaps neighbours (what the arrow buttons do)', () => {
      const store = storeWith('A', 'B', 'C');

      store.move(byTitle(store, 'B').id, 0);

      expect(titles(store)).toEqual(['B', 'A', 'C']);
    });

    it.each([
      ['above the top', -1, ['A', 'B', 'C']],
      ['below the bottom', 99, ['B', 'C', 'A']],
    ])('clamps a target %s', (_label, to, expected) => {
      const store = storeWith('A', 'B', 'C');

      store.move(byTitle(store, 'A').id, to);

      expect(titles(store)).toEqual(expected);
    });

    it.each([NaN, 1.5, Infinity])('rejects a target index of %s', (to) => {
      const store = storeWith('A', 'B');

      expect(() => store.move(byTitle(store, 'A').id, to)).toThrow(/integer/);
      expect(titles(store)).toEqual(['A', 'B']);
    });

    it('keeps active and done tasks in their stored places', () => {
      seed(
        rawTask('A'),
        rawTask('Done', { status: 'done' }),
        rawTask('B'),
        rawTask('Active', { status: 'running', endsAt: NOW + MINUTE }),
        rawTask('C'),
      );
      const store = createStore();

      store.move(byTitle(store, 'C').id, 0);

      expect(store.tasks().map((t) => t.title)).toEqual(['C', 'Done', 'A', 'Active', 'B']);
    });

    it.each<[string, TaskState]>([
      ['running', { status: 'running', endsAt: NOW + MINUTE }],
      ['paused', { status: 'paused', remainingMs: MINUTE }],
      ['done', { status: 'done' }],
    ])('refuses to move a %s task', (_label, state) => {
      seed(rawTask('A'), rawTask('X', state));
      const store = createStore();

      expect(() => store.move(byTitle(store, 'X').id, 0)).toThrow(InvalidTransitionError);
    });

    it('ignores an unknown id', () => {
      const store = storeWith('A', 'B');

      store.move('nope', 0);

      expect(titles(store)).toEqual(['A', 'B']);
    });

    it('is saved', () => {
      const store = storeWith('A', 'B');

      store.move(byTitle(store, 'B').id, 0);
      TestBed.tick();

      expect((stored() as TaskProps[]).map((t) => t.title)).toEqual(['B', 'A']);
    });

    it('emits task-moved with the new 1-based position', () => {
      const store = storeWith('A', 'B', 'C');
      const events: AppEvent[] = [];
      TestBed.inject(EventBus).on((e) => events.push(e));

      store.move(byTitle(store, 'A').id, 1);

      expect(events).toEqual([{ type: 'task-moved', title: 'A', position: 2 }]);
    });

    it('does nothing and emits nothing when the position does not change', () => {
      const store = storeWith('A', 'B');
      const before = store.tasks();
      const events: AppEvent[] = [];
      TestBed.inject(EventBus).on((e) => events.push(e));

      store.move(byTitle(store, 'A').id, 0);
      store.move(byTitle(store, 'B').id, 5); // clamped to where it already is

      expect(store.tasks()).toBe(before);
      expect(events).toEqual([]);
    });
  });
});

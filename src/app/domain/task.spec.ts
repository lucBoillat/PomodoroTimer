import { ZodError } from 'zod';
import { InvalidTransitionError, Task, type TaskProps } from './task';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
const WORK = 25 * 60_000;
const ENDS_AT = T0 + WORK;
const PAUSED_AT = T0 + 60_000;
const VALID_ID = '123e4567-e89b-42d3-a456-426614174000';

// One factory per state, so each test starts from a fresh, known task.
const pending = (): Task => Task.create({ title: 'Write README' });
const running = (): Task => pending().start(T0, WORK);
const paused = (): Task => running().pause(PAUSED_AT);
const done = (): Task => pending().complete();

const ALL_STATES = [
  ['pending', pending],
  ['running', running],
  ['paused', paused],
  ['done', done],
] as const;

describe('Task', () => {
  describe('create', () => {
    it('starts pending with a trimmed title', () => {
      const task = Task.create({ title: '  Write README  ' });

      expect(task.state).toEqual({ status: 'pending' });
      expect(task.title).toBe('Write README');
    });

    it('generates a UUID', () => {
      expect(pending().id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('generates a different id for every task', () => {
      expect(pending().id).not.toBe(pending().id);
    });

    it('accepts a title of exactly 40 characters', () => {
      expect(Task.create({ title: 'x'.repeat(40) }).title).toHaveLength(40);
    });

    it.each([
      ['empty', ''],
      ['whitespace only', '   '],
      ['41 characters', 'x'.repeat(41)],
    ])('rejects a title that is %s', (_, title) => {
      expect(() => Task.create({ title })).toThrow(ZodError);
    });
  });

  describe('status helpers', () => {
    it.each([
      ['pending', pending, [true, false, false, false]],
      ['running', running, [false, true, false, false]],
      ['paused', paused, [false, false, true, false]],
      ['done', done, [false, false, false, true]],
    ] as const)('%s task', (_, make, [isPending, isRunning, isPaused, isDone]) => {
      const task = make();

      expect(task.isPending()).toBe(isPending);
      expect(task.isRunning()).toBe(isRunning);
      expect(task.isPaused()).toBe(isPaused);
      expect(task.isDone()).toBe(isDone);
    });
  });

  describe('start', () => {
    it('runs the task until now + duration', () => {
      expect(running().state).toEqual({ status: 'running', endsAt: ENDS_AT });
    });

    it.each([
      ['running', running],
      ['paused', paused],
      ['done', done],
    ])('rejects starting a %s task', (_, make) => {
      expect(() => make().start(T0, WORK)).toThrow(InvalidTransitionError);
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects a duration of %s', (ms) => {
      expect(() => pending().start(T0, ms)).toThrow(/Duration must be a positive number/);
    });

    it('reports the status problem before the duration problem', () => {
      expect(() => running().start(T0, -1)).toThrow(InvalidTransitionError);
    });
  });

  describe('pause', () => {
    it('freezes the remaining time', () => {
      expect(paused().state).toEqual({ status: 'paused', remainingMs: WORK - 60_000 });
    });

    it('allows pausing one millisecond before the end', () => {
      expect(running().pause(ENDS_AT - 1).state).toEqual({ status: 'paused', remainingMs: 1 });
    });

    it.each([
      ['exactly at the end', ENDS_AT],
      ['after the end', ENDS_AT + 5_000],
    ])('rejects pausing an overdue task (%s)', (_, now) => {
      expect(() => running().pause(now)).toThrow(InvalidTransitionError);
    });

    it.each([
      ['pending', pending],
      ['paused', paused],
      ['done', done],
    ])('rejects pausing a %s task', (_, make) => {
      expect(() => make().pause(T0)).toThrow(InvalidTransitionError);
    });
  });

  describe('resume', () => {
    it('continues with the remaining time from now', () => {
      const resumeAt = T0 + 10 * 60_000;
      const task = paused().resume(resumeAt);

      expect(task.state).toEqual({ status: 'running', endsAt: resumeAt + WORK - 60_000 });
      expect(task.remainingMs(resumeAt)).toBe(WORK - 60_000);
    });

    it.each([
      ['pending', pending],
      ['running', running],
      ['done', done],
    ])('rejects resuming a %s task', (_, make) => {
      expect(() => make().resume(T0)).toThrow(InvalidTransitionError);
    });
  });

  describe('complete', () => {
    it.each([
      ['pending', pending],
      ['running', running],
      ['paused', paused],
    ])('completes a %s task', (_, make) => {
      expect(make().complete().state).toEqual({ status: 'done' });
    });

    it('completes an overdue task', () => {
      const overdue = running();
      expect(overdue.isOverdue(ENDS_AT + 1)).toBe(true);

      expect(overdue.complete().isDone()).toBe(true);
    });

    it('rejects completing a done task', () => {
      expect(() => done().complete()).toThrow(InvalidTransitionError);
    });
  });

  describe('immutability', () => {
    it('returns a new task from every transition and keeps the original', () => {
      const original = pending();
      const started = original.start(T0, WORK);

      expect(started).not.toBe(original);
      expect(started.id).toBe(original.id);
      expect(original.isPending()).toBe(true);
    });
  });

  describe('isOverdue', () => {
    it('is false while time is left', () => {
      expect(running().isOverdue(ENDS_AT - 1)).toBe(false);
    });

    it('is true exactly when the time runs out, and after', () => {
      expect(running().isOverdue(ENDS_AT)).toBe(true);
      expect(running().isOverdue(ENDS_AT + 60_000)).toBe(true);
    });

    it.each([
      ['pending', pending],
      ['paused', paused],
      ['done', done],
    ])('is never true for a %s task', (_, make) => {
      expect(make().isOverdue(ENDS_AT + 100 * WORK)).toBe(false);
    });
  });

  describe('remainingMs', () => {
    it('counts down while running', () => {
      expect(running().remainingMs(T0)).toBe(WORK);
      expect(running().remainingMs(T0 + 60_000)).toBe(WORK - 60_000);
    });

    it('never goes below 0', () => {
      expect(running().remainingMs(ENDS_AT + 5_000)).toBe(0);
    });

    it('stays frozen while paused, however much time passes', () => {
      expect(paused().remainingMs(T0 + 100 * WORK)).toBe(WORK - 60_000);
    });

    it.each([
      ['pending', pending],
      ['done', done],
    ])('is null for a %s task', (_, make) => {
      expect(make().remainingMs(T0)).toBeNull();
    });
  });

  describe('overdueByMs', () => {
    it('is 0 while time is left and exactly at the end', () => {
      expect(running().overdueByMs(T0)).toBe(0);
      expect(running().overdueByMs(ENDS_AT)).toBe(0);
    });

    it('measures how long ago the time ran out', () => {
      expect(running().overdueByMs(ENDS_AT + 3_000)).toBe(3_000);
    });

    it.each([
      ['pending', pending],
      ['paused', paused],
      ['done', done],
    ])('is 0 for a %s task', (_, make) => {
      expect(make().overdueByMs(ENDS_AT + 100 * WORK)).toBe(0);
    });
  });

  describe('edit/delete rules', () => {
    it.each([
      ['pending', pending, true],
      ['running', running, false],
      ['paused', paused, false],
      ['done', done, true],
    ] as const)('%s task: can edit/delete = %s', (_, make, allowed) => {
      const task = make();

      expect(task.canEdit()).toBe(allowed);
      expect(task.canDelete()).toBe(allowed);
    });
  });

  describe('edit', () => {
    it.each([
      ['pending', pending],
      ['done', done],
    ])('renames a %s task and keeps its id and state', (_, make) => {
      const task = make();
      const edited = task.edit('  New title  ');

      expect(edited.title).toBe('New title');
      expect(edited.id).toBe(task.id);
      expect(edited.state).toEqual(task.state);
      expect(task.title).toBe('Write README');
    });

    it.each([
      ['running', running],
      ['paused', paused],
    ])('rejects editing a %s task', (_, make) => {
      expect(() => make().edit('New title')).toThrow(InvalidTransitionError);
    });

    it.each([
      ['empty', ''],
      ['whitespace only', '   '],
      ['41 characters', 'x'.repeat(41)],
    ])('rejects a new title that is %s', (_, title) => {
      expect(() => pending().edit(title)).toThrow(ZodError);
    });
  });

  describe('toJSON and parse', () => {
    it.each(ALL_STATES)('round-trips a %s task through JSON', (_, make) => {
      const task = make();
      const restored = Task.parse(JSON.parse(JSON.stringify(task)));

      expect(restored).toBeInstanceOf(Task);
      expect(restored.toJSON()).toEqual(task.toJSON());
    });

    it('produces flat JSON with exactly id, title and state', () => {
      const json = JSON.parse(JSON.stringify(running()));

      expect(Object.keys(json).sort()).toEqual(['id', 'state', 'title']);
      expect(json.state).toEqual({ status: 'running', endsAt: ENDS_AT });
    });

    it('restores a running task whose time ran out while the app was closed as overdue', () => {
      const restored = Task.parse(JSON.parse(JSON.stringify(running())));

      expect(restored.isOverdue(ENDS_AT + 10 * 60_000)).toBe(true);
      expect(restored.overdueByMs(ENDS_AT + 10 * 60_000)).toBe(10 * 60_000);
    });

    it('accepts valid stored data', () => {
      const stored: TaskProps = { id: VALID_ID, title: 'Stored', state: { status: 'pending' } };

      expect(Task.parse(stored).toJSON()).toEqual(stored);
    });

    it.each([
      ['a missing id', { title: 'x', state: { status: 'pending' } }],
      ['an id that is not a UUID', { id: '42', title: 'x', state: { status: 'pending' } }],
      ['an empty title', { id: VALID_ID, title: '', state: { status: 'pending' } }],
      ['a missing state', { id: VALID_ID, title: 'x' }],
      ['an unknown status', { id: VALID_ID, title: 'x', state: { status: 'sleeping' } }],
      ['running without endsAt', { id: VALID_ID, title: 'x', state: { status: 'running' } }],
      [
        'paused with no time left',
        { id: VALID_ID, title: 'x', state: { status: 'paused', remainingMs: 0 } },
      ],
      [
        'paused with negative time',
        { id: VALID_ID, title: 'x', state: { status: 'paused', remainingMs: -5 } },
      ],
      [
        'a non-numeric endsAt',
        { id: VALID_ID, title: 'x', state: { status: 'running', endsAt: 'tomorrow' } },
      ],
      ['null', null],
      ['a string', 'task'],
      ['an array', []],
    ])('rejects %s', (_, input) => {
      expect(() => Task.parse(input)).toThrow(ZodError);
    });
  });

  describe('InvalidTransitionError', () => {
    it('carries the action and status for callers', () => {
      const error = captureError(() => done().complete());

      expect(error).toBeInstanceOf(InvalidTransitionError);
      expect(error).toMatchObject({ name: 'InvalidTransitionError', status: 'done' });
      expect((error as InvalidTransitionError).action).toBeTruthy();
    });

    it('includes the reason in the message when given', () => {
      const error = captureError(() => running().pause(ENDS_AT));

      expect((error as Error).message).toBe(
        'Cannot pause a running task: its time has already run out',
      );
    });
  });

  it('supports a full work cycle', () => {
    const task = pending()
      .start(T0, WORK)
      .pause(T0 + 5 * 60_000)
      .resume(T0 + 7 * 60_000)
      .complete();

    expect(task.isDone()).toBe(true);
    expect(task.canDelete()).toBe(true);
  });
});

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected an error, but nothing was thrown');
}

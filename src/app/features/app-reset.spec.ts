import { TestBed } from '@angular/core/testing';
import { EventBus } from '../core/event-bus';
import type { AppEvent } from '../domain/app-event';
import { Settings } from '../domain/settings';
import { AppReset } from './app-reset';
import { LogStore } from './log/log-store';
import { SettingsStore } from './settings/settings-store';
import { BreakStore } from './timer/break-store';
import { TaskStore } from './timer/task-store';

const KEYS = [
  'pomodoro.tasks',
  'pomodoro.break',
  'pomodoro.break.counter',
  'pomodoro.settings',
  'pomodoro.log',
];

describe('AppReset', () => {
  let taskStore: TaskStore;
  let breakStore: BreakStore;
  let settingsStore: SettingsStore;
  let logStore: LogStore;

  beforeEach(() => {
    localStorage.clear();
    taskStore = TestBed.inject(TaskStore);
    breakStore = TestBed.inject(BreakStore);
    settingsStore = TestBed.inject(SettingsStore);
    logStore = TestBed.inject(LogStore);
  });

  /** Puts something into every store: custom settings, tasks, a running break, log entries. */
  function useTheApp(): void {
    settingsStore.update(Settings.create({ pomodoroMinutes: 50 }));
    taskStore.add('A');
    taskStore.add('B');
    taskStore.start(taskStore.tasks()[0].id);
    taskStore.complete(taskStore.tasks()[0].id); // break #1
    taskStore.start(taskStore.tasks()[1].id); // ends the break, B is running
  }

  it('resets every store to its defaults', () => {
    useTheApp();

    TestBed.inject(AppReset).run();

    expect(taskStore.tasks()).toEqual([]);
    expect(taskStore.activeTask()).toBeNull();
    expect(breakStore.currentBreak()).toBeNull();
    expect(breakStore.currentCounter()).toBe(0);
    expect(settingsStore.settings().toJSON()).toEqual(Settings.create().toJSON());
  });

  it('also clears a running break', () => {
    taskStore.add('A');
    taskStore.start(taskStore.tasks()[0].id);
    taskStore.complete(taskStore.tasks()[0].id);
    expect(breakStore.currentBreak()).not.toBeNull();

    TestBed.inject(AppReset).run();

    expect(breakStore.currentBreak()).toBeNull();
  });

  it('leaves exactly one log entry: "app-reset"', () => {
    useTheApp();
    expect(logStore.entries().length).toBeGreaterThan(1);

    TestBed.inject(AppReset).run();

    expect(logStore.entries().map((e) => e.event)).toEqual([{ type: 'app-reset' }]);
  });

  it('emits app-reset once and nothing else', () => {
    useTheApp();
    const events: AppEvent[] = [];
    TestBed.inject(EventBus).on((e) => events.push(e));

    TestBed.inject(AppReset).run();

    expect(events).toEqual([{ type: 'app-reset' }]);
  });

  it('saves the reset state, so it survives a reload', () => {
    useTheApp();

    TestBed.inject(AppReset).run();
    TestBed.tick();

    expect(JSON.parse(localStorage.getItem('pomodoro.tasks') ?? 'null')).toEqual([]);
    expect(JSON.parse(localStorage.getItem('pomodoro.break') ?? 'undefined')).toBeNull();
    expect(JSON.parse(localStorage.getItem('pomodoro.break.counter') ?? 'null')).toBe(0);
    expect(JSON.parse(localStorage.getItem('pomodoro.settings') ?? 'null')).toEqual(
      Settings.create().toJSON(),
    );
    const log = JSON.parse(localStorage.getItem('pomodoro.log') ?? '[]') as { event: AppEvent }[];
    expect(log.map((e) => e.event)).toEqual([{ type: 'app-reset' }]);
  });

  it('only writes the keys the app owns', () => {
    localStorage.setItem('someone-else', 'keep me');
    useTheApp();

    TestBed.inject(AppReset).run();
    TestBed.tick();

    expect(localStorage.getItem('someone-else')).toBe('keep me');
    expect(
      Object.keys(localStorage)
        .filter((k) => k !== 'someone-else')
        .sort(),
    ).toEqual([...KEYS].sort());
  });

  it('works on an app that was never used', () => {
    TestBed.inject(AppReset).run();

    expect(taskStore.tasks()).toEqual([]);
    expect(logStore.entries().map((e) => e.event)).toEqual([{ type: 'app-reset' }]);
  });
});

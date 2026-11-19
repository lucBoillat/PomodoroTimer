import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  createFakeNotificationApi,
  type FakeNotificationApi,
} from '../../../testing/fake-notification';
import { DesktopNotifications, NOTIFICATION_API } from '../../core/desktop-notifications';
import { EventBus } from '../../core/event-bus';
import type { AppEvent } from '../../domain/app-event';
import { DesktopNotifier } from './desktop-notifier';

describe('DesktopNotifier', () => {
  let fake: FakeNotificationApi;
  let bus: EventBus;

  beforeEach(async () => {
    localStorage.clear();
    fake = createFakeNotificationApi('granted');
    TestBed.configureTestingModule({
      providers: [{ provide: NOTIFICATION_API, useValue: fake.api }],
    });
    await TestBed.inject(DesktopNotifications).enable();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    TestBed.inject(DesktopNotifier);
    bus = TestBed.inject(EventBus);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('notifies when a task runs out of time', () => {
    bus.emit({ type: 'task-overdue', title: 'Write tests' });

    expect(fake.shown).toHaveLength(1);
    expect(fake.shown[0].title).toBe('Zeit abgelaufen');
    expect(fake.shown[0].options?.body).toBe('„Write tests“ ist fertig. Zeit für eine Pause.');
    expect(fake.shown[0].options?.tag).toBe('pomodoro-task');
  });

  it.each(['short', 'long'] as const)('notifies when a %s break is over', (kind) => {
    bus.emit({ type: 'break-over', kind });

    expect(fake.shown).toHaveLength(1);
    expect(fake.shown[0].title).toBe('Pause vorbei');
    expect(fake.shown[0].options?.body).toBe('Zeit für die nächste Aufgabe.');
    expect(fake.shown[0].options?.tag).toBe('pomodoro-break');
  });

  it('uses one tag per kind, so a new notification replaces the old one', () => {
    bus.emit({ type: 'task-overdue', title: 'A' });
    bus.emit({ type: 'task-overdue', title: 'B' });

    expect(new Set(fake.shown.map((n) => n.options?.tag))).toEqual(new Set(['pomodoro-task']));
  });

  it.each<AppEvent>([
    { type: 'task-added', title: 'A' },
    { type: 'task-started', title: 'A' },
    { type: 'task-completed', title: 'A' },
    { type: 'break-started', kind: 'short' },
    { type: 'break-ended', kind: 'short' },
    { type: 'app-reset' },
  ])('stays quiet for $type', (event) => {
    bus.emit(event);

    expect(fake.shown).toEqual([]);
  });

  it('opens the timer tab when the notification is clicked', () => {
    vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    bus.emit({ type: 'break-over', kind: 'short' });

    fake.shown[0].click();

    expect(navigate).toHaveBeenCalledWith('/timer');
  });

  it('stops listening once destroyed', () => {
    const oldBus = bus;
    TestBed.resetTestingModule();

    oldBus.emit({ type: 'task-overdue', title: 'A' });

    expect(fake.shown).toEqual([]);
  });
});

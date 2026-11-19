import { TestBed } from '@angular/core/testing';
import { AlarmSound } from '../../core/alarm-sound';
import { EventBus } from '../../core/event-bus';
import type { AppEvent } from '../../domain/app-event';
import { SoundNotifier } from './sound-notifier';

describe('SoundNotifier', () => {
  let play: ReturnType<typeof vi.fn>;
  let bus: EventBus;

  beforeEach(() => {
    play = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: AlarmSound, useValue: { play } }] });
    TestBed.inject(SoundNotifier);
    bus = TestBed.inject(EventBus);
  });

  it('plays the task sound when a task runs out of time', () => {
    bus.emit({ type: 'task-overdue', title: 'A' });

    expect(play).toHaveBeenCalledExactlyOnceWith('task');
  });

  it('plays the break sound when a break is over', () => {
    bus.emit({ type: 'break-over', kind: 'long' });

    expect(play).toHaveBeenCalledExactlyOnceWith('break');
  });

  it.each<AppEvent>([
    { type: 'task-started', title: 'A' },
    { type: 'task-completed', title: 'A' },
    { type: 'break-started', kind: 'short' },
    { type: 'app-reset' },
  ])('stays quiet for $type', (event) => {
    bus.emit(event);

    expect(play).not.toHaveBeenCalled();
  });
});

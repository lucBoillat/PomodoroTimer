import { DestroyRef, inject, Injectable } from '@angular/core';
import { AlarmSound } from '../../core/alarm-sound';
import { EventBus } from '../../core/event-bus';

/** Plays a sound when a task's time is up or a break is over. Another listener on the bus. */
@Injectable({ providedIn: 'root' })
export class SoundNotifier {
  private readonly sound = inject(AlarmSound);

  constructor() {
    const off = inject(EventBus).on((event) => {
      if (event.type === 'task-overdue') this.sound.play('task');
      if (event.type === 'break-over') this.sound.play('break');
    });
    inject(DestroyRef).onDestroy(off);
  }
}

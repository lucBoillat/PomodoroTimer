import { DestroyRef, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { DesktopNotifications } from '../../core/desktop-notifications';
import { EventBus } from '../../core/event-bus';
import type { AppEvent } from '../../domain/app-event';

/**
 * Turns timer events into desktop notifications: the second listener on the EventBus,
 * next to the log. Neither the stores nor the TimerNotifier know it exists.
 * Started in app.config, so it works on every tab.
 */
@Injectable({ providedIn: 'root' })
export class DesktopNotifier {
  private readonly notifications = inject(DesktopNotifications);
  private readonly router = inject(Router);

  constructor() {
    const off = inject(EventBus).on((event) => this.handle(event));
    inject(DestroyRef).onDestroy(off);
  }

  private handle(event: AppEvent): void {
    const backToTimer = (): void => void this.router.navigateByUrl('/timer');
    switch (event.type) {
      case 'task-overdue':
        this.notifications.notify('Zeit abgelaufen', {
          body: `„${event.title}“ ist fertig. Zeit für eine Pause.`,
          tag: 'pomodoro-task',
          onClick: backToTimer,
        });
        break;
      case 'break-over':
        this.notifications.notify('Pause vorbei', {
          body: 'Zeit für die nächste Aufgabe.',
          tag: 'pomodoro-break',
          onClick: backToTimer,
        });
        break;
    }
  }
}

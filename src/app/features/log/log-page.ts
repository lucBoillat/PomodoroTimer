import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Clock } from '../../core/clock';
import { describeEvent, EVENT_ICONS, isAlert } from './describe-event';
import { LogStore } from './log-store';

@Component({
  imports: [DatePipe, MatButtonModule, MatIconModule],
  selector: 'app-log-page',
  styleUrl: './log-page.scss',
  templateUrl: './log-page.html',
})
export class LogPage {
  protected readonly logStore = inject(LogStore);
  private readonly clock = inject(Clock);

  /*
   * Recomputed every second (the clock ticks), but its value only changes at midnight.
   * A computed only notifies on a changed value, so `rows` below is NOT rebuilt every second.
   */
  private readonly startOfToday = computed(() => new Date(this.clock.now()).setHours(0, 0, 0, 0));

  /** Everything the template needs, prepared once per change of the log (or of the day). */
  protected readonly rows = computed(() => {
    const startOfToday = this.startOfToday();
    return this.logStore.entries().map((entry) => ({
      id: entry.id,
      at: entry.at,
      today: entry.at >= startOfToday,
      text: describeEvent(entry.event),
      icon: EVENT_ICONS[entry.event.type],
      alert: isAlert(entry.event),
    }));
  });
}

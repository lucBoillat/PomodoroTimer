import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { Break, BreakKind } from '../../domain/break';
import type { Task } from '../../domain/task';

const BREAK_LABELS: Record<BreakKind, string> = {
  short: 'Kurze Pause',
  long: 'Lange Pause',
};

@Component({
  imports: [MatButtonModule, MatIconModule],
  selector: 'app-current-panel',
  styleUrl: './current-panel.scss',
  templateUrl: './current-panel.html',
})
export class CurrentPanel {
  readonly task = input<Task | null>(null);
  readonly activeBreak = input<Break | null>(null);

  readonly pauseTask = output<void>();
  readonly resumeTask = output<void>();
  readonly complete = output<void>();
  readonly endBreak = output<void>();

  protected readonly breakLabels = BREAK_LABELS;
}

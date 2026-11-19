import { LiveAnnouncer } from '@angular/cdk/a11y';
import { type CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { ChangeDetectorRef, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { Clock } from '../../core/clock';
import { ConfirmDialog, type ConfirmDialogData } from '../../shared/confirm-dialog';
import type { Task } from '../../domain/task';
import { AppReset } from '../app-reset';
import { CurrentPanel } from './current-panel';
import { TaskForm } from './task-form';
import { TaskStore } from './task-store';
import { BreakStore } from './break-store';
import { TaskItem } from './task-item';

@Component({
  imports: [CurrentPanel, DragDropModule, MatButtonModule, MatIconModule, TaskForm, TaskItem],
  selector: 'app-timer-page',
  styleUrl: './timer-page.scss',
  templateUrl: './timer-page.html',
})
export class TimerPage {
  protected readonly taskStore = inject(TaskStore);
  protected readonly breakStore = inject(BreakStore);
  protected readonly clock = inject(Clock);
  private readonly appReset = inject(AppReset);
  private readonly dialog = inject(MatDialog);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly changeDetector = inject(ChangeDetectorRef);
  protected readonly startBlocked = computed(() =>
    !this.taskStore.activeTask()
      ? !this.breakStore.currentBreak()
        ? null
        : 'Pause läuft'
      : 'Eine andere Aufgabe ist aktiv',
  );

  /** Used by the arrow buttons (index ± 1) and by drag and drop. */
  protected move(task: Task, toIndex: number): void {
    this.taskStore.move(task.id, toIndex);
    // A screen reader user would otherwise not notice that anything moved.
    const queue = this.taskStore.queue();
    const position = queue.findIndex((t) => t.id === task.id) + 1;
    void this.announcer.announce(
      `„${task.title}“ auf Position ${position} von ${queue.length} verschoben`,
    );
  }

  protected drop(event: CdkDragDrop<unknown, unknown, Task>): void {
    if (event.previousIndex === event.currentIndex) return; // dropped where it was
    this.move(event.item.data, event.currentIndex);
    // The one deliberate exception to "no manual change detection" in this app:
    // on drop the CDK puts the dragged element back at its OLD place in the DOM. Without
    // zone.js, Angular would re-render in the next task, after the browser has painted that
    // old order once (a visible flash). Rendering this view now closes that gap.
    this.changeDetector.detectChanges();
  }

  protected pauseActive(): void {
    const task = this.taskStore.activeTask();
    if (task) this.taskStore.pause(task.id);
  }

  protected resumeActive(): void {
    const task = this.taskStore.activeTask();
    if (task) this.taskStore.resume(task.id);
  }

  protected completeActive(): void {
    const task = this.taskStore.activeTask();
    if (task) this.taskStore.complete(task.id);
  }

  protected async resetAll(): Promise<void> {
    const dialogRef = this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      data: {
        title: 'Alles zurücksetzen?',
        message:
          'Alle Aufgaben, die laufende Pause, die Einstellungen und das Log werden gelöscht. ' +
          'Das lässt sich nicht rückgängig machen.',
        confirm: 'Zurücksetzen',
      },
    });
    // afterClosed() emits once and completes; firstValueFrom turns that into a Promise.
    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (confirmed === true) this.appReset.run();
  }
}

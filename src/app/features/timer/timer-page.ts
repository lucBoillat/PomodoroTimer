import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { Clock } from '../../core/clock';
import { ConfirmDialog, type ConfirmDialogData } from '../../shared/confirm-dialog';
import { AppReset } from '../app-reset';
import { CurrentPanel } from './current-panel';
import { TaskForm } from './task-form';
import { TaskStore } from './task-store';
import { BreakStore } from './break-store';
import { TaskItem } from './task-item';

@Component({
  imports: [CurrentPanel, MatButtonModule, MatIconModule, TaskForm, TaskItem],
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
  protected readonly startBlocked = computed(() =>
    !this.taskStore.activeTask()
      ? !this.breakStore.currentBreak()
        ? null
        : 'Pause läuft'
      : 'Eine andere Aufgabe ist aktiv',
  );

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

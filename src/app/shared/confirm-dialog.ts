import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  /** Label of the destructive button, e.g. "Zurücksetzen". */
  readonly confirm: string;
}

/**
 * A reusable "are you sure?" dialog. Closes with `true` on confirm and `false` on cancel;
 * Escape or a click on the backdrop close it with `undefined`, which also counts as no.
 */
@Component({
  imports: [MatButtonModule, MatDialogModule],
  selector: 'app-confirm-dialog',
  styleUrl: './confirm-dialog.scss',
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}

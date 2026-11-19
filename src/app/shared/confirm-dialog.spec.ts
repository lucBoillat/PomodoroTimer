import { Component, inject } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { HarnessLoader, TestKey } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialog, type ConfirmDialogData } from './confirm-dialog';

const DATA: ConfirmDialogData = {
  title: 'Alles zurücksetzen?',
  message: 'Das lässt sich nicht rückgängig machen.',
  confirm: 'Zurücksetzen',
};

/** The dialog lives in an overlay; the harness only needs some fixture to find the document. */
@Component({ template: '' })
class Host {
  readonly dialog = inject(MatDialog);
}

describe('ConfirmDialog', () => {
  let fixture: ComponentFixture<Host>;
  let loader: HarnessLoader;
  let result: Promise<boolean | undefined>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const ref = fixture.componentInstance.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(
      ConfirmDialog,
      { data: DATA },
    );
    result = firstValueFrom(ref.afterClosed());
    await fixture.whenStable();
  });

  function button(text: string): Promise<MatButtonHarness> {
    return loader.getHarness(MatButtonHarness.with({ text, ancestor: 'mat-dialog-container' }));
  }

  it('shows the title and the message', async () => {
    const dialog = await loader.getHarness(MatDialogHarness);

    expect(await dialog.getTitleText()).toBe(DATA.title);
    expect(await dialog.getContentText()).toBe(DATA.message);
  });

  it('labels the dialog with its title for screen readers', async () => {
    const dialog = await loader.getHarness(MatDialogHarness);

    expect(await dialog.getAriaLabelledby()).toBeTruthy();
    expect(await dialog.getRole()).toBe('dialog');
  });

  it('closes with true on confirm', async () => {
    await (await button('Zurücksetzen')).click();

    expect(await result).toBe(true);
  });

  it('closes with false on cancel', async () => {
    await (await button('Abbrechen')).click();

    expect(await result).toBe(false);
  });

  it('closes without a result on Escape, which callers treat as "no"', async () => {
    const dialog = await loader.getHarness(MatDialogHarness);

    await (await dialog.host()).sendKeys(TestKey.ESCAPE);

    expect(await result).toBeUndefined();
  });

  it('marks "Abbrechen" for initial focus, so Enter right away is harmless', async () => {
    // The CDK focus trap only focuses elements it considers visible. The test DOM has no
    // layout, so the actual focus move can't be observed here; the marker is what we own.
    const cancel = await (await button('Abbrechen')).host();
    const confirm = await (await button('Zurücksetzen')).host();

    expect(await cancel.getAttribute('cdkFocusInitial')).not.toBeNull();
    expect(await confirm.getAttribute('cdkFocusInitial')).toBeNull();
  });

  it('marks the confirm button as destructive', async () => {
    const confirm = await (await button('Zurücksetzen')).host();

    expect(await confirm.hasClass('danger')).toBe(true);
  });
});

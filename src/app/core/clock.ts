import { DestroyRef, DOCUMENT, Injectable, inject, signal } from '@angular/core';

export const TICK_MS = 1000;

@Injectable({ providedIn: 'root' })
export class Clock {
  private readonly current = signal(Date.now());
  readonly now = this.current.asReadonly();

  constructor() {
    const document = inject(DOCUMENT);
    const tick = (): void => this.current.set(Date.now());

    const id = setInterval(tick, TICK_MS);
    // Background tabs may tick only once a minute; catch up as soon as the tab is visible again.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }
}

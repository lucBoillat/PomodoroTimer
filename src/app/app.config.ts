import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, TitleStrategy } from '@angular/router';
import { AppTitleStrategy } from './core/app-title-strategy';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { MAT_TOOLTIP_DEFAULT_OPTIONS } from '@angular/material/tooltip';
import { routes } from './app.routes';
import { LogStore } from './features/log/log-store';
import { DesktopNotifier } from './features/timer/desktop-notifier';
import { SoundNotifier } from './features/timer/sound-notifier';
import { TimerNotifier } from './features/timer/timer-notifier';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // index.html loads the Material Symbols font; make <mat-icon> use it instead of the older Material Icons.
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    // Tooltips only after resting on a button for a moment, not on every pass of the pointer
    // (e.g. clicking an arrow repeatedly moves rows under the pointer and re-triggered them).
    {
      provide: MAT_TOOLTIP_DEFAULT_OPTIONS,
      useValue: { showDelay: 500, hideDelay: 0, touchendHideDelay: 1500 },
    },
    // Root services are created lazily. These must run from the start, on every tab:
    // the listeners must hear events before any tab that uses them is opened.
    provideAppInitializer(() => {
      inject(LogStore);
      inject(DesktopNotifier);
      inject(SoundNotifier);
      inject(TimerNotifier);
    }),
  ],
};

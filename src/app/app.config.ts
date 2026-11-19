import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { routes } from './app.routes';
import { LogStore } from './features/log/log-store';
import { DesktopNotifier } from './features/timer/desktop-notifier';
import { TimerNotifier } from './features/timer/timer-notifier';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // index.html loads the Material Symbols font; make <mat-icon> use it instead of the older Material Icons.
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    // Root services are created lazily. These must run from the start, on every tab:
    // the listeners must hear events before any tab that uses them is opened.
    provideAppInitializer(() => {
      inject(LogStore);
      inject(DesktopNotifier);
      inject(TimerNotifier);
    }),
  ],
};

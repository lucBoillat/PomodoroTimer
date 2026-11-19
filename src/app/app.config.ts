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
import { TimerNotifier } from './features/timer/timer-notifier';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // index.html loads the Material Symbols font; make <mat-icon> use it instead of the older Material Icons.
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    // Root services are created lazily. These two must run from the start, on every tab:
    // the log must hear events before the Log tab is ever opened.
    provideAppInitializer(() => {
      inject(LogStore);
      inject(TimerNotifier);
    }),
  ],
};

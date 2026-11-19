import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'timer' },
  {
    path: 'timer',
    title: 'Wecker',
    loadComponent: () => import('./features/timer/timer-page').then((m) => m.TimerPage),
  },
  {
    path: 'settings',
    title: 'Einstellungen',
    loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage),
  },
  {
    path: 'log',
    title: 'Log',
    loadComponent: () => import('./features/log/log-page').then((m) => m.LogPage),
  },
  // catch-all
  { path: '**', redirectTo: 'timer' },
];

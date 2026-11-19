import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const APP_NAME = 'Pomodoro';

/**
 * Routes carry the short page name ("Wecker"), which the tabs reuse as their label.
 * The browser tab gets the app name appended: "Wecker · Pomodoro".
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} · ${APP_NAME}` : APP_NAME);
  }
}

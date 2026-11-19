import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router, TitleStrategy } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { AppTitleStrategy } from './core/app-title-strategy';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: TitleStrategy, useClass: AppTitleStrategy }],
    });
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  it('shows the three tabs with the names from the brief', async () => {
    const host = await render();

    const tabs = Array.from(host.querySelectorAll('a[mat-tab-link]'));
    expect(tabs.map((a) => a.textContent?.trim())).toEqual(['Wecker', 'Einstellungen', 'Log']);
    expect(tabs.map((a) => a.getAttribute('href'))).toEqual(['/timer', '/settings', '/log']);
  });

  it.each([
    ['/timer', 'Wecker · Pomodoro'],
    ['/settings', 'Einstellungen · Pomodoro'],
    ['/log', 'Log · Pomodoro'],
  ])('titles the browser tab for %s as "%s"', async (url, title) => {
    await render();

    await TestBed.inject(Router).navigateByUrl(url);

    expect(TestBed.inject(Title).getTitle()).toBe(title);
  });

  it('redirects unknown URLs to the Wecker', async () => {
    await render();

    await TestBed.inject(Router).navigateByUrl('/does-not-exist');

    expect(TestBed.inject(Router).url).toBe('/timer');
    expect(TestBed.inject(Title).getTitle()).toBe('Wecker · Pomodoro');
  });
});

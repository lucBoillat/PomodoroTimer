import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { routes } from './app.routes';

@Component({
  imports: [RouterOutlet, MatIconModule, MatTabsModule, RouterLink, RouterLinkActive],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  // One source for both: a route's title is its tab label (the browser tab adds the app name).
  protected readonly links = routes.flatMap((route) =>
    route.loadComponent && typeof route.title === 'string'
      ? [{ path: `/${route.path}`, label: route.title }]
      : [],
  );
}

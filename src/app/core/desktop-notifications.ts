import {
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  inject,
  Injectable,
  InjectionToken,
  signal,
} from '@angular/core';
import { EventBus } from './event-bus';

/** The parts of the browser's `Notification` class this app uses. */
export interface NotificationApi {
  readonly permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  new (title: string, options?: NotificationOptions): Notification;
}

/**
 * The browser's Notification API, or null where it does not exist.
 * A token instead of the global, so tests can pass in a fake (same idea as the Clock).
 */
export const NOTIFICATION_API = new InjectionToken<NotificationApi | null>('NOTIFICATION_API', {
  providedIn: 'root',
  factory: () => (typeof Notification === 'undefined' ? null : Notification),
});

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export interface DesktopNotification {
  readonly body: string;
  /** Same tag = the new notification replaces the old one instead of stacking up. */
  readonly tag: string;
  readonly onClick?: () => void;
}

const STORAGE_KEY = 'pomodoro.notifications';

/**
 * A thin wrapper around the Notification API. Knows nothing about pomodoros.
 * Notifies only when the user switched it on, the browser allows it and the tab is hidden.
 */
@Injectable({ providedIn: 'root' })
export class DesktopNotifications {
  private readonly api = inject(NOTIFICATION_API);
  private readonly document = inject(DOCUMENT);
  private readonly events = inject(EventBus);

  private readonly permissionState = signal<NotificationPermissionState>(this.readPermission());
  readonly permission = this.permissionState.asReadonly();

  /** The user's choice. Kept even if the browser later blocks it, so it comes back if unblocked. */
  private readonly wanted = signal(this.loadWanted());
  readonly enabled = computed(() => this.wanted() && this.permission() === 'granted');

  constructor() {
    effect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(this.wanted())));

    // The permission can be changed in the browser's site settings while the app is open.
    const refresh = (): void => this.permissionState.set(this.readPermission());
    this.document.addEventListener('visibilitychange', refresh);
    inject(DestroyRef).onDestroy(() =>
      this.document.removeEventListener('visibilitychange', refresh),
    );
  }

  /**
   * Switches notifications on, asking the browser for permission if it has not been asked yet.
   * Must be called from a user action (a click): browsers ignore or block requests otherwise.
   * Resolves to whether notifications are on afterwards.
   */
  async enable(): Promise<boolean> {
    if (this.api === null) return false;
    let permission = this.api.permission;
    if (permission === 'default') {
      permission = await this.api.requestPermission();
    }
    this.permissionState.set(permission);
    if (permission !== 'granted') return false;
    this.setWanted(true);
    return true;
  }

  disable(): void {
    this.setWanted(false);
  }

  notify(title: string, notification: DesktopNotification): void {
    if (!this.enabled() || this.document.visibilityState !== 'hidden' || this.api === null) {
      return;
    }
    try {
      const shown = new this.api(title, { body: notification.body, tag: notification.tag });
      shown.onclick = () => {
        this.document.defaultView?.focus();
        notification.onClick?.();
        shown.close();
      };
    } catch {
      // Android Chrome only allows notifications via a service worker and throws here.
      // A missing notification must never break the app; the in-page snackbar still shows.
    }
  }

  private setWanted(wanted: boolean): void {
    if (this.wanted() === wanted) return;
    this.wanted.set(wanted);
    this.events.emit({ type: 'notifications-toggled', enabled: wanted });
  }

  private readPermission(): NotificationPermissionState {
    return this.api?.permission ?? 'unsupported';
  }

  private loadWanted(): boolean {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'false') === true;
    } catch {
      return false;
    }
  }
}

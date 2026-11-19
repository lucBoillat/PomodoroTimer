import type { NotificationApi } from '../app/core/desktop-notifications';

/** What a fake notification recorded: everything a test wants to check. */
export interface ShownNotification {
  readonly title: string;
  readonly options?: NotificationOptions;
  onclick: ((this: Notification, ev: Event) => unknown) | null;
  closed: boolean;
  click(): void;
}

export interface FakeNotificationApi {
  /** Pass this to the NOTIFICATION_API token. */
  readonly api: NotificationApi;
  /** The browser's current decision; tests change it to simulate the site settings. */
  permission: NotificationPermission;
  /** What the permission prompt will answer. */
  answer: NotificationPermission;
  /** How often the prompt was shown. */
  prompts: number;
  /** Every notification created, oldest first. */
  readonly shown: ShownNotification[];
  /** Makes the constructor throw, like Android Chrome without a service worker. */
  throwOnCreate: boolean;
}

/**
 * A stand-in for the browser's `Notification` class. A fresh one per test, so no static
 * state leaks between tests. Written without `vi`, so it also compiles outside specs.
 */
export function createFakeNotificationApi(
  permission: NotificationPermission = 'default',
): FakeNotificationApi {
  const fake: Omit<FakeNotificationApi, 'api'> = {
    permission,
    answer: 'granted',
    prompts: 0,
    shown: [],
    throwOnCreate: false,
  };

  class FakeNotification {
    static get permission(): NotificationPermission {
      return fake.permission;
    }

    static async requestPermission(): Promise<NotificationPermission> {
      fake.prompts++;
      fake.permission = fake.answer;
      return fake.answer;
    }

    // The instance is its own record: tests read these fields from `shown`.
    onclick: ((this: Notification, ev: Event) => unknown) | null = null;
    closed = false;

    constructor(
      readonly title: string,
      readonly options?: NotificationOptions,
    ) {
      if (fake.throwOnCreate) {
        throw new TypeError(
          'Illegal constructor. Use ServiceWorkerRegistration.showNotification()',
        );
      }
      fake.shown.push(this);
    }

    click(): void {
      this.onclick?.call(this as unknown as Notification, new Event('click'));
    }

    close(): void {
      this.closed = true;
    }
  }

  return Object.assign(fake, { api: FakeNotification as unknown as NotificationApi });
}

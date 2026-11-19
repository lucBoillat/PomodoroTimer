import { TestBed } from '@angular/core/testing';
import {
  createFakeNotificationApi,
  type FakeNotificationApi,
} from '../../testing/fake-notification';
import type { AppEvent } from '../domain/app-event';
import { DesktopNotifications, NOTIFICATION_API } from './desktop-notifications';
import { EventBus } from './event-bus';

const STORAGE_KEY = 'pomodoro.notifications';
const MESSAGE = { body: 'Body', tag: 'pomodoro-task' };

describe('DesktopNotifications', () => {
  let fake: FakeNotificationApi;
  let events: AppEvent[];

  beforeEach(() => {
    localStorage.clear();
    fake = createFakeNotificationApi('default');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Creates the service. Storage and the fake's permission are what it starts with. */
  function create(api: FakeNotificationApi | null = fake): DesktopNotifications {
    TestBed.configureTestingModule({
      providers: [{ provide: NOTIFICATION_API, useValue: api?.api ?? null }],
    });
    events = [];
    TestBed.inject(EventBus).on((e) => events.push(e));
    return TestBed.inject(DesktopNotifications);
  }

  function setVisibility(state: DocumentVisibilityState): void {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
    document.dispatchEvent(new Event('visibilitychange'));
  }

  /** A service that is switched on and allowed, in a hidden tab: notifications get shown. */
  async function ready(): Promise<DesktopNotifications> {
    fake.permission = 'granted';
    const service = create();
    await service.enable();
    setVisibility('hidden');
    return service;
  }

  describe('without browser support', () => {
    it('reports "unsupported" and stays off', async () => {
      const service = create(null);

      expect(service.permission()).toBe('unsupported');
      expect(await service.enable()).toBe(false);
      expect(service.enabled()).toBe(false);
    });

    it('ignores notify without throwing', () => {
      const service = create(null);
      setVisibility('hidden');

      expect(() => service.notify('Title', MESSAGE)).not.toThrow();
    });
  });

  describe('permission', () => {
    it.each<NotificationPermission>(['default', 'granted', 'denied'])(
      "starts with the browser's current state: %s",
      (permission) => {
        fake.permission = permission;

        expect(create().permission()).toBe(permission);
      },
    );

    it('is off until the user switches it on, even if the browser already allows it', () => {
      fake.permission = 'granted';

      expect(create().enabled()).toBe(false);
    });

    it('re-reads the permission when the tab becomes visible again', () => {
      const service = create();

      fake.permission = 'denied'; // changed in the browser's site settings meanwhile
      setVisibility('visible');

      expect(service.permission()).toBe('denied');
    });
  });

  describe('enable', () => {
    it('asks the browser when it has not been asked yet, and switches on when allowed', async () => {
      const service = create();
      fake.answer = 'granted';

      expect(await service.enable()).toBe(true);

      expect(fake.prompts).toBe(1);
      expect(service.permission()).toBe('granted');
      expect(service.enabled()).toBe(true);
    });

    it('does not ask again when already allowed', async () => {
      fake.permission = 'granted';
      const service = create();

      await service.enable();

      expect(fake.prompts).toBe(0);
      expect(service.enabled()).toBe(true);
    });

    it.each<[string, NotificationPermission]>([
      ['blocks', 'denied'],
      ['dismisses the prompt', 'default'],
    ])('stays off when the user %s', async (_label, answer) => {
      const service = create();
      fake.answer = answer;

      expect(await service.enable()).toBe(false);

      expect(service.enabled()).toBe(false);
      expect(service.permission()).toBe(answer);
      expect(events).toEqual([]);
    });

    it('does not ask at all once blocked (browsers would ignore it anyway)', async () => {
      fake.permission = 'denied';
      const service = create();

      expect(await service.enable()).toBe(false);
      expect(fake.prompts).toBe(0);
    });

    it('logs switching on, once', async () => {
      fake.permission = 'granted';
      const service = create();

      await service.enable();
      await service.enable();

      expect(events).toEqual([{ type: 'notifications-toggled', enabled: true }]);
    });
  });

  describe('disable', () => {
    it('switches off and logs it', async () => {
      fake.permission = 'granted';
      const service = create();
      await service.enable();

      service.disable();

      expect(service.enabled()).toBe(false);
      expect(events.at(-1)).toEqual({ type: 'notifications-toggled', enabled: false });
    });

    it('logs nothing when it was already off', () => {
      const service = create();

      service.disable();

      expect(events).toEqual([]);
    });
  });

  describe('persistence', () => {
    it('remembers the choice across a reload', async () => {
      fake.permission = 'granted';
      await create().enable();
      TestBed.tick();

      TestBed.resetTestingModule();

      expect(create().enabled()).toBe(true);
    });

    it('stays off after a reload when the browser has blocked it meanwhile', () => {
      localStorage.setItem(STORAGE_KEY, 'true');
      fake.permission = 'denied';

      expect(create().enabled()).toBe(false);
    });

    it('comes back on its own once the browser allows it again', () => {
      localStorage.setItem(STORAGE_KEY, 'true');
      fake.permission = 'denied';
      const service = create();

      fake.permission = 'granted';
      setVisibility('visible');

      expect(service.enabled()).toBe(true);
    });

    it.each(['{broken', '"yes"', '1', 'null'])('treats stored %s as off', (raw) => {
      localStorage.setItem(STORAGE_KEY, raw);
      fake.permission = 'granted';

      expect(create().enabled()).toBe(false);
    });
  });

  describe('notify', () => {
    it('shows a notification with title, body and tag in a hidden tab', async () => {
      const service = await ready();

      service.notify('Zeit abgelaufen', MESSAGE);

      expect(fake.shown).toHaveLength(1);
      expect(fake.shown[0].title).toBe('Zeit abgelaufen');
      expect(fake.shown[0].options).toEqual({ body: 'Body', tag: 'pomodoro-task' });
    });

    it('shows nothing while the tab is visible (the snackbar is enough)', async () => {
      const service = await ready();
      setVisibility('visible');

      service.notify('Title', MESSAGE);

      expect(fake.shown).toEqual([]);
    });

    it('shows nothing when switched off', async () => {
      const service = await ready();
      service.disable();

      service.notify('Title', MESSAGE);

      expect(fake.shown).toEqual([]);
    });

    it('shows nothing when the browser blocked it meanwhile', async () => {
      const service = await ready();
      fake.permission = 'denied';
      setVisibility('hidden'); // the visibility change re-reads the permission

      service.notify('Title', MESSAGE);

      expect(fake.shown).toEqual([]);
    });

    it('does not break when the browser refuses to create one (Android Chrome)', async () => {
      const service = await ready();
      fake.throwOnCreate = true;

      expect(() => service.notify('Title', MESSAGE)).not.toThrow();
    });

    describe('clicking it', () => {
      it('brings the window to the front, runs onClick and closes it', async () => {
        const service = await ready();
        const focus = vi.spyOn(window, 'focus').mockImplementation(() => undefined);
        const onClick = vi.fn();
        service.notify('Title', { ...MESSAGE, onClick });

        fake.shown[0].click();

        expect(focus).toHaveBeenCalled();
        expect(onClick).toHaveBeenCalledOnce();
        expect(fake.shown[0].closed).toBe(true);
      });

      it('works without an onClick', async () => {
        const service = await ready();
        vi.spyOn(window, 'focus').mockImplementation(() => undefined);
        service.notify('Title', MESSAGE);

        expect(() => fake.shown[0].click()).not.toThrow();
        expect(fake.shown[0].closed).toBe(true);
      });
    });
  });
});

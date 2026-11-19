import type { AppEvent } from '../../domain/app-event';
import { describeEvent, EVENT_ICONS, isAlert } from './describe-event';

describe('describeEvent', () => {
  it.each<[AppEvent, string]>([
    [{ type: 'task-added', title: 'A' }, 'Aufgabe „A“ hinzugefügt'],
    [{ type: 'task-edited', from: 'A', to: 'B' }, 'Aufgabe „A“ umbenannt in „B“'],
    [{ type: 'task-deleted', title: 'A' }, 'Aufgabe „A“ gelöscht'],
    [{ type: 'task-started', title: 'A' }, 'Aufgabe „A“ gestartet'],
    [{ type: 'task-paused', title: 'A' }, 'Aufgabe „A“ pausiert'],
    [{ type: 'task-resumed', title: 'A' }, 'Aufgabe „A“ fortgesetzt'],
    [{ type: 'task-overdue', title: 'A' }, 'Zeit für „A“ abgelaufen'],
    [{ type: 'task-completed', title: 'A' }, 'Aufgabe „A“ erledigt'],
    [{ type: 'task-moved', title: 'A', position: 2 }, 'Aufgabe „A“ auf Position 2 verschoben'],
    [{ type: 'break-started', kind: 'short' }, 'Kurze Pause gestartet'],
    [{ type: 'break-started', kind: 'long' }, 'Lange Pause gestartet'],
    [{ type: 'break-over', kind: 'short' }, 'Kurze Pause vorbei'],
    [{ type: 'break-ended', kind: 'long' }, 'Lange Pause beendet'],
    [
      {
        type: 'settings-changed',
        settings: { pomodoroMinutes: 30, smallBreakMinutes: 5, largeBreakMinutes: 20 },
      },
      'Einstellungen geändert: 30 min Arbeit, 5 min kurze Pause, 20 min lange Pause',
    ],
    [{ type: 'notifications-toggled', enabled: true }, 'Desktop-Benachrichtigungen eingeschaltet'],
    [{ type: 'notifications-toggled', enabled: false }, 'Desktop-Benachrichtigungen ausgeschaltet'],
    [{ type: 'sound-toggled', enabled: true }, 'Ton eingeschaltet'],
    [{ type: 'sound-toggled', enabled: false }, 'Ton ausgeschaltet'],
    [{ type: 'sample-data-loaded', count: 1 }, '1 Beispielaufgabe geladen'],
    [{ type: 'sample-data-loaded', count: 5 }, '5 Beispielaufgaben geladen'],
    [{ type: 'app-reset' }, 'Alles zurückgesetzt'],
  ])('describes %o as "%s"', (event, text) => {
    expect(describeEvent(event)).toBe(text);
  });
});

describe('EVENT_ICONS', () => {
  it('has a non-empty icon for every event type', () => {
    for (const icon of Object.values(EVENT_ICONS)) {
      expect(icon).toMatch(/^[a-z_]+$/);
    }
  });
});

describe('isAlert', () => {
  it.each<[AppEvent, boolean]>([
    [{ type: 'task-overdue', title: 'A' }, true],
    [{ type: 'break-over', kind: 'short' }, true],
    [{ type: 'task-completed', title: 'A' }, false],
    [{ type: 'break-ended', kind: 'short' }, false],
    [{ type: 'app-reset' }, false],
  ])('treats %o as alert: %s', (event, expected) => {
    expect(isAlert(event)).toBe(expected);
  });
});

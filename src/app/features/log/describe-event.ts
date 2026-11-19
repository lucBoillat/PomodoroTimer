import type { AppEvent, AppEventType } from '../../domain/app-event';

const BREAK_NAMES = { short: 'Kurze Pause', long: 'Lange Pause' } as const;

/**
 * The German log text for an event.
 * The switch is exhaustive: add an event type without a case here and the compiler
 * complains that not every path returns a string. Inside each case TypeScript narrows
 * `event`, so e.g. `event.from` only exists for 'task-edited'.
 */
export function describeEvent(event: AppEvent): string {
  switch (event.type) {
    case 'task-added':
      return `Aufgabe „${event.title}“ hinzugefügt`;
    case 'task-edited':
      return `Aufgabe „${event.from}“ umbenannt in „${event.to}“`;
    case 'task-deleted':
      return `Aufgabe „${event.title}“ gelöscht`;
    case 'task-started':
      return `Aufgabe „${event.title}“ gestartet`;
    case 'task-paused':
      return `Aufgabe „${event.title}“ pausiert`;
    case 'task-resumed':
      return `Aufgabe „${event.title}“ fortgesetzt`;
    case 'task-overdue':
      return `Zeit für „${event.title}“ abgelaufen`;
    case 'task-completed':
      return `Aufgabe „${event.title}“ erledigt`;
    case 'break-started':
      return `${BREAK_NAMES[event.kind]} gestartet`;
    case 'break-over':
      return `${BREAK_NAMES[event.kind]} vorbei`;
    case 'break-ended':
      return `${BREAK_NAMES[event.kind]} beendet`;
    case 'settings-changed': {
      const s = event.settings;
      return (
        `Einstellungen geändert: ${s.pomodoroMinutes} min Arbeit, ` +
        `${s.smallBreakMinutes} min kurze Pause, ${s.largeBreakMinutes} min lange Pause`
      );
    }
    case 'sample-data-loaded':
      return event.count === 1
        ? '1 Beispielaufgabe geladen'
        : `${event.count} Beispielaufgaben geladen`;
    case 'app-reset':
      return 'Alles zurückgesetzt';
  }
}

/** A Material Symbols icon per event. A Record, so a missing type is a compile error too. */
export const EVENT_ICONS: Record<AppEventType, string> = {
  'task-added': 'add',
  'task-edited': 'edit',
  'task-deleted': 'delete',
  'task-started': 'play_arrow',
  'task-paused': 'pause',
  'task-resumed': 'play_arrow',
  'task-overdue': 'alarm',
  'task-completed': 'check',
  'break-started': 'coffee',
  'break-over': 'alarm',
  'break-ended': 'coffee',
  'settings-changed': 'settings',
  'sample-data-loaded': 'dataset',
  'app-reset': 'restart_alt',
};

/** Events that need the user's attention; the log highlights them. */
export function isAlert(event: AppEvent): boolean {
  return event.type === 'task-overdue' || event.type === 'break-over';
}

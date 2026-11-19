import { appEventSchema } from './app-event';

describe('appEventSchema', () => {
  it.each([
    { type: 'task-added', title: 'A' },
    { type: 'task-edited', from: 'A', to: 'B' },
    { type: 'task-deleted', title: 'A' },
    { type: 'task-started', title: 'A' },
    { type: 'task-paused', title: 'A' },
    { type: 'task-resumed', title: 'A' },
    { type: 'task-overdue', title: 'A' },
    { type: 'task-completed', title: 'A' },
    { type: 'break-started', kind: 'short' },
    { type: 'break-over', kind: 'long' },
    { type: 'break-ended', kind: 'short' },
    {
      type: 'settings-changed',
      settings: { pomodoroMinutes: 25, smallBreakMinutes: 5, largeBreakMinutes: 15 },
    },
    { type: 'sample-data-loaded', count: 3 },
    { type: 'app-reset' },
  ])('accepts a valid $type event', (event) => {
    expect(appEventSchema.parse(event)).toEqual(event);
  });

  it.each([
    ['an unknown type', { type: 'task-exploded', title: 'A' }],
    ['a missing type', { title: 'A' }],
    ['a missing field', { type: 'task-added' }],
    ['a field of the wrong type', { type: 'task-added', title: 42 }],
    ['an unknown break kind', { type: 'break-started', kind: 'medium' }],
    ['a half edit', { type: 'task-edited', from: 'A' }],
    ['invalid settings', { type: 'settings-changed', settings: { pomodoroMinutes: 0 } }],
    ['a negative count', { type: 'sample-data-loaded', count: -1 }],
    ['null', null],
    ['a string', 'task-added'],
  ])('rejects %s', (_label, input) => {
    expect(() => appEventSchema.parse(input)).toThrow();
  });

  it('drops unknown extra fields', () => {
    expect(appEventSchema.parse({ type: 'app-reset', extra: true })).toEqual({ type: 'app-reset' });
  });
});

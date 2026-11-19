import { z } from 'zod';
import { settingsSchema } from './settings';

const breakKind = z.enum(['short', 'long']);

/**
 * Everything that can happen in the app, as plain data.
 * Events carry titles rather than ids, so the log stays readable after a task is deleted.
 * They carry no timestamp: whoever records them (the log) adds the time.
 */
export const appEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('task-added'), title: z.string() }),
  z.object({ type: z.literal('task-edited'), from: z.string(), to: z.string() }),
  z.object({ type: z.literal('task-deleted'), title: z.string() }),
  z.object({ type: z.literal('task-started'), title: z.string() }),
  z.object({ type: z.literal('task-paused'), title: z.string() }),
  z.object({ type: z.literal('task-resumed'), title: z.string() }),
  z.object({ type: z.literal('task-overdue'), title: z.string() }),
  z.object({ type: z.literal('task-completed'), title: z.string() }),
  // position: 1-based place in the queue after the move
  z.object({ type: z.literal('task-moved'), title: z.string(), position: z.int().min(1) }),
  z.object({ type: z.literal('break-started'), kind: breakKind }),
  z.object({ type: z.literal('break-over'), kind: breakKind }),
  z.object({ type: z.literal('break-ended'), kind: breakKind }),
  z.object({ type: z.literal('settings-changed'), settings: settingsSchema }),
  z.object({ type: z.literal('notifications-toggled'), enabled: z.boolean() }),
  z.object({ type: z.literal('sound-toggled'), enabled: z.boolean() }),
  z.object({ type: z.literal('sample-data-loaded'), count: z.int().min(0) }),
  z.object({ type: z.literal('app-reset') }),
]);

export type AppEvent = z.output<typeof appEventSchema>;
export type AppEventType = AppEvent['type'];

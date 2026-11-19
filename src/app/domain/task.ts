import { z } from 'zod';

const taskStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('running'), endsAt: z.number() }),
  z.object({ status: z.literal('paused'), remainingMs: z.number().positive() }),
  z.object({ status: z.literal('done') }),
]);
export type TaskState = Readonly<z.infer<typeof taskStateSchema>>;

export const TASK_TITLE_MAX_LENGTH = 40;

const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(TASK_TITLE_MAX_LENGTH),
  state: taskStateSchema,
});
export const createTaskSchema = taskSchema.pick({ title: true });

type TaskInput = z.input<typeof createTaskSchema>;
export type TaskProps = Readonly<z.output<typeof taskSchema>>;

export class Task implements TaskProps {
  private constructor(
    readonly id: string,
    readonly title: string,
    readonly state: TaskState,
  ) {}

  // used for instancing from form data
  static create(input: TaskInput): Task {
    const p = createTaskSchema.parse(input);
    return new Task(crypto.randomUUID(), p.title, { status: 'pending' });
  }

  // used for instancing from localStorage
  static parse(input: unknown): Task {
    const p = taskSchema.parse(input);
    return new Task(p.id, p.title, p.state);
  }

  isPending(): boolean {
    return this.state.status === 'pending';
  }
  isRunning(): boolean {
    return this.state.status === 'running';
  }

  isPaused(): boolean {
    return this.state.status === 'paused';
  }
  isDone(): boolean {
    return this.state.status === 'done';
  }
  isOverdue(now: number): boolean {
    return this.state.status === 'running' && now >= this.state.endsAt;
  }
  private canEditOrDelete(): boolean {
    return this.state.status === 'pending' || this.state.status === 'done';
  }

  canEdit(): boolean {
    return this.canEditOrDelete();
  }
  canDelete(): boolean {
    return this.canEditOrDelete();
  }

  edit(newTitle: string): Task {
    if (!this.canEdit()) {
      throw new InvalidTransitionError('edit', this.state.status);
    }
    return Task.parse({ ...this.toJSON(), title: newTitle });
  }

  start(now: number, durationMs: number): Task {
    if (this.state.status !== 'pending') {
      throw new InvalidTransitionError('start', this.state.status);
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error(`Duration must be a positive number of milliseconds, got ${durationMs}`);
    }
    return new Task(this.id, this.title, { status: 'running', endsAt: now + durationMs });
  }
  pause(now: number): Task {
    if (this.state.status !== 'running') {
      throw new InvalidTransitionError('pause', this.state.status);
    }
    if (this.isOverdue(now)) {
      throw new InvalidTransitionError('pause', this.state.status, 'its time has already run out');
    }
    return new Task(this.id, this.title, {
      status: 'paused',
      remainingMs: this.state.endsAt - now,
    });
  }
  resume(now: number): Task {
    if (this.state.status !== 'paused') {
      throw new InvalidTransitionError('resume', this.state.status);
    }
    return new Task(this.id, this.title, {
      status: 'running',
      endsAt: now + this.state.remainingMs,
    });
  }

  complete(): Task {
    if (this.state.status === 'done') {
      throw new InvalidTransitionError('complete', this.state.status);
    }
    return new Task(this.id, this.title, { status: 'done' });
  }
  remainingMs(now: number): number | null {
    switch (this.state.status) {
      case 'running':
        return Math.max(0, this.state.endsAt - now);
      case 'paused':
        return this.state.remainingMs;
      case 'pending':
      case 'done':
        return null;
    }
  }

  overdueByMs(now: number): number {
    if (this.state.status !== 'running') {
      return 0;
    }
    return Math.max(0, now - this.state.endsAt);
  }

  toJSON(): TaskProps {
    return {
      id: this.id,
      title: this.title,
      state: this.state,
    };
  }
}
export class InvalidTransitionError extends Error {
  override readonly name = 'InvalidTransitionError';

  constructor(
    readonly action: string,
    readonly status: TaskState['status'],
    reason?: string,
  ) {
    super(`Cannot ${action} a ${status} task${reason ? `: ${reason}` : ''}`);
  }
}

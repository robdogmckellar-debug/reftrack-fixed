export interface CheckinSchedulerOptions {
  /** Triggers a "check in all" run. Implementations should swallow expected
   * errors (no enabled sites, a run already in progress). */
  run(): void;
  now?(): Date;
  setTimer?(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimer?(handle: ReturnType<typeof setTimeout>): void;
  /** Local hour (0-23) at which the daily run fires. Defaults to 0 (12am). */
  hour?: number;
  /** Local minute (0-59) at which the daily run fires. Defaults to 10. */
  minute?: number;
  onError?(error: unknown): void;
}

/**
 * Fires a callback once per day at a fixed local wall-clock time (12:10am by
 * default). The delay is recomputed from the current time on every tick so it
 * self-corrects for clock changes, DST transitions and machine sleep.
 *
 * This only runs while the application is open; it cannot wake a closed app.
 */
export class CheckinScheduler {
  private readonly hour: number;
  private readonly minute: number;
  private handle: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly options: CheckinSchedulerOptions) {
    this.hour = clamp(options.hour ?? 0, 0, 23);
    this.minute = clamp(options.minute ?? 10, 0, 59);
  }

  start(): void {
    if (this.disposed || this.handle !== null) return;
    this.schedule();
  }

  dispose(): void {
    this.disposed = true;
    if (this.handle !== null) {
      (this.options.clearTimer ?? clearTimeout)(this.handle);
      this.handle = null;
    }
  }

  msUntilNextRun(from: Date): number {
    const next = new Date(from);
    next.setHours(this.hour, this.minute, 0, 0);
    if (next.getTime() <= from.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime() - from.getTime();
  }

  private schedule(): void {
    if (this.disposed) return;
    const now = this.options.now ? this.options.now() : new Date();
    const delay = Math.max(0, this.msUntilNextRun(now));
    const setTimer = this.options.setTimer ?? setTimeout;
    this.handle = setTimer(() => {
      this.handle = null;
      this.fire();
    }, delay);
  }

  private fire(): void {
    if (this.disposed) return;
    try {
      this.options.run();
    } catch (error: unknown) {
      this.options.onError?.(error);
    }
    this.schedule();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

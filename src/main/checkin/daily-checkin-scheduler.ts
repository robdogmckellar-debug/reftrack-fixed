export interface DailyCheckinSchedule {
  enabled: boolean;
  time: string;
  lastRunDate: string | null;
}

export type ScheduledCheckinStartResult = 'started' | 'busy';

export interface DailyCheckinSchedulerOptions {
  getSchedule(): DailyCheckinSchedule;
  startRun(): ScheduledCheckinStartResult;
  markAttempt(date: string): Promise<void>;
  onError(error: unknown): void;
  now?(): Date;
}

const POLL_INTERVAL_MS = 30_000;

export class DailyCheckinScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private checking = false;
  private attemptedDate: string | null = null;

  constructor(private readonly options: DailyCheckinSchedulerOptions) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.runTick();
  }

  refresh(): void {
    if (!this.started) return;
    this.clearTimer();
    void this.runTick();
  }

  dispose(): void {
    this.started = false;
    this.clearTimer();
  }

  async checkNow(): Promise<void> {
    if (this.checking) return;
    this.checking = true;

    try {
      const now = this.options.now?.() ?? new Date();
      const date = localDateKey(now);
      const schedule = this.options.getSchedule();
      if (!isDue(schedule, now, date) || this.attemptedDate === date) return;

      this.attemptedDate = date;
      let outcome: ScheduledCheckinStartResult;
      try {
        outcome = this.options.startRun();
      } catch (error: unknown) {
        this.options.onError(error);
        outcome = 'started';
      }

      if (outcome === 'busy') {
        this.attemptedDate = null;
        return;
      }

      try {
        await this.options.markAttempt(date);
      } catch (error: unknown) {
        this.options.onError(error);
      }
    } finally {
      this.checking = false;
    }
  }

  private async runTick(): Promise<void> {
    await this.checkNow();
    if (this.started) this.scheduleNextTick();
  }

  private scheduleNextTick(): void {
    this.clearTimer();
    this.timer = setTimeout(() => void this.runTick(), POLL_INTERVAL_MS);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

function isDue(schedule: DailyCheckinSchedule, now: Date, date: string): boolean {
  if (!schedule.enabled || schedule.lastRunDate === date) return false;
  return localTime(now) >= schedule.time;
}

function localDateKey(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function localTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

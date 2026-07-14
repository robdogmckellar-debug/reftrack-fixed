import { describe, expect, it, vi } from 'vitest';

import {
  DailyCheckinScheduler,
  type DailyCheckinSchedule,
} from '../../src/main/checkin/daily-checkin-scheduler';

function createHarness(options: {
  now: Date;
  schedule?: Partial<DailyCheckinSchedule>;
  startResult?: 'started' | 'busy';
}) {
  let now = options.now;
  const schedule: DailyCheckinSchedule = {
    enabled: true,
    time: '09:00',
    lastRunDate: null,
    ...options.schedule,
  };
  const startRun = vi.fn(() => options.startResult ?? 'started');
  const markAttempt = vi.fn(async (date: string) => {
    schedule.lastRunDate = date;
  });
  const onError = vi.fn();
  const scheduler = new DailyCheckinScheduler({
    getSchedule: () => schedule,
    startRun,
    markAttempt,
    onError,
    now: () => now,
  });

  return {
    scheduler,
    schedule,
    startRun,
    markAttempt,
    onError,
    setNow: (value: Date) => {
      now = value;
    },
  };
}

describe('DailyCheckinScheduler', () => {
  it('waits until the configured local time and runs only once that day', async () => {
    const harness = createHarness({ now: new Date(2026, 6, 15, 8, 59) });

    await harness.scheduler.checkNow();
    expect(harness.startRun).not.toHaveBeenCalled();

    harness.setNow(new Date(2026, 6, 15, 9, 0));
    await harness.scheduler.checkNow();
    await harness.scheduler.checkNow();

    expect(harness.startRun).toHaveBeenCalledTimes(1);
    expect(harness.markAttempt).toHaveBeenCalledWith('2026-07-15');
  });

  it('catches up after the configured time when RefTrack resumes or starts late', async () => {
    const harness = createHarness({ now: new Date(2026, 6, 15, 14, 30) });

    await harness.scheduler.checkNow();

    expect(harness.startRun).toHaveBeenCalledTimes(1);
  });

  it('honours a persisted run date after an application restart', async () => {
    const harness = createHarness({
      now: new Date(2026, 6, 15, 14, 30),
      schedule: { lastRunDate: '2026-07-15' },
    });

    await harness.scheduler.checkNow();

    expect(harness.startRun).not.toHaveBeenCalled();
    expect(harness.markAttempt).not.toHaveBeenCalled();
  });

  it('retries later when a manual check-in is already running', async () => {
    const harness = createHarness({
      now: new Date(2026, 6, 15, 9, 0),
      startResult: 'busy',
    });

    await harness.scheduler.checkNow();
    expect(harness.markAttempt).not.toHaveBeenCalled();

    harness.startRun.mockReturnValue('started');
    await harness.scheduler.checkNow();

    expect(harness.startRun).toHaveBeenCalledTimes(2);
    expect(harness.markAttempt).toHaveBeenCalledWith('2026-07-15');
  });

  it('does nothing while the schedule is disabled', async () => {
    const harness = createHarness({
      now: new Date(2026, 6, 15, 14, 30),
      schedule: { enabled: false },
    });

    await harness.scheduler.checkNow();

    expect(harness.startRun).not.toHaveBeenCalled();
  });
});

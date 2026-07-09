import { describe, expect, it, vi } from 'vitest';

import { CheckinScheduler } from '../../src/main/checkin/checkin-scheduler';

interface FakeTimer {
  callback: () => void;
  delayMs: number;
}

describe('CheckinScheduler', () => {
  it('waits until the next 12:10am when started in the afternoon', () => {
    const scheduler = new CheckinScheduler({ run: vi.fn() });
    const from = new Date('2026-07-07T14:00:00');
    // 10 hours to midnight + 10 minutes = 10h10m.
    expect(scheduler.msUntilNextRun(from)).toBe((10 * 60 + 10) * 60 * 1000);
  });

  it('rolls over to the following day when already past the target time', () => {
    const scheduler = new CheckinScheduler({ run: vi.fn() });
    const from = new Date('2026-07-07T00:10:00');
    expect(scheduler.msUntilNextRun(from)).toBe(24 * 60 * 60 * 1000);
  });

  it('honours a custom target time', () => {
    const scheduler = new CheckinScheduler({ run: vi.fn(), hour: 3, minute: 30 });
    const from = new Date('2026-07-07T01:00:00');
    expect(scheduler.msUntilNextRun(from)).toBe((2 * 60 + 30) * 60 * 1000);
  });

  it('fires the run callback at the scheduled time and reschedules for the next day', () => {
    let now = new Date('2026-07-07T14:00:00');
    const timers: FakeTimer[] = [];
    const run = vi.fn();

    const scheduler = new CheckinScheduler({
      run,
      now: () => now,
      setTimer: (callback, delayMs) => {
        timers.push({ callback, delayMs });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: vi.fn(),
    });

    scheduler.start();
    expect(timers).toHaveLength(1);
    expect(run).not.toHaveBeenCalled();

    // Advance to the fire time and trigger the scheduled callback.
    now = new Date('2026-07-08T00:10:00');
    timers[0]?.callback();

    expect(run).toHaveBeenCalledTimes(1);
    // A fresh timer for the following day is queued.
    expect(timers).toHaveLength(2);
    expect(timers[1]?.delayMs).toBe(24 * 60 * 60 * 1000);
  });

  it('reports run errors and still reschedules', () => {
    let now = new Date('2026-07-07T14:00:00');
    const timers: FakeTimer[] = [];
    const onError = vi.fn();

    const scheduler = new CheckinScheduler({
      run: () => {
        throw new Error('boom');
      },
      onError,
      now: () => now,
      setTimer: (callback, delayMs) => {
        timers.push({ callback, delayMs });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
    });

    scheduler.start();
    now = new Date('2026-07-08T00:10:00');
    timers[0]?.callback();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(2);
  });

  it('stops firing after dispose', () => {
    const clearTimer = vi.fn();
    const timers: FakeTimer[] = [];
    const run = vi.fn();

    const scheduler = new CheckinScheduler({
      run,
      now: () => new Date('2026-07-07T14:00:00'),
      setTimer: (callback, delayMs) => {
        timers.push({ callback, delayMs });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer,
    });

    scheduler.start();
    scheduler.dispose();
    expect(clearTimer).toHaveBeenCalledTimes(1);

    // A late timer callback must not run or reschedule after disposal.
    timers[0]?.callback();
    expect(run).not.toHaveBeenCalled();
    expect(timers).toHaveLength(1);
  });
});

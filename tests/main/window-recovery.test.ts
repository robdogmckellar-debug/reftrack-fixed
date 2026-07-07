import type { RenderProcessGoneDetails } from 'electron';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { quit: vi.fn() },
  dialog: { showMessageBox: vi.fn() },
}));

import { RendererRecoveryController } from '../../src/main/application/window-recovery';

interface Harness {
  controller: RendererRecoveryController;
  reload: ReturnType<typeof vi.fn>;
  onExhausted: ReturnType<typeof vi.fn>;
  scheduled: { callback: () => void; ms: number }[];
  runNext: () => void;
  setNow: (value: number) => void;
}

function crash(reason: RenderProcessGoneDetails['reason'] = 'crashed'): RenderProcessGoneDetails {
  return { reason, exitCode: 133 } as RenderProcessGoneDetails;
}

function makeHarness(overrides: { maxReloads?: number; resetAfterMs?: number } = {}): Harness {
  const reload = vi.fn();
  const onExhausted = vi.fn();
  const scheduled: { callback: () => void; ms: number }[] = [];
  let now = 1_000;

  const controller = new RendererRecoveryController({
    maxReloads: overrides.maxReloads ?? 3,
    resetAfterMs: overrides.resetAfterMs ?? 60_000,
    backoffMsFor: (attempt) => attempt * 100,
    now: () => now,
    setTimer: (callback, ms) => {
      scheduled.push({ callback, ms });
      return 0 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => undefined,
    reload,
    isDestroyed: () => false,
    onExhausted,
  });

  return {
    controller,
    reload,
    onExhausted,
    scheduled,
    runNext: () => scheduled.shift()?.callback(),
    setNow: (value) => {
      now = value;
    },
  };
}

describe('RendererRecoveryController', () => {
  it('ignores clean exits (normal teardown)', () => {
    const h = makeHarness();
    h.controller.handleRenderProcessGone(crash('clean-exit'));
    expect(h.scheduled).toHaveLength(0);
    expect(h.onExhausted).not.toHaveBeenCalled();
  });

  it('reloads with increasing backoff after a crash', () => {
    const h = makeHarness();
    h.controller.handleRenderProcessGone(crash());
    expect(h.scheduled[0]?.ms).toBe(100);
    h.runNext();
    expect(h.reload).toHaveBeenCalledOnce();

    h.controller.handleRenderProcessGone(crash());
    expect(h.scheduled[0]?.ms).toBe(200);
  });

  it('prompts instead of reloading once the crash loop exceeds the limit', () => {
    const h = makeHarness({ maxReloads: 2 });
    h.controller.handleRenderProcessGone(crash());
    h.controller.handleRenderProcessGone(crash());
    expect(h.onExhausted).not.toHaveBeenCalled();

    h.controller.handleRenderProcessGone(crash());
    expect(h.onExhausted).toHaveBeenCalledOnce();
    // Third crash schedules no further reload.
    expect(h.scheduled).toHaveLength(2);
  });

  it('starts a fresh incident after a quiet period', () => {
    const h = makeHarness({ maxReloads: 1 });
    h.controller.handleRenderProcessGone(crash());
    h.controller.handleRenderProcessGone(crash());
    expect(h.onExhausted).toHaveBeenCalledOnce();

    h.setNow(1_000 + 120_000);
    h.controller.handleRenderProcessGone(crash());
    // Counter reset by the quiet period, so it reloads again rather than prompting twice.
    expect(h.onExhausted).toHaveBeenCalledOnce();
    expect(h.reload).not.toHaveBeenCalled();
    expect(h.scheduled.at(-1)?.ms).toBe(100);
  });
});

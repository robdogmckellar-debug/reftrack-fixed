import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

import {
  buildClickScript,
  buildExistsScript,
  buildFillLoginScript,
  buildReadCheckinStateScript,
  buildVerifyCheckinStateScript,
} from '../../src/main/checkin/checkin-scripts';
import type {
  CheckinPageState,
  CheckinVerificationResult,
} from '../../src/main/checkin/checkin-scripts';

function runPageScript<T>(text: string, script: string): T {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
  Object.defineProperty(dom.window.document.body, 'innerText', {
    configurable: true,
    value: text,
  });
  return dom.window.eval(script) as T;
}

describe('check-in page scripts', () => {
  it('fills credentials, dispatches events and clicks the submit control', () => {
    const script = buildFillLoginScript(
      {
        usernameSelectors: ['form input[type="text"]', 'input[type="email"]'],
        passwordSelectors: ['form input[type="password"]'],
        submitSelectors: ['form a.btn.login'],
      },
      { username: 'alice', password: 'p@ss"word' },
    );

    expect(script).toContain('form input[type=\\"text\\"]');
    expect(script).toContain('form a.btn.login');
    expect(script).toContain('"alice"');
    // The password is safely JSON-encoded (quote escaped) rather than raw.
    expect(script).toContain(JSON.stringify('p@ss"word'));
    expect(script).toContain("dispatchEvent(new Event('input'");
    expect(script).toContain('submit.click()');
  });

  it('builds click and existence probes that try selectors in priority order', () => {
    const clickScript = buildClickScript([
      '.checkin-page-button-container button.checkin-page-button',
      'button.checkin-page-button',
    ]);
    expect(clickScript).toContain('.checkin-page-button-container button.checkin-page-button');
    expect(clickScript).toContain('button.checkin-page-button');

    const existsScript = buildExistsScript(['button.btn-secondary-flex']);
    expect(existsScript).toContain('button.btn-secondary-flex');
  });

  it('reads check-in day and token values from visible page text', () => {
    const state = runPageScript<CheckinPageState>(
      'Daily check-in day 6\nToken balance: 1,240 tokens',
      buildReadCheckinStateScript(),
    );

    expect(state.day).toBe(6);
    expect(state.tokens).toBe(1240);
    expect(state.tokenReward).toBeNull();
    expect(state.tokenAmounts).toContain(1240);
    expect(state.completed).toBe(false);
  });

  it('confirms a check-in only when day or token evidence changes', () => {
    const before: CheckinPageState = {
      day: 6,
      tokens: 1240,
      tokenReward: null,
      tokenAmounts: [1240],
      completed: false,
    };

    const verified = runPageScript<CheckinVerificationResult>(
      'Daily check-in day 7\nToken balance: 1,250 tokens',
      buildVerifyCheckinStateScript(before),
    );
    expect(verified.confirmed).toBe(true);
    expect(verified.reason).toBe('day-advanced');
    expect(verified.tokenDelta).toBe(10);

    const unchanged = runPageScript<CheckinVerificationResult>(
      'Daily check-in day 6\nToken balance: 1,240 tokens',
      buildVerifyCheckinStateScript(before),
    );
    expect(unchanged.confirmed).toBe(false);

    const rewardOnly = runPageScript<CheckinVerificationResult>(
      'Check-in completed\nReceived 10 tokens',
      buildVerifyCheckinStateScript({ ...before, day: null, tokens: null }),
    );
    expect(rewardOnly.confirmed).toBe(true);
    expect(rewardOnly.reason).toBe('tokens-increased');
    expect(rewardOnly.tokensToday).toBe(10);

    const completedTextOnly = runPageScript<CheckinVerificationResult>(
      'Daily check-in completed successfully',
      buildVerifyCheckinStateScript({ ...before, day: null, tokens: null }),
    );
    expect(completedTextOnly.confirmed).toBe(false);
  });
});

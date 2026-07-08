import { describe, expect, it } from 'vitest';

import {
  buildClickScript,
  buildExistsScript,
  buildFillLoginScript,
  buildTextIncludesScript,
} from '../../src/main/checkin/checkin-scripts';

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

  it('builds a page-text probe for check-in confirmation phrases', () => {
    const script = buildTextIncludesScript(['you have earned', 'token today']);
    expect(script).toContain('innerText');
    expect(script).toContain('you have earned');
    expect(script).toContain('token today');
    expect(script).toContain('toLowerCase()');
  });
});

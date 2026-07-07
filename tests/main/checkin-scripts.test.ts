import { describe, expect, it } from 'vitest';

import {
  buildClickScript,
  buildExistsScript,
  buildFillLoginScript,
} from '../../src/main/checkin/checkin-scripts';

describe('check-in page scripts', () => {
  it('fills credentials, dispatches events and clicks the submit control', () => {
    const script = buildFillLoginScript(
      {
        usernameSelector: 'form input[type="text"]',
        passwordSelector: 'form input[type="password"]',
        submitSelector: 'form a.btn.login',
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

  it('builds click and existence probes for a selector', () => {
    expect(buildClickScript('.checkin-page-button-container button.checkin-page-button')).toContain(
      'querySelector(".checkin-page-button-container button.checkin-page-button")',
    );
    expect(buildExistsScript('button.btn-secondary-flex')).toContain(
      'querySelector("button.btn-secondary-flex")',
    );
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildSiteDraftPreview,
  createEmptySiteDraft,
  siteToDraft,
  validateSiteDraft,
} from '../../src/renderer/screens/site-editor/site-editor-model';

describe('site editor model', () => {
  it('converts an existing site into stable editable text values', () => {
    expect(
      siteToDraft({
        id: 'site-alpha',
        name: 'ALPHA',
        url: 'https://alpha.example/ref',
        prefix: 'Join',
        suffix: 'Today',
        dateFormat: 'dd/mm hh:MM',
        bonus: 30,
        maxCopiesPerDay: 2,
        copies: 4,
        successes: 1,
        earnings: 30,
      }),
    ).toEqual({
      name: 'ALPHA',
      url: 'https://alpha.example/ref',
      prefix: 'Join',
      suffix: 'Today',
      dateFormat: 'dd/mm hh:MM',
      bonus: '30.00',
      maxCopiesPerDay: '2',
      notes: '',
      payoutThreshold: '0.00',
      appClaimEnabled: false,
      appClaimDownloadUrl: '',
      appClaimApkPath: '',
      appClaimPackageName: '',
      appClaimDeepLinkUrl: '',
      appClaimAvdName: '',
    });
  });

  it('normalises a valid draft into the typed IPC request', () => {
    const result = validateSiteDraft(
      {
        name: ' alpha ',
        url: 'https://alpha.example/ref',
        prefix: ' Join ',
        suffix: ' Today ',
        dateFormat: '',
        bonus: '30.50',
        maxCopiesPerDay: '2',
        notes: 'Pays monthly',
        payoutThreshold: '100.00',
      },
      'site-alpha',
    );

    expect(result.errors).toEqual({});
    expect(result.request).toEqual({
      id: 'site-alpha',
      name: 'ALPHA',
      url: 'https://alpha.example/ref',
      prefix: 'Join',
      suffix: 'Today',
      dateFormat: '',
      bonusCents: 3050,
      maxCopiesPerDay: 2,
      notes: 'Pays monthly',
      payoutThresholdCents: 10000,
      appClaim: {
        enabled: false,
        downloadUrl: '',
        apkPath: null,
        packageName: '',
        deepLinkUrl: '',
        avdName: '',
      },
    });
  });

  it('rejects insecure URLs, malformed currency, and invalid daily limits', () => {
    const draft = createEmptySiteDraft();
    const result = validateSiteDraft(
      {
        ...draft,
        name: 'Alpha',
        url: 'http://alpha.example/ref',
        bonus: '1.999',
        maxCopiesPerDay: '-1',
      },
      null,
    );

    expect(result.request).toBeNull();
    expect(result.errors.url).toContain('HTTPS');
    expect(result.errors.bonus).toContain('two decimal');
    expect(result.errors.maxCopiesPerDay).toContain('whole number');
  });

  it('builds the exact link preview with a deterministic timestamp', () => {
    const preview = buildSiteDraftPreview(
      {
        name: 'ALPHA',
        url: 'https://alpha.example/ref',
        prefix: 'Join',
        suffix: 'Today',
        dateFormat: 'yyyy-mm-dd hh:MM:ss',
        bonus: '30.00',
        maxCopiesPerDay: '1',
        notes: '',
        payoutThreshold: '0.00',
        appClaimEnabled: false,
        appClaimDownloadUrl: '',
        appClaimApkPath: '',
        appClaimPackageName: '',
        appClaimDeepLinkUrl: '',
        appClaimAvdName: '',
      },
      new Date(2026, 5, 30, 9, 5, 7),
    );

    expect(preview).toBe('Join https://alpha.example/ref 2026-06-30 09:05:07 Today');
  });
});

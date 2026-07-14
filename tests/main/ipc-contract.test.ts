import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS } from '../../src/shared/ipc/channels';
import {
  AddTaskSitesToCategoriesRequestSchema,
  CheckinSaveCredentialsRequestSchema,
  CheckinStartRequestSchema,
  CopyLinkRequestSchema,
  SetCheckinScheduleRequestSchema,
  SiteUpsertRequestSchema,
  TaskCategoryUpsertRequestSchema,
  TaskCompletionRequestSchema,
} from '../../src/shared/ipc/schemas';
import { validateExternalUrl } from '../../src/main/ipc/url-policy';
import { validateImporterUrl } from '../../src/main/importer/network-policy';
import { isTrustedRendererUrl } from '../../src/main/ipc/validate-sender';

describe('typed IPC contract', () => {
  it('uses unique namespaced channels and has no generic save channel', () => {
    const channels = Object.values(IPC_CHANNELS);
    expect(new Set(channels).size).toBe(channels.length);
    expect(channels.every((channel) => channel.includes(':'))).toBe(true);
    expect(channels).not.toContain('save-data');
    expect(channels).not.toContain('load-data');
    expect(channels).not.toContain('image-cleaner:clear-legacy');
    expect(channels).toContain('image-cleaner:completed');
    expect(channels).toContain('image-cleaner:run');
    expect(channels).toContain('checkin:start');
    expect(channels).toContain('checkin:cancel');
    expect(channels).toContain('checkin:save-credentials');
    expect(channels).toContain('checkin:delete-credentials');
    expect(channels).toContain('checkin:progress');
    expect(channels).toContain('checkin:completed');
    expect(channels).toContain('settings:set-checkin-schedule');
    expect(channels).toContain('window:hide-to-tray');
    expect(channels).toContain('tasks:add-sites-to-categories');
  });

  it('accepts only valid daily check-in schedule times', () => {
    expect(SetCheckinScheduleRequestSchema.parse({ enabled: true, time: '09:30' })).toEqual({
      enabled: true,
      time: '09:30',
    });
    expect(() => SetCheckinScheduleRequestSchema.parse({ enabled: true, time: '24:00' })).toThrow();
    expect(() => SetCheckinScheduleRequestSchema.parse({ enabled: true, time: '9:30' })).toThrow();
  });

  it('validates bulk category membership requests', () => {
    expect(
      AddTaskSitesToCategoriesRequestSchema.parse({
        sites: [{ id: 'site-a', name: 'Alpha', url: 'https://alpha.example' }],
        categoryIds: ['category-a'],
        newCategory: null,
      }).categoryIds,
    ).toEqual(['category-a']);
    expect(() =>
      AddTaskSitesToCategoriesRequestSchema.parse({
        sites: [{ id: 'site-a', name: 'Alpha', url: 'https://alpha.example' }],
        categoryIds: [],
        newCategory: null,
      }),
    ).toThrow(/Choose an existing category/);
  });

  it('validates auto check-in requests and accepts an optional per-site check-in config', () => {
    expect(CheckinStartRequestSchema.parse({ taskSiteId: null }).taskSiteId).toBeNull();
    expect(CheckinStartRequestSchema.parse({ taskSiteId: 'site-a' }).taskSiteId).toBe('site-a');
    expect(() => CheckinStartRequestSchema.parse({ taskSiteId: null, extra: 1 })).toThrow();

    expect(() =>
      CheckinSaveCredentialsRequestSchema.parse({ taskSiteId: 'site-a', username: 'a' }),
    ).toThrow();
    expect(
      CheckinSaveCredentialsRequestSchema.parse({
        taskSiteId: 'site-a',
        username: 'user',
        password: 'pass',
      }).password,
    ).toBe('pass');

    const category = TaskCategoryUpsertRequestSchema.parse({
      category: {
        id: 'cat',
        name: 'Category',
        colour: 'teal',
        sites: [
          {
            id: 'site-a',
            name: 'Alpha',
            url: 'https://alpha.example/ref',
            checkin: { enabled: true },
          },
        ],
      },
    });
    expect(category.category.sites[0]?.checkin?.enabled).toBe(true);
  });

  it('strictly rejects unknown or malformed command payloads', () => {
    expect(() =>
      CopyLinkRequestSchema.parse({
        siteId: 'u2win',
        text: 'link',
        occurredAt: 'not-a-date',
      }),
    ).toThrow();
    expect(() =>
      SiteUpsertRequestSchema.parse({
        id: null,
        name: 'SITE',
        url: '',
        prefix: '',
        suffix: '',
        dateFormat: '',
        bonusCents: 100,
        maxCopiesPerDay: 1,
        unexpected: true,
      }),
    ).toThrow();
    expect(() =>
      TaskCompletionRequestSchema.parse({
        date: '2026-99-99',
        categoryId: 'cat',
        siteId: 'site',
        done: true,
      }),
    ).toThrow();
  });

  it('accepts blank site URLs but rejects insecure or credentialed referral URLs', () => {
    const base = {
      id: null,
      name: 'SITE',
      prefix: '',
      suffix: '',
      dateFormat: '',
      bonusCents: 100,
      maxCopiesPerDay: 1,
    };

    expect(SiteUpsertRequestSchema.parse({ ...base, url: '' }).url).toBe('');
    expect(SiteUpsertRequestSchema.parse({ ...base, url: 'https://example.com/ref' }).url).toBe(
      'https://example.com/ref',
    );
    expect(() => SiteUpsertRequestSchema.parse({ ...base, url: 'http://example.com/ref' })).toThrow(
      /HTTPS/,
    );
    expect(() =>
      SiteUpsertRequestSchema.parse({ ...base, url: 'https://user:pass@example.com/ref' }),
    ).toThrow(/HTTPS/);
  });

  it('accepts only the application origin or the configured development origin', () => {
    expect(
      isTrustedRendererUrl('reftrack://app/index.html', {
        development: false,
      }),
    ).toBe(true);
    expect(
      isTrustedRendererUrl('https://example.com/', {
        development: false,
      }),
    ).toBe(false);
    expect(
      isTrustedRendererUrl('http://localhost:5173/dashboard', {
        development: true,
        developmentRendererUrl: 'http://localhost:5173/',
      }),
    ).toBe(true);
    expect(
      isTrustedRendererUrl('http://localhost:4173/', {
        development: true,
        developmentRendererUrl: 'http://localhost:5173/',
      }),
    ).toBe(false);
  });

  it('restricts external links to credential-free HTTPS URLs', () => {
    expect(validateExternalUrl('https://example.com/path').href).toBe('https://example.com/path');
    expect(() => validateExternalUrl('http://example.com')).toThrow(/HTTPS/);
    expect(() => validateExternalUrl('file:///C:/Windows/System32')).toThrow(/HTTPS/);
    expect(() => validateExternalUrl('https://user:pass@example.com')).toThrow(/HTTPS/);
  });

  it('restricts partner imports to credential-free public HTTPS URLs', () => {
    expect(validateImporterUrl('https://example.com/partners').href).toBe(
      'https://example.com/partners',
    );
    expect(() => validateImporterUrl('http://example.com')).toThrow(/HTTPS/);
    expect(() => validateImporterUrl('https://user:pass@example.com')).toThrow(/HTTPS/);
    expect(() => validateImporterUrl('https://localhost/partners')).toThrow(
      /Local|private|reserved/,
    );
    expect(() => validateImporterUrl('https://127.0.0.1/partners')).toThrow(
      /Local|private|reserved/,
    );
  });
});

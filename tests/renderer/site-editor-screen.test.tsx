// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RefTrackApi } from '../../src/shared/ipc/contract';
import type { RendererSnapshot } from '../../src/shared/view-model/renderer-snapshot';
import {
  activeScreen,
  navigateTo,
  publishSnapshot,
  resetRendererForRetry,
} from '../../src/renderer/app/store';
import { SiteEditorScreen } from '../../src/renderer/screens/site-editor/SiteEditorScreen';

function createSnapshot(overrides: Partial<RendererSnapshot> = {}): RendererSnapshot {
  return {
    revision: 1,
    sites: [
      {
        id: 'site-alpha',
        name: 'ALPHA',
        url: 'https://alpha.example/ref',
        prefix: 'Join',
        suffix: '',
        dateFormat: '',
        bonus: 30,
        maxCopiesPerDay: 1,
        copies: 5,
        successes: 1,
        earnings: 30,
      },
      {
        id: 'site-bravo',
        name: 'BRAVO',
        url: 'https://bravo.example/ref',
        prefix: '',
        suffix: '',
        dateFormat: '',
        bonus: 20,
        maxCopiesPerDay: 2,
        copies: 2,
        successes: 0,
        earnings: 0,
      },
    ],
    dailyState: {},
    activity: [],
    lifetimeEarnings: 30,
    lifetimeSuccesses: 1,
    settings: {
      darkMode: true,
      folderClearEnabled: false,
      folderClearPath: null,
    },
    tasks: { categories: [] },
    tasksDailyState: {},
    ...overrides,
  };
}

interface ApiMocks {
  upsert: ReturnType<typeof vi.fn>;
  deleteSite: ReturnType<typeof vi.fn>;
  openExternal: ReturnType<typeof vi.fn>;
}

function installApi(): ApiMocks {
  const upsert = vi.fn();
  const deleteSite = vi.fn();
  const openExternal = vi.fn().mockResolvedValue({ ok: true, data: { opened: true } });
  const api = {
    bootstrap: vi.fn(),
    sites: { upsert, delete: deleteSite },
    activity: { clear: vi.fn() },
    actions: { copyLink: vi.fn(), recordSuccess: vi.fn(), undoSuccess: vi.fn() },
    settings: { setImageCleanerEnabled: vi.fn(), selectImageCleanerFolder: vi.fn() },
    imageCleaner: { onCompleted: vi.fn(() => () => undefined) },
    tasks: {
      upsertCategory: vi.fn(),
      deleteCategory: vi.fn(),
      setCompletion: vi.fn(),
      setCompletions: vi.fn(),
    },
    external: { open: openExternal },
    notifications: { showAction: vi.fn() },
    importer: {
      start: vi.fn(),
      cancel: vi.fn(),
      onProgress: vi.fn(() => () => undefined),
      onCompleted: vi.fn(() => () => undefined),
    },
  } as unknown as RefTrackApi;

  Object.defineProperty(window, 'reftrack', { configurable: true, value: api });
  return { upsert, deleteSite, openExternal };
}

beforeEach(() => {
  resetRendererForRetry();
  activeScreen.value = 'editor';
  installApi();
});

afterEach(() => {
  cleanup();
  resetRendererForRetry();
});

describe('SiteEditorScreen', () => {
  it('selects the first site and exposes an accessible master-detail editor', async () => {
    publishSnapshot(createSnapshot());
    render(<SiteEditorScreen active />);

    expect(screen.getByRole('tabpanel', { name: 'Site Editor' })).toBeTruthy();
    const alpha = await screen.findByRole('option', { name: /ALPHA/ });
    expect(alpha.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('form', { name: 'Edit site form' })).toBeTruthy();
    expect((screen.getByLabelText(/Site name/) as HTMLInputElement).value).toBe('ALPHA');
    expect(screen.getByText('All changes saved')).toBeTruthy();
  });

  it('shows inline validation and does not invoke IPC for an invalid new site', async () => {
    const mocks = installApi();
    publishSnapshot(createSnapshot());
    render(<SiteEditorScreen active />);

    fireEvent.click(screen.getByRole('button', { name: 'Add site' }));
    const form = screen.getByRole('form', { name: 'New site form' });
    fireEvent.submit(form);

    expect(await screen.findByText('Enter a site name.')).toBeTruthy();
    expect(screen.getByText('Enter a bonus amount. Zero is allowed.')).toBeTruthy();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText(/Site name/));
  });

  it('saves through the typed site command and refreshes from the committed snapshot', async () => {
    const mocks = installApi();
    const initial = createSnapshot();
    const saved = createSnapshot({
      revision: 2,
      sites: initial.sites.map((site) =>
        site.id === 'site-alpha' ? { ...site, name: 'ALPHA UPDATED' } : site,
      ),
    });
    mocks.upsert.mockResolvedValue({
      ok: true,
      data: { siteId: 'site-alpha', snapshot: saved },
    });

    publishSnapshot(initial);
    render(<SiteEditorScreen active />);
    const name = await screen.findByLabelText(/Site name/);
    fireEvent.input(name, { target: { value: 'Alpha Updated' } });
    expect(screen.getByText('Changes not saved')).toBeTruthy();

    fireEvent.submit(screen.getByRole('form', { name: 'Edit site form' }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    expect(mocks.upsert.mock.calls[0]?.[0]).toMatchObject({
      id: 'site-alpha',
      name: 'ALPHA UPDATED',
      bonusCents: 3000,
      maxCopiesPerDay: 1,
    });
    await waitFor(() => expect(screen.getByDisplayValue('ALPHA UPDATED')).toBeTruthy());
    expect(screen.getByText('ALPHA UPDATED saved.')).toBeTruthy();
  });

  it('protects unsaved changes when selecting another site', async () => {
    publishSnapshot(createSnapshot());
    render(<SiteEditorScreen active />);

    const name = await screen.findByLabelText(/Site name/);
    fireEvent.input(name, { target: { value: 'Changed locally' } });
    fireEvent.click(screen.getByRole('option', { name: /BRAVO/ }));

    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeTruthy();
    expect(screen.getByDisplayValue('Changed locally')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.getByDisplayValue('BRAVO')).toBeTruthy());
    expect(screen.getByRole('option', { name: /BRAVO/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('guards primary navigation until the user confirms discarding edits', async () => {
    publishSnapshot(createSnapshot());
    render(<SiteEditorScreen active />);

    fireEvent.input(await screen.findByLabelText(/Site name/), {
      target: { value: 'Unsaved name' },
    });

    act(() => {
      expect(navigateTo('settings')).toBe(false);
    });
    expect(activeScreen.value).toBe('editor');
    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(activeScreen.value).toBe('settings'));
  });

  it('deletes through an accessible confirmation and selects the next site', async () => {
    const mocks = installApi();
    const initial = createSnapshot();
    const afterDelete = createSnapshot({
      revision: 2,
      sites: [initial.sites[1]!],
      lifetimeEarnings: 0,
      lifetimeSuccesses: 0,
    });
    mocks.deleteSite.mockResolvedValue({ ok: true, data: { snapshot: afterDelete } });

    publishSnapshot(initial);
    render(<SiteEditorScreen active />);
    await screen.findByDisplayValue('ALPHA');
    fireEvent.click(screen.getByRole('button', { name: 'Delete site' }));

    const dialog = screen.getByRole('dialog', { name: 'Delete ALPHA?' });
    expect(within(dialog).getByText(/copy history, successes, earnings/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete site' }));

    await waitFor(() =>
      expect(mocks.deleteSite).toHaveBeenCalledWith({
        siteId: 'site-alpha',
        occurredAt: expect.any(String),
      }),
    );
    await waitFor(() => expect(screen.getByDisplayValue('BRAVO')).toBeTruthy());
    expect(screen.getByText('ALPHA deleted with its statistics.')).toBeTruthy();
  });
});

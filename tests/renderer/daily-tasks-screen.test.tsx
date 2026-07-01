// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ImporterCompletedEvent,
  ImporterProgressEvent,
  RefTrackApi,
} from '../../src/shared/ipc/contract';
import type { RendererSnapshot } from '../../src/shared/view-model/renderer-snapshot';
import { publishSnapshot, resetRendererForRetry } from '../../src/renderer/app/store';
import { DailyTasksScreen } from '../../src/renderer/screens/daily-tasks/DailyTasksScreen';
import { localTaskDateKey } from '../../src/renderer/screens/daily-tasks/daily-tasks-model';

function createSnapshot(overrides: Partial<RendererSnapshot> = {}): RendererSnapshot {
  return {
    revision: 20,
    sites: [],
    dailyState: {},
    activity: [],
    lifetimeEarnings: 0,
    lifetimeSuccesses: 0,
    settings: { darkMode: true, folderClearEnabled: false, folderClearPath: null },
    tasks: {
      categories: [
        {
          id: 'cat-a',
          name: 'Morning Partners',
          colour: 'teal',
          sites: [
            { id: 'site-a', name: 'Alpha', url: 'https://alpha.example/' },
            { id: 'site-b', name: 'Beta', url: 'https://beta.example/' },
          ],
        },
      ],
    },
    tasksDailyState: {},
    ...overrides,
  };
}

interface ApiMocks {
  setCompletion: ReturnType<typeof vi.fn>;
  setCompletions: ReturnType<typeof vi.fn>;
  upsertCategory: ReturnType<typeof vi.fn>;
  deleteCategory: ReturnType<typeof vi.fn>;
  openExternal: ReturnType<typeof vi.fn>;
  startImport: ReturnType<typeof vi.fn>;
  cancelImport: ReturnType<typeof vi.fn>;
  emitProgress(event: ImporterProgressEvent): void;
  emitCompleted(event: ImporterCompletedEvent): void;
}

function installApi(): ApiMocks {
  let progressListener: ((event: ImporterProgressEvent) => void) | null = null;
  let completedListener: ((event: ImporterCompletedEvent) => void) | null = null;
  const setCompletion = vi.fn();
  const setCompletions = vi.fn();
  const upsertCategory = vi.fn();
  const deleteCategory = vi.fn();
  const openExternal = vi.fn().mockResolvedValue({ ok: true, data: { opened: true } });
  const startImport = vi.fn().mockResolvedValue({ ok: true, data: { jobId: 'job-1' } });
  const cancelImport = vi.fn().mockResolvedValue({ ok: true, data: { cancelled: true } });

  const api = {
    bootstrap: vi.fn(),
    app: { getInfo: vi.fn() },
    sites: { upsert: vi.fn(), delete: vi.fn() },
    activity: { clear: vi.fn() },
    actions: { copyLink: vi.fn(), recordSuccess: vi.fn(), undoSuccess: vi.fn() },
    settings: { setImageCleanerEnabled: vi.fn(), selectImageCleanerFolder: vi.fn() },
    imageCleaner: { onCompleted: vi.fn(() => () => undefined) },
    tasks: { upsertCategory, deleteCategory, setCompletion, setCompletions },
    external: { open: openExternal },
    notifications: { showAction: vi.fn() },
    importer: {
      start: startImport,
      cancel: cancelImport,
      onProgress: vi.fn((listener: (event: ImporterProgressEvent) => void) => {
        progressListener = listener;
        return () => {
          progressListener = null;
        };
      }),
      onCompleted: vi.fn((listener: (event: ImporterCompletedEvent) => void) => {
        completedListener = listener;
        return () => {
          completedListener = null;
        };
      }),
    },
  } as unknown as RefTrackApi;

  Object.defineProperty(window, 'reftrack', { configurable: true, value: api });
  return {
    setCompletion,
    setCompletions,
    upsertCategory,
    deleteCategory,
    openExternal,
    startImport,
    cancelImport,
    emitProgress: (event) => progressListener?.(event),
    emitCompleted: (event) => completedListener?.(event),
  };
}

beforeEach(() => {
  resetRendererForRetry();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  resetRendererForRetry();
});

describe('DailyTasksScreen', () => {
  it('renders semantic progress, category management and accessible site controls', async () => {
    installApi();
    publishSnapshot(createSnapshot());
    render(<DailyTasksScreen active />);

    expect(screen.getByRole('tabpanel', { name: 'Daily Tasks' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: /0 of 2 Daily Tasks complete/i })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Auto-sort categories' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Morning Partners' })).toBeTruthy();

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Mark Alpha complete' })).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Visit Alpha' })).toBeTruthy();
  });

  it('saves a manual completion through typed IPC and publishes the committed snapshot', async () => {
    const mocks = installApi();
    const next = createSnapshot({
      revision: 21,
      tasksDailyState: {
        [localTaskDateKey()]: { 'cat-a': { 'site-a': true } },
      },
    });
    mocks.setCompletion.mockResolvedValue({ ok: true, data: { snapshot: next } });

    publishSnapshot(createSnapshot());
    render(<DailyTasksScreen active />);
    await waitFor(() => screen.getByRole('checkbox', { name: 'Mark Alpha complete' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Alpha complete' }));

    await waitFor(() =>
      expect(mocks.setCompletion).toHaveBeenCalledWith({
        date: localTaskDateKey(),
        categoryId: 'cat-a',
        siteId: 'site-a',
        done: true,
      }),
    );
    expect(screen.getByRole('checkbox', { name: 'Mark Alpha not complete' })).toBeTruthy();
  });

  it('opens a site before marking it complete', async () => {
    const mocks = installApi();
    const next = createSnapshot({
      revision: 22,
      tasksDailyState: {
        [localTaskDateKey()]: { 'cat-a': { 'site-a': true } },
      },
    });
    mocks.setCompletion.mockResolvedValue({ ok: true, data: { snapshot: next } });

    publishSnapshot(createSnapshot());
    render(<DailyTasksScreen active />);
    await waitFor(() => screen.getByRole('button', { name: 'Visit Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Visit Alpha' }));

    await waitFor(() =>
      expect(mocks.openExternal).toHaveBeenCalledWith({ url: 'https://alpha.example/' }),
    );
    await waitFor(() => expect(mocks.setCompletion).toHaveBeenCalledTimes(1));
    expect(mocks.openExternal.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setCompletion.mock.invocationCallOrder[0]!,
    );
  });

  it('opens remaining links sequentially and commits only accepted opens in one batch', async () => {
    const mocks = installApi();
    const next = createSnapshot({
      revision: 23,
      tasksDailyState: {
        [localTaskDateKey()]: { 'cat-a': { 'site-a': true, 'site-b': true } },
      },
    });
    mocks.setCompletions.mockResolvedValue({ ok: true, data: { snapshot: next } });

    publishSnapshot(createSnapshot());
    render(<DailyTasksScreen active />);
    await waitFor(() => screen.getByRole('button', { name: 'Open remaining' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open remaining' }));
    await waitFor(() => expect(mocks.setCompletions).toHaveBeenCalledTimes(1));

    expect(mocks.openExternal).toHaveBeenNthCalledWith(1, { url: 'https://alpha.example/' });
    expect(mocks.openExternal).toHaveBeenNthCalledWith(2, { url: 'https://beta.example/' });
    expect(mocks.setCompletions).toHaveBeenCalledWith({
      date: localTaskDateKey(),
      items: [
        { categoryId: 'cat-a', siteId: 'site-a', done: true },
        { categoryId: 'cat-a', siteId: 'site-b', done: true },
      ],
    });
  });

  it('edits a category without replacing stable task-site IDs', async () => {
    const mocks = installApi();
    mocks.upsertCategory.mockImplementation(async ({ category }) => ({
      ok: true,
      data: {
        categoryId: category.id,
        snapshot: createSnapshot({ revision: 24, tasks: { categories: [category] } }),
      },
    }));

    publishSnapshot(createSnapshot());
    render(<DailyTasksScreen active />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Morning Partners' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit Morning Partners' });
    fireEvent.input(within(dialog).getByLabelText('Category name'), {
      target: { value: 'Updated Partners' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mocks.upsertCategory).toHaveBeenCalledTimes(1));
    const request = mocks.upsertCategory.mock.calls[0]![0];
    expect(request.category.id).toBe('cat-a');
    expect(request.category.sites.map((site: { id: string }) => site.id)).toEqual([
      'site-a',
      'site-b',
    ]);
  });

  it('reviews importer results and saves only selected edited sites', async () => {
    const mocks = installApi();
    mocks.upsertCategory.mockImplementation(async ({ category }) => ({
      ok: true,
      data: {
        categoryId: category.id,
        snapshot: createSnapshot({ revision: 25, tasks: { categories: [category] } }),
      },
    }));

    publishSnapshot(createSnapshot({ tasks: { categories: [] } }));
    render(<DailyTasksScreen active />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Import partner page' })[0]!);

    const input = screen.getByLabelText('Partner-page URL');
    fireEvent.input(input, { target: { value: 'https://partners.example/brands' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract partners' }));
    await waitFor(() => expect(mocks.startImport).toHaveBeenCalledTimes(1));

    mocks.emitProgress({
      jobId: 'job-1',
      stage: 'analysing',
      message: 'Analysing links…',
      percent: 60,
    });
    mocks.emitCompleted({
      jobId: 'job-1',
      ok: true,
      result: {
        brandName: 'Imported Group',
        sites: [
          { name: 'One', url: 'https://one.example/' },
          { name: 'Two', url: 'https://two.example/' },
        ],
        method: 'static',
        confidence: 0.9,
        warnings: [],
        sourceUrl: 'https://partners.example/brands',
        finalUrl: 'https://partners.example/brands',
      },
    });

    await waitFor(() => screen.getByLabelText('Category name'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Two' }));
    fireEvent.input(screen.getByLabelText('Category name'), {
      target: { value: 'Reviewed Group' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 site' }));

    await waitFor(() => expect(mocks.upsertCategory).toHaveBeenCalledTimes(1));
    const request = mocks.upsertCategory.mock.calls[0]![0];
    expect(request.category.name).toBe('Reviewed Group');
    expect(request.category.sites).toHaveLength(1);
    expect(request.category.sites[0]).toMatchObject({ name: 'One', url: 'https://one.example/' });
  });
});

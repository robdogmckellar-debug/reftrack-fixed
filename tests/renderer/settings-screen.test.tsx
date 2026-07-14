// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ApplicationInfo,
  ImageCleanupCompletedEvent,
  RefTrackApi,
} from '../../src/shared/ipc/contract';
import type { RendererSnapshot } from '../../src/shared/view-model/renderer-snapshot';
import { publishSnapshot, resetRendererForRetry } from '../../src/renderer/app/store';
import { SettingsScreen } from '../../src/renderer/screens/settings/SettingsScreen';

function createSnapshot(overrides: Partial<RendererSnapshot> = {}): RendererSnapshot {
  return {
    revision: 10,
    sites: [],
    dailyState: {},
    activity: [],
    lifetimeEarnings: 0,
    lifetimeSuccesses: 0,
    settings: {
      darkMode: true,
      folderClearEnabled: false,
      folderClearPath: null,
      checkinSchedule: { enabled: false, time: '09:00', lastRunDate: null },
    },
    tasks: { categories: [] },
    tasksDailyState: {},
    ...overrides,
  };
}

const APPLICATION_INFO: ApplicationInfo = {
  name: 'RefTrack',
  version: '1.0.0',
  electronVersion: '42.5.1',
  chromiumVersion: '148.0.7778.271',
  nodeVersion: '24.17.0',
  v8Version: '14.8.178.33',
  architecture: 'x64',
  userDataPath: 'C:\\Users\\Test\\AppData\\Roaming\\reftrack',
};

interface ApiMocks {
  getInfo: ReturnType<typeof vi.fn>;
  setEnabled: ReturnType<typeof vi.fn>;
  selectFolder: ReturnType<typeof vi.fn>;
  setHotkey: ReturnType<typeof vi.fn>;
  setCheckinSchedule: ReturnType<typeof vi.fn>;
  runCleanup: ReturnType<typeof vi.fn>;
  emitCleanup(event: ImageCleanupCompletedEvent): void;
}

function installApi(): ApiMocks {
  let cleanupListener: ((event: ImageCleanupCompletedEvent) => void) | null = null;
  const getInfo = vi.fn().mockResolvedValue({ ok: true, data: APPLICATION_INFO });
  const setEnabled = vi.fn();
  const selectFolder = vi.fn();
  const setHotkey = vi.fn();
  const setCheckinSchedule = vi.fn();
  const runCleanup = vi.fn();

  const api = {
    bootstrap: vi.fn(),
    app: { getInfo },
    sites: { upsert: vi.fn(), delete: vi.fn() },
    activity: { clear: vi.fn() },
    actions: { copyLink: vi.fn(), recordSuccess: vi.fn(), undoSuccess: vi.fn() },
    settings: {
      setImageCleanerEnabled: setEnabled,
      selectImageCleanerFolder: selectFolder,
      setImageCleanerHotkey: setHotkey,
      setCheckinSchedule,
    },
    imageCleaner: {
      run: runCleanup,
      onCompleted: vi.fn((listener: (event: ImageCleanupCompletedEvent) => void) => {
        cleanupListener = listener;
        return () => {
          cleanupListener = null;
        };
      }),
    },
    tasks: {
      upsertCategory: vi.fn(),
      deleteCategory: vi.fn(),
      setCompletion: vi.fn(),
      setCompletions: vi.fn(),
    },
    external: { open: vi.fn() },
    notifications: { showAction: vi.fn() },
    importer: {
      start: vi.fn(),
      cancel: vi.fn(),
      onProgress: vi.fn(() => () => undefined),
      onCompleted: vi.fn(() => () => undefined),
    },
  } as unknown as RefTrackApi;

  Object.defineProperty(window, 'reftrack', { configurable: true, value: api });
  return {
    getInfo,
    setEnabled,
    selectFolder,
    setHotkey,
    setCheckinSchedule,
    runCleanup,
    emitCleanup: (event) => cleanupListener?.(event),
  };
}

beforeEach(() => {
  resetRendererForRetry();
});

afterEach(() => {
  cleanup();
  resetRendererForRetry();
});

describe('SettingsScreen', () => {
  it('renders the accessible cleaner configuration, safety boundaries and runtime information', async () => {
    installApi();
    publishSnapshot(createSnapshot());
    render(<SettingsScreen active />);

    expect(screen.getByRole('tabpanel', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Enable cleanup after Copy Link' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Safety boundaries' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Supported image formats' })).toBeTruthy();
    expect(
      screen.getByText(
        'Subfolders, links, hidden files, system files and mismatched signatures are skipped.',
      ),
    ).toBeTruthy();

    await waitFor(() => expect(screen.getByText('42.5.1')).toBeTruthy());
    expect(screen.getByText('148.0.7778.271')).toBeTruthy();
    expect(screen.getByText(APPLICATION_INFO.userDataPath)).toBeTruthy();
  });

  it('commits the cleaner toggle through typed IPC and updates the readiness state', async () => {
    const mocks = installApi();
    const enabledSnapshot = createSnapshot({
      revision: 11,
      settings: {
        darkMode: true,
        folderClearEnabled: true,
        folderClearPath: 'C:\\Users\\Test\\Pictures\\RefTrack',
      },
    });
    mocks.setEnabled.mockResolvedValue({ ok: true, data: { snapshot: enabledSnapshot } });

    publishSnapshot(createSnapshot());
    render(<SettingsScreen active />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable cleanup after Copy Link' }));

    await waitFor(() => expect(mocks.setEnabled).toHaveBeenCalledWith({ enabled: true }));
    expect(await screen.findByText('Image Cleaner enabled')).toBeTruthy();
    expect(screen.getByText('Image Cleaner: Ready')).toBeTruthy();
    expect(
      (screen.getByRole('checkbox', { name: 'Enable cleanup after Copy Link' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it('saves and presents the daily auto check-in schedule', async () => {
    const mocks = installApi();
    const scheduledSnapshot = createSnapshot({
      revision: 11,
      settings: {
        darkMode: true,
        folderClearEnabled: false,
        folderClearPath: null,
        checkinSchedule: { enabled: true, time: '09:00', lastRunDate: null },
      },
    });
    mocks.setCheckinSchedule.mockResolvedValue({
      ok: true,
      data: { snapshot: scheduledSnapshot },
    });

    publishSnapshot(createSnapshot());
    render(<SettingsScreen active />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable daily auto check-in' }));

    await waitFor(() =>
      expect(mocks.setCheckinSchedule).toHaveBeenCalledWith({ enabled: true, time: '09:00' }),
    );
    expect(await screen.findByText('Daily check-in scheduled')).toBeTruthy();
    expect(screen.getByText('Daily at 09:00')).toBeTruthy();
  });

  it('saves a changed local check-in time', async () => {
    const mocks = installApi();
    const initial = createSnapshot({
      settings: {
        darkMode: true,
        folderClearEnabled: false,
        folderClearPath: null,
        checkinSchedule: { enabled: true, time: '09:00', lastRunDate: null },
      },
    });
    const updated = createSnapshot({
      revision: 11,
      settings: {
        ...initial.settings,
        checkinSchedule: { enabled: true, time: '07:30', lastRunDate: null },
      },
    });
    mocks.setCheckinSchedule.mockResolvedValue({ ok: true, data: { snapshot: updated } });

    publishSnapshot(initial);
    render(<SettingsScreen active />);
    fireEvent.change(screen.getByLabelText(/Run time/), { target: { value: '07:30' } });

    await waitFor(() =>
      expect(mocks.setCheckinSchedule).toHaveBeenCalledWith({ enabled: true, time: '07:30' }),
    );
    expect(await screen.findByText('Daily at 07:30')).toBeTruthy();
  });

  it('selects a dedicated folder and presents the committed path', async () => {
    const mocks = installApi();
    const folderPath = 'C:\\Users\\Test\\Pictures\\RefTrack Cleaner';
    const selectedSnapshot = createSnapshot({
      revision: 12,
      settings: { darkMode: true, folderClearEnabled: false, folderClearPath: folderPath },
    });
    mocks.selectFolder.mockResolvedValue({
      ok: true,
      data: { selected: true, folderPath, snapshot: selectedSnapshot },
    });

    publishSnapshot(createSnapshot());
    render(<SettingsScreen active />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));

    await waitFor(() => expect(mocks.selectFolder).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Cleaner folder selected')).toBeTruthy();
    expect(screen.getAllByText(folderPath).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Change folder' })).toBeTruthy();
  });

  it('disables manual cleanup until a folder is configured', () => {
    installApi();
    publishSnapshot(createSnapshot());
    render(<SettingsScreen active />);

    expect(
      (screen.getByRole('button', { name: 'Run cleanup now' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('triggers a manual cleanup on demand and clears the running state on completion', async () => {
    const mocks = installApi();
    const folderPath = 'C:\\Users\\Test\\Pictures\\RefTrack';
    mocks.runCleanup.mockResolvedValue({
      ok: true,
      data: { status: 'started', jobId: 'cleanup_manual_1' },
    });
    publishSnapshot(
      createSnapshot({
        settings: { darkMode: true, folderClearEnabled: true, folderClearPath: folderPath },
      }),
    );
    render(<SettingsScreen active />);

    fireEvent.click(screen.getByRole('button', { name: 'Run cleanup now' }));

    await waitFor(() => expect(mocks.runCleanup).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Cleanup started')).toBeTruthy();

    mocks.emitCleanup({
      jobId: 'cleanup_manual_1',
      folderPath,
      startedAt: '2026-07-02T01:00:00.000Z',
      completedAt: '2026-07-02T01:00:01.000Z',
      ok: true,
      scanned: 4,
      eligible: 2,
      movedToRecycleBin: 2,
      skipped: 2,
      failed: 0,
      failures: [],
      errorCode: null,
      errorMessage: null,
    });

    expect(await screen.findByText('Cleanup completed')).toBeTruthy();
  });

  it('records a global shortcut and saves it through typed IPC', async () => {
    const mocks = installApi();
    mocks.setHotkey.mockResolvedValue({
      ok: true,
      data: {
        snapshot: createSnapshot({
          settings: {
            darkMode: true,
            folderClearEnabled: false,
            folderClearPath: null,
            folderClearHotkey: 'CommandOrControl+Shift+K',
          },
        }),
      },
    });

    publishSnapshot(createSnapshot());
    render(<SettingsScreen active />);

    fireEvent.click(screen.getByRole('button', { name: 'Set shortcut' }));
    const recorder = screen.getByRole('button', { name: 'Press a shortcut… (Esc)' });
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, shiftKey: true });

    await waitFor(() =>
      expect(mocks.setHotkey).toHaveBeenCalledWith({ hotkey: 'CommandOrControl+Shift+K' }),
    );
    expect(await screen.findByText('Shortcut set')).toBeTruthy();
  });

  it('keeps and renders the most recent cleanup result while the screen is mounted', async () => {
    const mocks = installApi();
    publishSnapshot(createSnapshot());
    const view = render(<SettingsScreen active={false} />);

    mocks.emitCleanup({
      jobId: 'job-1',
      folderPath: 'C:\\Users\\Test\\Pictures\\RefTrack',
      startedAt: '2026-07-02T01:00:00.000Z',
      completedAt: '2026-07-02T01:00:01.000Z',
      ok: true,
      scanned: 8,
      eligible: 3,
      movedToRecycleBin: 3,
      skipped: 5,
      failed: 0,
      failures: [],
      errorCode: null,
      errorMessage: null,
    });

    view.rerender(<SettingsScreen active />);
    const result = screen.getByRole('article');
    expect(within(result).getByText('Cleanup completed')).toBeTruthy();
    expect(within(result).getAllByText('3')).toHaveLength(2);
    expect(within(result).getByText('5')).toBeTruthy();
  });
});

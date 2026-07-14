import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import type { ApplicationInfo, ImageCleanupCompletedEvent } from '../../../shared/ipc/contract';
import type { RendererHotkeySettings } from '../../../shared/view-model/renderer-snapshot';
import { resolveHotkeyBindings } from '../../../shared/hotkeys/bindings';
import { publishSnapshot, rendererSnapshot } from '../../app/store';
import {
  ActivityIcon,
  DatabaseIcon,
  FolderIcon,
  InfoIcon,
  KeyboardIcon,
  LinkIcon,
  SettingsIcon,
  ShieldIcon,
  TrashIcon,
} from '../../components/icons';
import { Button } from '../../design-system/Button';
import { ToggleSwitch } from '../../design-system/ToggleSwitch';
import { errorMessage, unwrapIpcResult } from '../../lib/ipc-result';

type PendingAction = 'toggle-cleaner' | 'select-folder' | 'set-hotkey' | null;
type FeedbackTone = 'success' | 'info' | 'danger';

interface Feedback {
  tone: FeedbackTone;
  title: string;
  message: string;
}

const SUPPORTED_FORMATS = ['PNG', 'JPG', 'JPEG', 'JFIF', 'WebP', 'GIF', 'BMP', 'TIFF'] as const;

function normalizeHotkeyKey(key: string): string | null {
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  return null;
}

function acceleratorFromKeyboardEvent(event: KeyboardEvent): string | null {
  const modifiers: string[] = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('CommandOrControl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  const key = normalizeHotkeyKey(event.key);
  if (!key || modifiers.length === 0) return null;
  return [...modifiers, key].join('+');
}

function formatAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => (part === 'CommandOrControl' ? 'Ctrl' : part))
    .join(' + ');
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function cleanerStatus(
  enabled: boolean,
  folderPath: string | null,
): {
  label: string;
  tone: 'neutral' | 'warning' | 'success';
  description: string;
} {
  if (!enabled) {
    return {
      label: 'Off',
      tone: 'neutral',
      description: 'Copy Link will not scan or move any files.',
    };
  }

  if (!folderPath) {
    return {
      label: 'Needs folder',
      tone: 'warning',
      description: 'Choose a dedicated screenshots or exports subfolder before cleanup can run.',
    };
  }

  return {
    label: 'Ready',
    tone: 'success',
    description: 'Verified top-level images will move to the Windows Recycle Bin after Copy Link.',
  };
}

function CleanupResult({ result }: { result: ImageCleanupCompletedEvent | null }): JSX.Element {
  if (!result) {
    return (
      <div class="settings-empty-result">
        <span class="settings-empty-result__icon" aria-hidden="true">
          —
        </span>
        <div>
          <strong>No cleanup has run this session</strong>
          <p>
            The most recent result will appear here after a Copy Link action starts the cleaner.
          </p>
        </div>
      </div>
    );
  }

  const failed = Boolean(result.errorMessage) || result.failed > 0;
  const title = result.errorMessage
    ? 'Cleanup failed'
    : result.failed > 0
      ? 'Cleanup partly completed'
      : result.movedToRecycleBin > 0
        ? 'Cleanup completed'
        : 'No eligible images found';

  return (
    <article
      class={`settings-cleanup-result settings-cleanup-result--${failed ? 'danger' : 'success'}`}
    >
      <header class="settings-cleanup-result__header">
        <div>
          <strong>{title}</strong>
          <span>{formatDateTime(result.completedAt)}</span>
        </div>
        <span class="settings-cleanup-result__state">{result.ok ? 'Finished' : 'Failed'}</span>
      </header>

      {result.errorMessage ? (
        <p class="settings-cleanup-result__error">{result.errorMessage}</p>
      ) : null}

      <dl class="settings-cleanup-metrics" aria-label="Most recent cleanup counts">
        <div>
          <dt>Scanned</dt>
          <dd>{result.scanned}</dd>
        </div>
        <div>
          <dt>Eligible</dt>
          <dd>{result.eligible}</dd>
        </div>
        <div>
          <dt>Recycled</dt>
          <dd>{result.movedToRecycleBin}</dd>
        </div>
        <div>
          <dt>Skipped</dt>
          <dd>{result.skipped}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{result.failed}</dd>
        </div>
      </dl>

      <div class="settings-cleanup-result__folder">
        <span>Folder</span>
        <code title={result.folderPath}>{result.folderPath}</code>
      </div>

      {result.failures.length > 0 ? (
        <details class="settings-cleanup-failures">
          <summary>
            Review {result.failures.length} failed file{result.failures.length === 1 ? '' : 's'}
          </summary>
          <ul>
            {result.failures.slice(0, 10).map((failure) => (
              <li key={`${failure.fileName}-${failure.reason}`}>
                <strong>{failure.fileName}</strong>
                <span>{failure.reason}</span>
              </li>
            ))}
          </ul>
          {result.failures.length > 10 ? (
            <p>{result.failures.length - 10} additional failures are not shown.</p>
          ) : null}
        </details>
      ) : null}
    </article>
  );
}

function ApplicationInformation({
  info,
  loading,
  failure,
  onRetry,
}: {
  info: ApplicationInfo | null;
  loading: boolean;
  failure: string | null;
  onRetry(): void;
}): JSX.Element {
  if (loading && !info) {
    return (
      <p class="settings-app-info-loading" role="status">
        Loading application information…
      </p>
    );
  }

  if (failure && !info) {
    return (
      <div class="settings-app-info-error" role="alert">
        <p>{failure}</p>
        <Button size="small" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (!info)
    return <p class="settings-app-info-loading">Application information is unavailable.</p>;

  const rows = [
    ['Version', info.version],
    ['Electron', info.electronVersion],
    ['Chromium', info.chromiumVersion],
    ['Node.js', info.nodeVersion],
    ['V8', info.v8Version],
    ['Architecture', info.architecture],
  ] as const;

  return (
    <div class="settings-app-information">
      <div class="settings-about-brand">
        <span class="settings-about-brand__mark" aria-hidden="true">
          <LinkIcon size={24} />
        </span>
        <div>
          <strong>{info.name}</strong>
          <span>Local referral workflow and earnings tracker</span>
        </div>
      </div>

      <dl class="settings-runtime-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div class="settings-data-location">
        <span class="settings-data-location__icon" aria-hidden="true">
          <DatabaseIcon size={18} />
        </span>
        <div>
          <strong>Local data folder</strong>
          <code title={info.userDataPath}>{info.userDataPath}</code>
        </div>
      </div>

      <p class="settings-network-note">
        RefTrack stores its application data on this computer. Internet access is used only when you
        open a configured link or explicitly import a partner page.
      </p>
    </div>
  );
}

function normaliseCapturedKey(event: JSX.TargetedKeyboardEvent<HTMLButtonElement>): string | null {
  if (/^F([1-9]|1[0-2])$/.test(event.key)) return event.key;
  if (/^[0-9]$/.test(event.key)) return event.key;
  if (/^Numpad[0-9]$/.test(event.code)) return event.code.slice(-1);
  return null;
}

function HotkeysPanel(): JSX.Element {
  const snapshot = rendererSnapshot.value;
  const sites = useMemo(() => snapshot?.sites ?? [], [snapshot]);
  const hotkeys = useMemo<RendererHotkeySettings>(
    () => snapshot?.settings.hotkeys ?? { enabled: true, bindings: [] },
    [snapshot],
  );
  const [pending, setPending] = useState(false);
  const [capturingSiteId, setCapturingSiteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effective = useMemo(
    () =>
      resolveHotkeyBindings(
        sites.map((site) => site.id),
        hotkeys,
      ),
    [sites, hotkeys],
  );

  const save = async (next: RendererHotkeySettings): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const response = unwrapIpcResult(await window.reftrack.settings.setHotkeys(next));
      publishSnapshot(response.snapshot);
    } catch (saveError) {
      setError(errorMessage(saveError, 'The hotkey settings could not be saved.'));
    } finally {
      setPending(false);
    }
  };

  const assignKey = (siteId: string, key: string): void => {
    const bindings = hotkeys.bindings.filter(
      (binding) => binding.siteId !== siteId && !(key !== '' && binding.key === key),
    );
    bindings.push({ siteId, key });
    void save({ enabled: hotkeys.enabled, bindings });
  };

  const resetSite = (siteId: string): void => {
    void save({
      enabled: hotkeys.enabled,
      bindings: hotkeys.bindings.filter((binding) => binding.siteId !== siteId),
    });
  };

  const handleCaptureKeyDown = (
    siteId: string,
    event: JSX.TargetedKeyboardEvent<HTMLButtonElement>,
  ): void => {
    event.preventDefault();
    if (event.key === 'Escape' || event.key === 'Tab') {
      setCapturingSiteId(null);
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      setCapturingSiteId(null);
      assignKey(siteId, '');
      return;
    }
    const key = normaliseCapturedKey(event);
    if (!key) return;
    setCapturingSiteId(null);
    assignKey(siteId, key);
  };

  return (
    <section class="settings-panel settings-panel--hotkeys" aria-labelledby="hotkeys-title">
      <header class="settings-panel__header">
        <span class="settings-panel__icon settings-panel__icon--blue" aria-hidden="true">
          <KeyboardIcon size={20} />
        </span>
        <div>
          <span class="settings-eyebrow">Keyboard</span>
          <h2 id="hotkeys-title">Copy hotkeys</h2>
          <p>
            Assign a key to each site to copy its referral link. Hotkeys work system-wide, even when
            RefTrack is minimised.
          </p>
        </div>
      </header>

      {error ? (
        <div class="settings-feedback settings-feedback--danger" role="alert">
          <strong>Hotkeys were not updated</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <div class="settings-control-card">
        <ToggleSwitch
          id="settings-hotkeys-enabled"
          label="Enable copy hotkeys"
          description="While enabled, the assigned keys are reserved for RefTrack across your whole computer."
          checked={hotkeys.enabled}
          pending={pending}
          onChange={(checked) => void save({ enabled: checked, bindings: hotkeys.bindings })}
        />
      </div>

      {sites.length === 0 ? (
        <p class="settings-hotkeys-empty">Add a site in Site Editor to assign a copy hotkey.</p>
      ) : (
        <ul class="settings-hotkeys-list" aria-label="Site copy hotkeys">
          {sites.map((site) => {
            const key = effective.get(site.id) ?? '';
            const capturing = capturingSiteId === site.id;
            const hasOverride = hotkeys.bindings.some((binding) => binding.siteId === site.id);
            return (
              <li key={site.id} class="settings-hotkeys-row">
                <div class="settings-hotkeys-row__site">
                  <strong>{site.name}</strong>
                  {!site.url ? (
                    <span class="settings-hotkeys-row__note">Needs a referral URL to copy</span>
                  ) : null}
                </div>
                <span
                  class={`settings-hotkeys-key${key ? '' : ' settings-hotkeys-key--off'}`}
                  aria-label={key ? `Assigned key ${key}` : 'No key assigned'}
                >
                  {key || 'Off'}
                </span>
                <div class="settings-hotkeys-row__actions">
                  <button
                    type="button"
                    class={`settings-hotkeys-rebind${capturing ? ' is-capturing' : ''}`}
                    disabled={pending && !capturing}
                    aria-pressed={capturing}
                    onClick={() => setCapturingSiteId(capturing ? null : site.id)}
                    onKeyDown={
                      capturing ? (event) => handleCaptureKeyDown(site.id, event) : undefined
                    }
                    onBlur={() => capturing && setCapturingSiteId(null)}
                  >
                    {capturing ? 'Press a key…' : 'Change'}
                  </button>
                  {hasOverride ? (
                    <button
                      type="button"
                      class="settings-hotkeys-clear"
                      disabled={pending}
                      onClick={() => resetSite(site.id)}
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hotkeys.bindings.length > 0 ? (
        <div class="settings-hotkeys-footer">
          <Button
            size="small"
            variant="secondary"
            pending={pending}
            onClick={() => void save({ enabled: hotkeys.enabled, bindings: [] })}
          >
            Reset all to defaults
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ScheduledCheckinPanel(): JSX.Element {
  const snapshot = rendererSnapshot.value;
  const schedule = snapshot?.settings.checkinSchedule ?? {
    enabled: false,
    time: '09:00',
    lastRunDate: null,
  };
  const targetCount =
    snapshot?.tasks.categories.reduce(
      (count, category) => count + category.sites.filter((site) => site.checkin?.enabled).length,
      0,
    ) ?? 0;
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const save = async (enabled: boolean, time: string): Promise<void> => {
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.settings.setCheckinSchedule({ enabled, time }),
      );
      publishSnapshot(response.snapshot);
      setFeedback({
        tone: 'success',
        title: enabled ? 'Daily check-in scheduled' : 'Daily check-in disabled',
        message: enabled
          ? `Next run is scheduled for ${time} local time.`
          : 'No daily run is scheduled.',
      });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        title: 'Schedule was not saved',
        message: errorMessage(error, 'RefTrack could not save the daily check-in schedule.'),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      class="settings-panel settings-panel--checkin"
      aria-labelledby="checkin-schedule-title"
    >
      <header class="settings-panel__header">
        <span class="settings-panel__icon settings-panel__icon--green" aria-hidden="true">
          <ActivityIcon size={20} />
        </span>
        <div>
          <span class="settings-eyebrow">Background schedule</span>
          <h2 id="checkin-schedule-title">Daily auto check-in</h2>
          <p>Runs enabled Daily Tasks sites while RefTrack remains in the tray.</p>
        </div>
      </header>

      {feedback ? (
        <div
          class={`settings-feedback settings-feedback--${feedback.tone}`}
          role={feedback.tone === 'danger' ? 'alert' : 'status'}
        >
          <strong>{feedback.title}</strong>
          <span>{feedback.message}</span>
        </div>
      ) : null}

      <div class="settings-control-card settings-checkin-schedule">
        <ToggleSwitch
          id="settings-checkin-schedule-enabled"
          label="Enable daily auto check-in"
          description={`${targetCount} check-in site${targetCount === 1 ? '' : 's'} currently enabled`}
          checked={schedule.enabled}
          pending={pending}
          onChange={(enabled) => void save(enabled, schedule.time)}
        />

        <label class="settings-checkin-time" htmlFor="settings-checkin-schedule-time">
          <span>
            <strong>Run time</strong>
            <small>Local computer time</small>
          </span>
          <input
            id="settings-checkin-schedule-time"
            type="time"
            value={schedule.time}
            disabled={pending}
            onChange={(event) => void save(schedule.enabled, event.currentTarget.value)}
          />
        </label>

        <div class="settings-checkin-summary" role="status">
          <span>{schedule.enabled ? `Daily at ${schedule.time}` : 'Schedule off'}</span>
          <span>
            {schedule.lastRunDate
              ? `Last scheduled attempt: ${schedule.lastRunDate}`
              : 'Not run yet'}
          </span>
        </div>
      </div>
    </section>
  );
}

export function SettingsScreen({ active }: { active: boolean }): JSX.Element {
  const snapshot = rendererSnapshot.value;
  const enabled = snapshot?.settings.folderClearEnabled ?? false;
  const folderPath = snapshot?.settings.folderClearPath ?? null;
  const hotkey = snapshot?.settings.folderClearHotkey ?? null;
  const [recordingHotkey, setRecordingHotkey] = useState(false);
  const status = useMemo(() => cleanerStatus(enabled, folderPath), [enabled, folderPath]);
  const [pending, setPending] = useState<PendingAction>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lastCleanup, setLastCleanup] = useState<ImageCleanupCompletedEvent | null>(null);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [appInfo, setAppInfo] = useState<ApplicationInfo | null>(null);
  const [appInfoLoading, setAppInfoLoading] = useState(false);
  const [appInfoFailure, setAppInfoFailure] = useState<string | null>(null);

  useEffect(
    () =>
      window.reftrack.imageCleaner.onCompleted((event) => {
        setLastCleanup(event);
        setCleanupRunning(false);
      }),
    [],
  );

  const loadApplicationInfo = async (): Promise<void> => {
    setAppInfoLoading(true);
    setAppInfoFailure(null);
    try {
      const result = unwrapIpcResult(await window.reftrack.app.getInfo());
      setAppInfo(result);
    } catch (error) {
      setAppInfoFailure(errorMessage(error, 'Application information could not be loaded.'));
    } finally {
      setAppInfoLoading(false);
    }
  };

  useEffect(() => {
    if (!active || appInfo || appInfoFailure || appInfoLoading) return;
    void loadApplicationInfo();
  }, [active, appInfo, appInfoFailure, appInfoLoading]);

  const changeCleanerEnabled = async (nextEnabled: boolean): Promise<void> => {
    if (pending) return;
    setPending('toggle-cleaner');
    setFeedback(null);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.settings.setImageCleanerEnabled({ enabled: nextEnabled }),
      );
      publishSnapshot(response.snapshot);
      const path = response.snapshot.settings.folderClearPath;
      setFeedback({
        tone: 'success',
        title: nextEnabled ? 'Image Cleaner enabled' : 'Image Cleaner disabled',
        message:
          nextEnabled && !path
            ? 'Choose a dedicated folder before cleanup can run.'
            : nextEnabled
              ? 'Verified top-level images will move to the Recycle Bin after Copy Link.'
              : 'Copy Link will no longer start image cleanup.',
      });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        title: 'Setting was not changed',
        message: errorMessage(error, 'RefTrack could not save the Image Cleaner setting.'),
      });
    } finally {
      setPending(null);
    }
  };

  const selectFolder = async (): Promise<void> => {
    if (pending) return;
    setPending('select-folder');
    setFeedback(null);
    try {
      const response = unwrapIpcResult(await window.reftrack.settings.selectImageCleanerFolder());
      publishSnapshot(response.snapshot);
      if (!response.selected || !response.folderPath) return;
      setFeedback({
        tone: 'success',
        title: 'Cleaner folder selected',
        message: response.folderPath,
      });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        title: 'Folder was not selected',
        message: errorMessage(error, 'RefTrack could not use that folder.'),
      });
    } finally {
      setPending(null);
    }
  };

  const runCleanupNow = async (): Promise<void> => {
    if (pending || cleanupRunning) return;
    setFeedback(null);
    setCleanupRunning(true);
    try {
      const outcome = unwrapIpcResult(await window.reftrack.imageCleaner.run());
      if (outcome.status === 'started') {
        setFeedback({
          tone: 'info',
          title: 'Cleanup started',
          message: 'Verified top-level images are moving to the Recycle Bin.',
        });
        return;
      }
      if (outcome.status === 'busy') {
        setFeedback({
          tone: 'info',
          title: 'Cleanup already running',
          message: 'An existing cleanup is finishing in the background.',
        });
        return;
      }

      setCleanupRunning(false);
      setFeedback({
        tone: 'info',
        title: 'Choose a folder first',
        message: 'Select a dedicated folder before running cleanup.',
      });
    } catch (error) {
      setCleanupRunning(false);
      setFeedback({
        tone: 'danger',
        title: 'Cleanup could not start',
        message: errorMessage(error, 'RefTrack could not start image cleanup.'),
      });
    }
  };

  const applyHotkey = async (accelerator: string | null): Promise<void> => {
    if (pending) return;
    setPending('set-hotkey');
    setFeedback(null);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.settings.setImageCleanerHotkey({ hotkey: accelerator }),
      );
      publishSnapshot(response.snapshot);
      setFeedback({
        tone: 'success',
        title: accelerator ? 'Shortcut set' : 'Shortcut cleared',
        message: accelerator
          ? `Press ${formatAccelerator(accelerator)} anytime to run cleanup.`
          : 'The global cleanup shortcut was removed.',
      });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        title: 'Shortcut was not set',
        message: errorMessage(error, 'RefTrack could not set that shortcut.'),
      });
    } finally {
      setPending(null);
    }
  };

  const captureHotkey = (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    if (event.key === 'Escape' || event.key === 'Tab') {
      setRecordingHotkey(false);
      return;
    }
    const accelerator = acceleratorFromKeyboardEvent(event);
    if (!accelerator) return;
    setRecordingHotkey(false);
    void applyHotkey(accelerator);
  };

  return (
    <main
      id="tab-settings"
      class="settings-screen"
      role="tabpanel"
      aria-labelledby="nav-settings"
      aria-label="Settings"
      tabIndex={active ? 0 : -1}
      hidden={!active}
      aria-hidden={!active || undefined}
    >
      <header class="settings-screen__header">
        <div class="settings-screen__title">
          <span class="settings-screen__icon" aria-hidden="true">
            <SettingsIcon size={21} />
          </span>
          <div>
            <span class="settings-eyebrow">Application preferences</span>
            <h1>Settings</h1>
            <p>Configure safe image cleanup and review this local RefTrack installation.</p>
          </div>
        </div>

        <div
          class={`settings-cleaner-status settings-cleaner-status--${status.tone}`}
          role="status"
        >
          <span class="settings-cleaner-status__dot" aria-hidden="true" />
          <div>
            <strong>Image Cleaner: {status.label}</strong>
            <span>{status.description}</span>
          </div>
        </div>
      </header>

      <div class="settings-screen__body">
        {feedback ? (
          <div
            class={`settings-feedback settings-feedback--${feedback.tone}`}
            role={feedback.tone === 'danger' ? 'alert' : 'status'}
          >
            <strong>{feedback.title}</strong>
            <span>{feedback.message}</span>
          </div>
        ) : null}

        <div class="settings-layout-grid">
          <section
            class="settings-panel settings-panel--cleaner"
            aria-labelledby="image-cleaner-title"
          >
            <header class="settings-panel__header">
              <span class="settings-panel__icon settings-panel__icon--purple" aria-hidden="true">
                <FolderIcon size={20} />
              </span>
              <div>
                <span class="settings-eyebrow">After Copy Link</span>
                <h2 id="image-cleaner-title">Image Cleaner</h2>
                <p>
                  Move verified image files from one dedicated folder to the Windows Recycle Bin.
                </p>
              </div>
            </header>

            <div class="settings-control-card">
              <ToggleSwitch
                id="settings-image-cleaner-enabled"
                label="Enable cleanup after Copy Link"
                description="The clipboard and copy transaction complete first; cleanup continues asynchronously."
                checked={enabled}
                pending={pending === 'toggle-cleaner'}
                disabled={pending !== null && pending !== 'toggle-cleaner'}
                onChange={(checked) => void changeCleanerEnabled(checked)}
              />
            </div>

            <div class="settings-folder-card">
              <div class="settings-folder-card__copy">
                <span class="settings-folder-card__label">Dedicated folder</span>
                {folderPath ? (
                  <code class="settings-folder-path" title={folderPath}>
                    {folderPath}
                  </code>
                ) : (
                  <span class="settings-folder-card__empty">No folder selected</span>
                )}
              </div>
              <Button
                size="small"
                variant="secondary"
                pending={pending === 'select-folder'}
                disabled={pending !== null && pending !== 'select-folder'}
                leadingIcon={<FolderIcon size={15} />}
                onClick={() => void selectFolder()}
              >
                {folderPath ? 'Change folder' : 'Choose folder'}
              </Button>
            </div>

            <div class="settings-manual-run">
              <Button
                size="small"
                variant="primary"
                pending={cleanupRunning}
                disabled={!folderPath || pending !== null}
                leadingIcon={<TrashIcon size={15} />}
                onClick={() => void runCleanupNow()}
              >
                Run cleanup now
              </Button>
              <span class="settings-manual-run__hint">
                {folderPath
                  ? 'Clear verified images from the folder now, without a Copy Link — handy once the day’s copies are done.'
                  : 'Choose a folder above to enable manual cleanup.'}
              </span>
            </div>

            <div class="settings-hotkey">
              <div class="settings-hotkey__copy">
                <span class="settings-hotkey__label">Global shortcut</span>
                {hotkey ? (
                  <kbd class="settings-hotkey__value">{formatAccelerator(hotkey)}</kbd>
                ) : (
                  <span class="settings-hotkey__empty">No shortcut set</span>
                )}
                <span class="settings-hotkey__hint">
                  Runs cleanup from anywhere, even when RefTrack is not focused. Use a modifier
                  (Ctrl/Alt/Shift) plus a key.
                </span>
              </div>
              <div class="settings-hotkey__actions">
                <Button
                  size="small"
                  variant="secondary"
                  pending={pending === 'set-hotkey'}
                  disabled={pending !== null}
                  onClick={() => setRecordingHotkey((value) => !value)}
                  onKeyDown={recordingHotkey ? captureHotkey : undefined}
                >
                  {recordingHotkey
                    ? 'Press a shortcut… (Esc)'
                    : hotkey
                      ? 'Change shortcut'
                      : 'Set shortcut'}
                </Button>
                {hotkey ? (
                  <Button
                    size="small"
                    variant="quiet"
                    disabled={pending !== null}
                    onClick={() => void applyHotkey(null)}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>

            <div class="settings-format-section">
              <span class="settings-format-section__label">Verified formats</span>
              <ul class="settings-format-list" aria-label="Supported image formats">
                {SUPPORTED_FORMATS.map((format) => (
                  <li key={format}>{format}</li>
                ))}
              </ul>
            </div>

            <section class="settings-safety" aria-labelledby="cleaner-safety-title">
              <header>
                <span aria-hidden="true">
                  <ShieldIcon size={18} />
                </span>
                <h3 id="cleaner-safety-title">Safety boundaries</h3>
              </header>
              <ul>
                <li>
                  Only regular image files directly inside the selected folder are considered.
                </li>
                <li>
                  Subfolders, links, hidden files, system files and mismatched signatures are
                  skipped.
                </li>
                <li>
                  Eligible images move to the Windows Recycle Bin rather than being permanently
                  erased.
                </li>
                <li>
                  Drive roots, Windows folders, profile roots and personal-library roots are
                  rejected.
                </li>
              </ul>
            </section>
          </section>

          <HotkeysPanel />

          <ScheduledCheckinPanel />

          <section
            class="settings-panel settings-panel--recent"
            aria-labelledby="recent-cleanup-title"
          >
            <header class="settings-panel__header">
              <span class="settings-panel__icon settings-panel__icon--green" aria-hidden="true">
                <ShieldIcon size={20} />
              </span>
              <div>
                <span class="settings-eyebrow">Current session</span>
                <h2 id="recent-cleanup-title">Recent cleanup</h2>
                <p>Review the latest scan result and any files Windows could not move.</p>
              </div>
            </header>
            <CleanupResult result={lastCleanup} />
          </section>

          <section
            class="settings-panel settings-panel--about"
            aria-labelledby="about-reftrack-title"
          >
            <header class="settings-panel__header">
              <span class="settings-panel__icon settings-panel__icon--blue" aria-hidden="true">
                <InfoIcon size={20} />
              </span>
              <div>
                <span class="settings-eyebrow">Installation</span>
                <h2 id="about-reftrack-title">About RefTrack</h2>
                <p>Runtime versions and the local application-data location.</p>
              </div>
            </header>
            <ApplicationInformation
              info={appInfo}
              loading={appInfoLoading}
              failure={appInfoFailure}
              onRetry={() => void loadApplicationInfo()}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

import type { JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import type { ImageCleanupCompletedEvent } from '../../../shared/ipc/contract';
import { navigateTo, publishSnapshot } from '../../app/store';
import { LinkIcon } from '../../components/icons';
import { Button } from '../../design-system/Button';
import { errorMessage, unwrapIpcResult } from '../../lib/ipc-result';
import {
  activityClearPending,
  dashboardFilter,
  refreshDashboardDate,
  setSuccessPending,
  siteSignalFor,
  visibleDashboardSiteIds,
} from './dashboard-store';
import { performCopy } from './copy-action';
import { ActivityFeed } from './components/ActivityFeed';
import {
  DashboardToastRegion,
  DashboardUndoBar,
  type DashboardToast,
  type DashboardToastTone,
  type DashboardUndo,
} from './components/DashboardFeedback';
import { SiteCard } from './components/SiteCard';
import { SummaryStrip } from './components/SummaryStrip';

function cleanupToast(event: ImageCleanupCompletedEvent): Omit<DashboardToast, 'id'> {
  if (event.errorMessage) {
    return {
      tone: 'danger',
      title: 'Image cleanup failed',
      message: event.errorMessage,
    };
  }

  if (event.failed > 0) {
    return {
      tone: 'danger',
      title: 'Image cleanup partly completed',
      message: `${event.movedToRecycleBin} moved to the Recycle Bin; ${event.failed} could not be moved.`,
    };
  }

  if (event.movedToRecycleBin === 0) {
    return {
      tone: 'info',
      title: 'No images to clean',
      message: 'No verified top-level image files were found.',
    };
  }

  return {
    tone: 'success',
    title: 'Image cleanup complete',
    message: `${event.movedToRecycleBin} image${event.movedToRecycleBin === 1 ? '' : 's'} moved to the Recycle Bin.`,
  };
}

function nextToastId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `toast-${Date.now()}-${Math.random()}`;
}

export function DashboardScreen({ active }: { active: boolean }): JSX.Element {
  const [toasts, setToasts] = useState<readonly DashboardToast[]>([]);
  const [undo, setUndo] = useState<DashboardUndo | null>(null);
  const toastTimers = useRef(new Map<string, number>());
  const undoTimer = useRef<number | null>(null);
  const siteIds = visibleDashboardSiteIds.value;
  const selectedFilter = dashboardFilter.value;

  const dismissToast = useCallback((id: string): void => {
    const timer = toastTimers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    toastTimers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (tone: DashboardToastTone, title: string, message?: string): void => {
      const id = nextToastId();
      setToasts((current) => [...current.slice(-3), { id, tone, title, message }]);
      const timer = window.setTimeout(() => dismissToast(id), 4200);
      toastTimers.current.set(id, timer);
    },
    [dismissToast],
  );

  const clearUndo = useCallback((): void => {
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setUndo(null);
  }, []);

  const showUndo = useCallback(
    (message: string, activityId: string): void => {
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);

      const onUndo = async (): Promise<void> => {
        setUndo((current) => (current ? { ...current, pending: true } : null));
        try {
          const response = unwrapIpcResult(
            await window.reftrack.actions.undoSuccess({ activityId }),
          );
          publishSnapshot(response.snapshot);
          clearUndo();
          addToast('info', 'Success removed', 'The most recent success was undone.');
        } catch (error) {
          setUndo((current) => (current ? { ...current, pending: false } : null));
          addToast(
            'danger',
            'Undo failed',
            errorMessage(error, 'The success could not be undone.'),
          );
        }
      };

      setUndo({ message, pending: false, onUndo: () => void onUndo() });
      undoTimer.current = window.setTimeout(clearUndo, 6500);
    },
    [addToast, clearUndo],
  );

  useEffect(() => {
    const timers = toastTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const removeListener = window.reftrack.imageCleaner.onCompleted((event) => {
      const toast = cleanupToast(event);
      addToast(toast.tone, toast.title, toast.message);
    });
    return removeListener;
  }, [active, addToast]);

  useEffect(() => {
    let timer = 0;
    const schedule = (): void => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      timer = window.setTimeout(
        () => {
          refreshDashboardDate();
          addToast('info', 'New day started', 'Daily copy progress has been reset.');
          schedule();
        },
        Math.max(1000, nextMidnight.getTime() - now.getTime()),
      );
    };

    schedule();
    const handleVisibility = (): void => {
      if (!document.hidden) refreshDashboardDate();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [addToast]);

  const copySite = async (siteId: string): Promise<void> => {
    const result = await performCopy(siteId);
    if (result.status === 'skipped') return;

    if (result.status === 'error') {
      addToast('danger', 'Copy failed', result.message);
      return;
    }

    addToast(
      'copy',
      `${result.siteName} copied`,
      result.text.length > 84 ? `${result.text.slice(0, 81)}…` : result.text,
    );

    if (result.cleanup.status === 'started') {
      addToast(
        'info',
        'Image cleanup started',
        'Verified top-level images will move to the Recycle Bin.',
      );
    } else if (result.cleanup.status === 'busy') {
      addToast(
        'info',
        'Image cleanup already running',
        'The existing cleanup will finish in the background.',
      );
    } else if (result.cleanup.status === 'not-configured') {
      addToast(
        'info',
        'Image Cleaner needs a folder',
        'Choose a dedicated screenshots folder in Settings.',
      );
    }
  };

  const recordSuccess = async (siteId: string): Promise<void> => {
    const site = siteSignalFor(siteId).peek();
    if (!site) return;

    setSuccessPending(siteId, true);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.actions.recordSuccess({
          siteId,
          occurredAt: new Date().toISOString(),
        }),
      );
      publishSnapshot(response.snapshot);
      addToast('success', `Success recorded for ${site.name}`, `+$${site.bonus.toFixed(2)} added.`);
      showUndo(`Recorded $${site.bonus.toFixed(2)} for ${site.name}`, response.activityId);

      void window.reftrack.notifications
        .showAction({ kind: 'success', siteName: site.name, amountCents: response.bonusCents })
        .catch(() => undefined);
    } catch (error) {
      addToast(
        'danger',
        'Success was not recorded',
        errorMessage(error, 'RefTrack could not save that success.'),
      );
    } finally {
      setSuccessPending(siteId, false);
    }
  };

  const openSite = async (url: string): Promise<void> => {
    try {
      unwrapIpcResult(await window.reftrack.external.open({ url }));
    } catch (error) {
      addToast(
        'danger',
        'Could not open site',
        errorMessage(error, 'Windows could not open that URL.'),
      );
    }
  };

  const clearActivity = async (): Promise<void> => {
    if (activityClearPending.peek()) return;
    activityClearPending.value = true;
    try {
      const response = unwrapIpcResult(await window.reftrack.activity.clear());
      publishSnapshot(response.snapshot);
      addToast('info', 'Activity cleared', 'Historical statistics were not changed.');
    } catch (error) {
      addToast(
        'danger',
        'Activity was not cleared',
        errorMessage(error, 'RefTrack could not clear the feed.'),
      );
    } finally {
      activityClearPending.value = false;
    }
  };

  return (
    <main
      id="tab-dashboard"
      class="dashboard-screen"
      role="tabpanel"
      aria-labelledby="nav-dashboard"
      aria-label="Dashboard"
      tabIndex={active ? 0 : -1}
      hidden={!active}
      aria-hidden={!active || undefined}
    >
      <SummaryStrip />

      <div class="dashboard-layout">
        <section class="dashboard-sites" aria-labelledby="dashboard-sites-title">
          <header class="dashboard-panel-header dashboard-sites__header">
            <div>
              <span class="dashboard-panel-header__eyebrow">Referral workflow</span>
              <h1 id="dashboard-sites-title">
                <LinkIcon size={19} />
                Active sites
              </h1>
            </div>

            <div class="dashboard-filter" role="group" aria-label="Filter active sites">
              {(
                [
                  ['all', 'All'],
                  ['pending', 'Ready'],
                  ['done', 'Complete'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  class={selectedFilter === id ? 'is-selected' : ''}
                  aria-pressed={selectedFilter === id}
                  onClick={() => {
                    dashboardFilter.value = id;
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>

          {siteIds.length === 0 ? (
            <div class="dashboard-sites__empty">
              <LinkIcon size={34} />
              <strong>
                {selectedFilter === 'all'
                  ? 'No sites have been added'
                  : 'No sites match this filter'}
              </strong>
              <span>
                {selectedFilter === 'all'
                  ? 'Create your first referral site in Site Editor.'
                  : 'Choose another filter to see the rest of your sites.'}
              </span>
              {selectedFilter === 'all' ? (
                <Button variant="primary" onClick={() => navigateTo('editor')}>
                  Open Site Editor
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    dashboardFilter.value = 'all';
                  }}
                >
                  Show all sites
                </Button>
              )}
            </div>
          ) : (
            <div class="dashboard-sites__grid">
              {siteIds.map((siteId) => (
                <SiteCard
                  key={siteId}
                  siteId={siteId}
                  onCopy={(id) => void copySite(id)}
                  onSuccess={(id) => void recordSuccess(id)}
                  onOpen={(url) => void openSite(url)}
                />
              ))}
            </div>
          )}
        </section>

        <ActivityFeed onClear={() => void clearActivity()} />
      </div>

      <DashboardToastRegion toasts={toasts} onDismiss={dismissToast} />
      <DashboardUndoBar undo={undo} />
    </main>
  );
}

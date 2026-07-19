import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type { ImageCleanupCompletedEvent } from '../../../shared/ipc/contract';
import { navigateTo, publishSnapshot, rendererSnapshot } from '../../app/store';
import { BulkCategoryDialog } from '../../components/BulkCategoryDialog';
import { ClipboardIcon, ExternalLinkIcon, LinkIcon, TasksIcon } from '../../components/icons';
import { Button } from '../../design-system/Button';
import { errorMessage, unwrapIpcResult } from '../../lib/ipc-result';
import { newCategoryDetails, taskSiteFromReferralSite } from '../../lib/task-membership';
import { queueReferralSites } from '../share-queue/share-queue-store';
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function DashboardScreen({ active }: { active: boolean }): JSX.Element {
  const snapshot = rendererSnapshot.value;
  const [toasts, setToasts] = useState<readonly DashboardToast[]>([]);
  const [undo, setUndo] = useState<DashboardUndo | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState<ReadonlySet<string>>(new Set());
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [bulkPending, setBulkPending] = useState<'open' | 'category' | 'share' | null>(null);
  const toastTimers = useRef(new Map<string, number>());
  const undoTimer = useRef<number | null>(null);
  const siteIds = visibleDashboardSiteIds.value;
  const selectedFilter = dashboardFilter.value;
  const categories = snapshot?.tasks.categories ?? [];
  const selectedReferralSites = useMemo(
    () => (snapshot?.sites ?? []).filter((site) => selectedSiteIds.has(site.id)),
    [selectedSiteIds, snapshot?.sites],
  );
  const selectedCategorySites = useMemo(
    () => selectedReferralSites.map((site) => taskSiteFromReferralSite(site, categories)),
    [categories, selectedReferralSites],
  );

  useEffect(() => {
    const validIds = new Set((snapshot?.sites ?? []).map((site) => site.id));
    setSelectedSiteIds((current) => {
      const next = new Set([...current].filter((siteId) => validIds.has(siteId)));
      return next.size === current.size ? current : next;
    });
  }, [snapshot?.sites]);

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

  const openSite = async (site: (typeof selectedReferralSites)[number]): Promise<void> => {
    try {
      if (site.appClaim?.enabled) {
        if (site.appClaim.packageName.trim()) {
          unwrapIpcResult(
            await window.reftrack.sites.launchAndroidPackage({
              packageName: site.appClaim.packageName.trim(),
              avdName: site.appClaim.avdName.trim() || null,
            }),
          );
          addToast('success', `${site.name} app launched`);
          return;
        }
        if (site.appClaim.deepLinkUrl.trim()) {
          unwrapIpcResult(
            await window.reftrack.sites.openAndroidDeepLink({
              url: site.appClaim.deepLinkUrl.trim(),
              avdName: site.appClaim.avdName.trim() || null,
            }),
          );
          addToast('success', `${site.name} claim link opened in emulator`);
          return;
        }
        addToast(
          'info',
          `${site.name} needs app claim setup`,
          'Add an Android package name or claim link in Site Editor.',
        );
        return;
      }

      unwrapIpcResult(await window.reftrack.external.open({ url: site.url }));
    } catch (error) {
      addToast(
        'danger',
        site.appClaim?.enabled ? 'Could not launch app' : 'Could not open site',
        errorMessage(
          error,
          site.appClaim?.enabled
            ? 'RefTrack could not launch that Android app.'
            : 'Windows could not open that URL.',
        ),
      );
    }
  };

  const toggleSelectedSite = (siteId: string, selected: boolean): void => {
    setSelectedSiteIds((current) => {
      const next = new Set(current);
      if (selected) next.add(siteId);
      else next.delete(siteId);
      return next;
    });
  };

  const finishSelection = (): void => {
    setSelectionMode(false);
    setSelectedSiteIds(new Set());
  };

  const openSelectedSites = async (): Promise<void> => {
    if (bulkPending || selectedReferralSites.length === 0) return;
    const openable = selectedReferralSites.filter((site) => site.url);
    if (openable.length === 0) {
      addToast('info', 'No selected sites have URLs');
      return;
    }

    setBulkPending('open');
    let opened = 0;
    try {
      for (const site of openable) {
        try {
          unwrapIpcResult(await window.reftrack.external.open({ url: site.url }));
          opened += 1;
        } catch {
          // Report the aggregate after every selected URL has been attempted.
        }
        if (site !== openable[openable.length - 1]) await delay(180);
      }

      addToast(
        opened === openable.length ? 'success' : 'danger',
        `Opened ${opened} of ${openable.length} selected site${openable.length === 1 ? '' : 's'}`,
        opened === openable.length ? undefined : 'Some URLs could not be opened by Windows.',
      );
    } finally {
      setBulkPending(null);
    }
  };

  const queueSelectedShares = (): void => {
    if (bulkPending || selectedReferralSites.length === 0) return;
    setBulkPending('share');
    const queued = queueReferralSites(selectedReferralSites);
    setBulkPending(null);
    if (queued === 0) {
      addToast(
        'info',
        'No new sites queued',
        'Selected sites may already be queued or missing URLs.',
      );
      return;
    }
    addToast(
      'success',
      `Queued ${queued} site${queued === 1 ? '' : 's'} for sharing`,
      'Review posts in Facebook Group Shares before submitting manually.',
    );
    navigateTo('share');
  };

  const addSelectedToCategories = async (
    categoryIds: string[],
    newCategoryName: string,
  ): Promise<void> => {
    if (bulkPending || selectedCategorySites.length === 0) return;
    setBulkPending('category');
    try {
      const response = unwrapIpcResult(
        await window.reftrack.tasks.addSitesToCategories({
          sites: selectedCategorySites,
          categoryIds,
          newCategory: newCategoryName
            ? newCategoryDetails(newCategoryName, categories.length)
            : null,
        }),
      );
      publishSnapshot(response.snapshot);
      setCategoryDialogOpen(false);
      addToast(
        'success',
        `Added ${selectedCategorySites.length} site${selectedCategorySites.length === 1 ? '' : 's'}`,
        `${response.categoryIds.length} categor${response.categoryIds.length === 1 ? 'y' : 'ies'} updated.`,
      );
      finishSelection();
    } catch (error) {
      addToast(
        'danger',
        'Sites were not added',
        errorMessage(error, 'RefTrack could not update the selected categories.'),
      );
    } finally {
      setBulkPending(null);
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

            <div class="dashboard-sites__header-actions">
              <Button
                size="small"
                variant={selectionMode ? 'primary' : 'secondary'}
                onClick={() => {
                  if (selectionMode) finishSelection();
                  else setSelectionMode(true);
                }}
              >
                {selectionMode ? 'Done' : 'Select'}
              </Button>
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
            </div>
          </header>

          {selectionMode ? (
            <div class="dashboard-bulk-actions" role="toolbar" aria-label="Selected site actions">
              <strong>{selectedSiteIds.size} selected</strong>
              <Button
                size="small"
                variant="quiet"
                onClick={() => {
                  const allVisibleSelected = siteIds.every((siteId) => selectedSiteIds.has(siteId));
                  setSelectedSiteIds((current) => {
                    const next = new Set(current);
                    for (const siteId of siteIds) {
                      if (allVisibleSelected) next.delete(siteId);
                      else next.add(siteId);
                    }
                    return next;
                  });
                }}
              >
                {siteIds.length > 0 && siteIds.every((siteId) => selectedSiteIds.has(siteId))
                  ? 'Deselect visible'
                  : 'Select visible'}
              </Button>
              <span class="dashboard-bulk-actions__spacer" />
              <Button
                size="small"
                variant="secondary"
                pending={bulkPending === 'open'}
                disabled={
                  selectedSiteIds.size === 0 || (bulkPending !== null && bulkPending !== 'open')
                }
                leadingIcon={<ExternalLinkIcon size={15} />}
                onClick={() => void openSelectedSites()}
              >
                Open sites
              </Button>
              <Button
                size="small"
                variant="secondary"
                pending={bulkPending === 'share'}
                disabled={
                  selectedSiteIds.size === 0 || (bulkPending !== null && bulkPending !== 'share')
                }
                leadingIcon={<ClipboardIcon size={15} />}
                onClick={queueSelectedShares}
              >
                Queue share
              </Button>
              <Button
                size="small"
                variant="primary"
                disabled={selectedSiteIds.size === 0 || bulkPending !== null}
                leadingIcon={<TasksIcon size={15} />}
                onClick={() => setCategoryDialogOpen(true)}
              >
                Add to category
              </Button>
              <Button
                size="small"
                variant="quiet"
                disabled={selectedSiteIds.size === 0 || bulkPending !== null}
                onClick={() => setSelectedSiteIds(new Set())}
              >
                Clear
              </Button>
            </div>
          ) : null}

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
                  selectionMode={selectionMode}
                  selected={selectedSiteIds.has(siteId)}
                  onCopy={(id) => void copySite(id)}
                  onSuccess={(id) => void recordSuccess(id)}
                  onOpen={(site) => void openSite(site)}
                  onToggleSelected={toggleSelectedSite}
                />
              ))}
            </div>
          )}
        </section>

        <ActivityFeed onClear={() => void clearActivity()} />
      </div>

      <BulkCategoryDialog
        open={categoryDialogOpen}
        sites={selectedCategorySites}
        categories={categories}
        pending={bulkPending === 'category'}
        onClose={() => setCategoryDialogOpen(false)}
        onApply={(categoryIds, newCategoryName) =>
          void addSelectedToCategories(categoryIds, newCategoryName)
        }
      />

      <DashboardToastRegion toasts={toasts} onDismiss={dismissToast} />
      <DashboardUndoBar undo={undo} />
    </main>
  );
}

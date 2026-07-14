import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type {
  RendererTaskCategory,
  RendererTaskSite,
} from '../../../shared/view-model/renderer-snapshot';
import { publishSnapshot, rendererSnapshot } from '../../app/store';
import { BulkCategoryDialog } from '../../components/BulkCategoryDialog';
import {
  CheckIcon,
  ExternalLinkIcon,
  ImportIcon,
  PlusIcon,
  TasksIcon,
  TrashIcon,
} from '../../components/icons';
import { Button } from '../../design-system/Button';
import { Dialog } from '../../design-system/Dialog';
import { ToggleSwitch } from '../../design-system/ToggleSwitch';
import { errorMessage, unwrapIpcResult } from '../../lib/ipc-result';
import {
  newCategoryDetails,
  selectedTaskSites as resolveSelectedTaskSites,
} from '../../lib/task-membership';
import {
  categoryProgress,
  categoryStatus,
  countCheckinSites,
  globalTaskProgress,
  localTaskDateKey,
  sortTaskCategories,
  taskSiteDone,
} from './daily-tasks-model';
import { PartnerImportDialog } from './components/PartnerImportDialog';
import { TaskCategoryCard } from './components/TaskCategoryCard';
import { TaskCategoryDialog } from './components/TaskCategoryDialog';
import { TextFileImportDialog } from './components/TextFileImportDialog';

type FeedbackTone = 'success' | 'info' | 'danger';

interface Feedback {
  id: number;
  tone: FeedbackTone;
  title: string;
  message?: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function DailyTasksScreen({ active }: { active: boolean }): JSX.Element {
  const snapshot = rendererSnapshot.value;
  const categories = snapshot?.tasks.categories ?? [];
  const dailyState = snapshot?.tasksDailyState ?? {};
  const checkinState = snapshot?.checkinDailyState ?? {};
  const checkinSiteCount = useMemo(() => countCheckinSites(categories), [categories]);
  const [checkinRunId, setCheckinRunId] = useState<string | null>(null);
  const [checkinStatus, setCheckinStatus] = useState<string | null>(null);
  const [today, setToday] = useState(() => localTaskDateKey());
  const [autoSort, setAutoSort] = useState(true);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingSiteIds, setPendingSiteIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingOpenCategoryIds, setPendingOpenCategoryIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkPending, setBulkPending] = useState<'open' | 'category' | null>(null);
  const [categoryMembershipOpen, setCategoryMembershipOpen] = useState(false);
  const [editorCategory, setEditorCategory] = useState<RendererTaskCategory | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPending, setEditorPending] = useState(false);
  const [deleteCategory, setDeleteCategory] = useState<RendererTaskCategory | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [partnerImportOpen, setPartnerImportOpen] = useState(false);
  const [textImportOpen, setTextImportOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const initialExpansionApplied = useRef(false);

  const sortedCategories = useMemo(
    () => sortTaskCategories(categories, dailyState, today, autoSort),
    [autoSort, categories, dailyState, today],
  );
  const globalProgress = useMemo(
    () => globalTaskProgress(categories, dailyState, today),
    [categories, dailyState, today],
  );
  const selectedSites = useMemo(
    () => resolveSelectedTaskSites(categories, selectedSiteIds),
    [categories, selectedSiteIds],
  );
  const uniqueSiteCount = useMemo(
    () => new Set(categories.flatMap((category) => category.sites.map((site) => site.id))).size,
    [categories],
  );

  useEffect(() => {
    const validIds = new Set(
      categories.flatMap((category) => category.sites.map((site) => site.id)),
    );
    setSelectedSiteIds((current) => {
      const next = new Set([...current].filter((siteId) => validIds.has(siteId)));
      return next.size === current.size ? current : next;
    });
  }, [categories]);

  const showFeedback = useCallback((tone: FeedbackTone, title: string, message?: string): void => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    setFeedback(
      message ? { id: Date.now(), tone, title, message } : { id: Date.now(), tone, title },
    );
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 5200);
  }, []);

  useEffect(
    () => () => {
      if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    },
    [],
  );

  useEffect(() => {
    const offProgress = window.reftrack.checkin.onProgress((event) => {
      setCheckinStatus(
        event.total > 1 ? `(${event.index}/${event.total}) ${event.message}` : event.message,
      );
    });
    const offCompleted = window.reftrack.checkin.onCompleted((event) => {
      publishSnapshot(event.snapshot);
      setCheckinRunId(null);
      setCheckinStatus(null);

      const success = event.results.filter((result) => result.status === 'success').length;
      const failed = event.results.filter((result) => result.status === 'failed').length;
      const skipped = event.results.filter((result) => result.status === 'skipped').length;
      const detail = [
        failed ? `${failed} failed` : null,
        skipped ? `${skipped} skipped (no credentials)` : null,
      ]
        .filter(Boolean)
        .join(', ');

      if (event.cancelled) {
        showFeedback(
          'info',
          'Check-in cancelled',
          `${success} site${success === 1 ? '' : 's'} completed before cancelling.`,
        );
      } else if (failed === 0 && skipped === 0) {
        showFeedback(
          'success',
          `Checked in ${success} site${success === 1 ? '' : 's'}`,
          'Every automatic check-in completed successfully.',
        );
      } else {
        showFeedback(
          failed > 0 ? 'danger' : 'info',
          `Checked in ${success} of ${event.results.length} site${event.results.length === 1 ? '' : 's'}`,
          detail || undefined,
        );
      }
    });

    return () => {
      offProgress();
      offCompleted();
    };
  }, [showFeedback]);

  useEffect(() => {
    if (!active) return;

    const refreshDate = (): void => {
      const next = localTaskDateKey();
      setToday((current) => {
        if (current !== next) {
          showFeedback('info', 'New day started', 'Daily Task progress is ready for today.');
          return next;
        }
        return current;
      });
    };

    let timer = 0;
    const schedule = (): void => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = window.setTimeout(
        () => {
          refreshDate();
          schedule();
        },
        Math.max(1000, midnight.getTime() - now.getTime()),
      );
    };

    schedule();
    const onVisibility = (): void => {
      if (!document.hidden) refreshDate();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, showFeedback]);

  useEffect(() => {
    if (initialExpansionApplied.current || sortedCategories.length === 0) return;
    initialExpansionApplied.current = true;
    const preferred =
      sortedCategories.find(
        (category) =>
          categoryStatus(categoryProgress(category, dailyState, today)) === 'in-progress',
      ) ?? sortedCategories[0];
    if (preferred) setExpandedCategoryIds(new Set([preferred.id]));
  }, [dailyState, sortedCategories, today]);

  const setSitePending = (siteId: string, pending: boolean): void => {
    setPendingSiteIds((current) => {
      const next = new Set(current);
      if (pending) next.add(siteId);
      else next.delete(siteId);
      return next;
    });
  };

  const setCategoryOpening = (categoryId: string, pending: boolean): void => {
    setPendingOpenCategoryIds((current) => {
      const next = new Set(current);
      if (pending) next.add(categoryId);
      else next.delete(categoryId);
      return next;
    });
  };

  const expandCategory = (categoryId: string): void => {
    setExpandedCategoryIds((current) => new Set(current).add(categoryId));
  };

  const toggleExpanded = (categoryId: string): void => {
    setExpandedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const toggleSelectedSite = (site: RendererTaskSite, selected: boolean): void => {
    setSelectedSiteIds((current) => {
      const next = new Set(current);
      if (selected) next.add(site.id);
      else next.delete(site.id);
      return next;
    });
  };

  const finishSelection = (): void => {
    setSelectionMode(false);
    setSelectedSiteIds(new Set());
  };

  const openSelectedSites = async (): Promise<void> => {
    if (bulkPending || selectedSites.length === 0) return;
    const openable = selectedSites.filter((site) => site.url);
    if (openable.length === 0) {
      showFeedback('info', 'No selected sites have URLs');
      return;
    }

    setBulkPending('open');
    const completed: Array<{ categoryId: string; siteId: string; done: true }> = [];
    const failures: string[] = [];
    try {
      for (const site of openable) {
        const membership = categories.find((category) =>
          category.sites.some((candidate) => candidate.id === site.id),
        );
        if (!membership) continue;
        try {
          unwrapIpcResult(await window.reftrack.external.open({ url: site.url }));
          completed.push({ categoryId: membership.id, siteId: site.id, done: true });
        } catch {
          failures.push(site.name);
        }
        if (site !== openable[openable.length - 1]) await delay(180);
      }

      if (completed.length) {
        const response = unwrapIpcResult(
          await window.reftrack.tasks.setCompletions({ date: today, items: completed }),
        );
        publishSnapshot(response.snapshot);
      }

      showFeedback(
        failures.length ? 'danger' : 'success',
        `Opened ${completed.length} of ${openable.length} selected site${openable.length === 1 ? '' : 's'}`,
        failures.length ? `Windows could not open: ${failures.join(', ')}.` : undefined,
      );
    } catch (error) {
      showFeedback(
        'danger',
        'Opened links but could not save progress',
        errorMessage(error, 'Retry the incomplete sites after checking the task list.'),
      );
    } finally {
      setBulkPending(null);
    }
  };

  const addSelectedToCategories = async (
    categoryIds: string[],
    newCategoryName: string,
  ): Promise<void> => {
    if (bulkPending || selectedSites.length === 0) return;
    setBulkPending('category');
    try {
      const response = unwrapIpcResult(
        await window.reftrack.tasks.addSitesToCategories({
          sites: selectedSites,
          categoryIds,
          newCategory: newCategoryName
            ? newCategoryDetails(newCategoryName, categories.length)
            : null,
        }),
      );
      publishSnapshot(response.snapshot);
      setCategoryMembershipOpen(false);
      for (const categoryId of response.categoryIds) expandCategory(categoryId);
      showFeedback(
        'success',
        `Added ${selectedSites.length} site${selectedSites.length === 1 ? '' : 's'}`,
        `${response.categoryIds.length} categor${response.categoryIds.length === 1 ? 'y' : 'ies'} updated.`,
      );
      finishSelection();
    } catch (error) {
      showFeedback(
        'danger',
        'Sites were not added',
        errorMessage(error, 'RefTrack could not update the selected categories.'),
      );
    } finally {
      setBulkPending(null);
    }
  };

  const setCompletion = async (
    category: RendererTaskCategory,
    site: RendererTaskSite,
    done: boolean,
  ): Promise<void> => {
    if (pendingSiteIds.has(site.id) || pendingOpenCategoryIds.has(category.id)) return;
    setSitePending(site.id, true);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.tasks.setCompletion({
          date: today,
          categoryId: category.id,
          siteId: site.id,
          done,
        }),
      );
      publishSnapshot(response.snapshot);
      expandCategory(category.id);
    } catch (error) {
      showFeedback(
        'danger',
        'Task progress was not saved',
        errorMessage(error, 'RefTrack could not complete that Daily Tasks operation.'),
      );
    } finally {
      setSitePending(site.id, false);
    }
  };

  const visitSite = async (
    category: RendererTaskCategory,
    site: RendererTaskSite,
  ): Promise<void> => {
    if (!site.url || pendingSiteIds.has(site.id) || pendingOpenCategoryIds.has(category.id)) return;
    setSitePending(site.id, true);
    try {
      unwrapIpcResult(await window.reftrack.external.open({ url: site.url }));
      if (!taskSiteDone(dailyState, today, category.id, site.id)) {
        const response = unwrapIpcResult(
          await window.reftrack.tasks.setCompletion({
            date: today,
            categoryId: category.id,
            siteId: site.id,
            done: true,
          }),
        );
        publishSnapshot(response.snapshot);
      }
      expandCategory(category.id);
    } catch (error) {
      showFeedback(
        'danger',
        `Could not open ${site.name}`,
        errorMessage(error, 'RefTrack could not complete that Daily Tasks operation.'),
      );
    } finally {
      setSitePending(site.id, false);
    }
  };

  const openRemaining = async (category: RendererTaskCategory): Promise<void> => {
    if (pendingOpenCategoryIds.has(category.id)) return;

    const remaining = category.sites.filter(
      (site) => site.url && !taskSiteDone(dailyState, today, category.id, site.id),
    );
    if (!remaining.length) {
      showFeedback('info', 'Everything is complete', category.name);
      return;
    }

    setCategoryOpening(category.id, true);
    expandCategory(category.id);
    const completed: Array<{ categoryId: string; siteId: string; done: true }> = [];
    const failures: string[] = [];

    try {
      for (const site of remaining) {
        setSitePending(site.id, true);
        try {
          unwrapIpcResult(await window.reftrack.external.open({ url: site.url }));
          completed.push({ categoryId: category.id, siteId: site.id, done: true });
        } catch {
          failures.push(site.name);
        } finally {
          setSitePending(site.id, false);
        }
        if (site !== remaining[remaining.length - 1]) await delay(260);
      }

      if (completed.length) {
        const response = unwrapIpcResult(
          await window.reftrack.tasks.setCompletions({ date: today, items: completed }),
        );
        publishSnapshot(response.snapshot);
      }

      if (failures.length) {
        showFeedback(
          'danger',
          `Opened ${completed.length} of ${remaining.length} sites`,
          `Windows could not open: ${failures.join(', ')}. Those sites remain incomplete.`,
        );
      } else {
        showFeedback(
          'success',
          `Opened ${completed.length} site${completed.length === 1 ? '' : 's'}`,
          `${category.name} is now complete for today.`,
        );
      }
    } catch (error) {
      showFeedback(
        'danger',
        'Opened links but could not save progress',
        errorMessage(error, 'Retry the incomplete sites after checking the task list.'),
      );
    } finally {
      setCategoryOpening(category.id, false);
    }
  };

  const startCheckin = async (taskSiteId: string | null): Promise<void> => {
    if (checkinRunId) return;
    try {
      const response = unwrapIpcResult(await window.reftrack.checkin.start({ taskSiteId }));
      setCheckinRunId(response.runId);
      setCheckinStatus(
        taskSiteId
          ? 'Starting automatic check-in…'
          : `Checking in ${response.targetCount} site${response.targetCount === 1 ? '' : 's'}…`,
      );
    } catch (error) {
      showFeedback(
        'danger',
        'Automatic check-in could not start',
        errorMessage(error, 'RefTrack could not start the automatic check-in.'),
      );
    }
  };

  const cancelCheckin = (): void => {
    if (!checkinRunId) return;
    void window.reftrack.checkin.cancel({ runId: checkinRunId });
    setCheckinStatus('Cancelling…');
  };

  const openNewCategory = (): void => {
    setEditorCategory(null);
    setEditorOpen(true);
  };

  const openEditCategory = (category: RendererTaskCategory): void => {
    setEditorCategory(category);
    setEditorOpen(true);
  };

  const saveCategory = async (category: RendererTaskCategory): Promise<boolean> => {
    if (editorPending) return false;
    setEditorPending(true);
    try {
      const response = unwrapIpcResult(await window.reftrack.tasks.upsertCategory({ category }));
      publishSnapshot(response.snapshot);
      setEditorOpen(false);
      setEditorCategory(null);
      expandCategory(response.categoryId);
      showFeedback(
        'success',
        editorCategory ? 'Category updated' : 'Category created',
        `${category.name} contains ${category.sites.length} site${category.sites.length === 1 ? '' : 's'}.`,
      );
      return true;
    } catch (error) {
      showFeedback(
        'danger',
        'Category could not be saved',
        errorMessage(error, 'RefTrack could not complete that Daily Tasks operation.'),
      );
      return false;
    } finally {
      setEditorPending(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleteCategory || deletePending) return;
    setDeletePending(true);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.tasks.deleteCategory({ categoryId: deleteCategory.id }),
      );
      publishSnapshot(response.snapshot);
      setExpandedCategoryIds((current) => {
        const next = new Set(current);
        next.delete(deleteCategory.id);
        return next;
      });
      showFeedback(
        'info',
        'Category deleted',
        `${deleteCategory.name} and its daily progress were removed.`,
      );
      setDeleteCategory(null);
    } catch (error) {
      showFeedback(
        'danger',
        'Category could not be deleted',
        errorMessage(error, 'RefTrack could not complete that Daily Tasks operation.'),
      );
    } finally {
      setDeletePending(false);
    }
  };

  const imported = useCallback(
    (
      categoryId: string,
      categoryName: string,
      siteCount: number,
      nextSnapshot: NonNullable<typeof snapshot>,
    ): void => {
      publishSnapshot(nextSnapshot);
      expandCategory(categoryId);
      showFeedback(
        'success',
        `Imported ${categoryName}`,
        `${siteCount} site${siteCount === 1 ? '' : 's'} added as a Daily Tasks category.`,
      );
    },
    [showFeedback],
  );

  return (
    <main
      id="tab-tasks"
      class="daily-tasks-screen"
      role="tabpanel"
      aria-labelledby="nav-tasks"
      aria-label="Daily Tasks"
      tabIndex={active ? 0 : -1}
      hidden={!active}
      aria-hidden={!active || undefined}
    >
      <header class="daily-tasks-header">
        <div class="daily-tasks-header__identity">
          <span class="daily-tasks-header__icon" aria-hidden="true">
            <TasksIcon size={22} />
          </span>
          <div>
            <span class="daily-tasks-eyebrow">Daily workflow</span>
            <h1>Daily Tasks</h1>
            <p>Open, verify and complete every partner-site routine from one focused workspace.</p>
          </div>
        </div>

        <div class="daily-tasks-header__actions">
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
          {checkinSiteCount > 0 ? (
            checkinRunId ? (
              <Button size="small" variant="danger" onClick={cancelCheckin}>
                Cancel check-in
              </Button>
            ) : (
              <Button
                size="small"
                variant="secondary"
                leadingIcon={<CheckIcon size={16} />}
                onClick={() => void startCheckin(null)}
              >
                Check in all sites
              </Button>
            )
          ) : null}
          <Button
            size="small"
            variant="secondary"
            leadingIcon={<ImportIcon size={16} />}
            onClick={() => setPartnerImportOpen(true)}
          >
            Import partner page
          </Button>
          <Button
            size="small"
            variant="secondary"
            leadingIcon={<ImportIcon size={16} />}
            onClick={() => setTextImportOpen(true)}
          >
            Import .txt
          </Button>
          <Button
            size="small"
            variant="primary"
            leadingIcon={<PlusIcon size={16} />}
            onClick={openNewCategory}
          >
            New category
          </Button>
        </div>
      </header>

      <section class="daily-tasks-summary" aria-label="Today's Daily Tasks progress">
        <div class="daily-tasks-summary__copy">
          <span>Today’s progress</span>
          <strong>
            {globalProgress.done} of {globalProgress.total} complete
          </strong>
        </div>
        <div
          class="daily-tasks-summary__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={globalProgress.total || 1}
          aria-valuenow={globalProgress.done}
          aria-label={`${globalProgress.done} of ${globalProgress.total} Daily Tasks complete`}
        >
          <span style={{ width: `${globalProgress.percent}%` }} />
        </div>
        <span class="daily-tasks-summary__percent">{globalProgress.percent}%</span>
        <ToggleSwitch
          id="daily-tasks-auto-sort"
          label="Auto-sort categories"
          description="In progress first; completed categories last."
          checked={autoSort}
          onChange={setAutoSort}
        />
      </section>

      <div class="daily-tasks-body">
        {selectionMode ? (
          <div class="daily-tasks-bulk-actions" role="toolbar" aria-label="Selected site actions">
            <strong>{selectedSiteIds.size} selected</strong>
            <Button
              size="small"
              variant="quiet"
              onClick={() => {
                const allSelected = uniqueSiteCount > 0 && selectedSiteIds.size === uniqueSiteCount;
                setSelectedSiteIds(
                  allSelected
                    ? new Set()
                    : new Set(
                        categories.flatMap((category) => category.sites.map((site) => site.id)),
                      ),
                );
              }}
            >
              {uniqueSiteCount > 0 && selectedSiteIds.size === uniqueSiteCount
                ? 'Deselect all'
                : 'Select all'}
            </Button>
            <span class="daily-tasks-bulk-actions__spacer" />
            <Button
              size="small"
              variant="secondary"
              pending={bulkPending === 'open'}
              disabled={selectedSiteIds.size === 0 || bulkPending === 'category'}
              leadingIcon={<ExternalLinkIcon size={15} />}
              onClick={() => void openSelectedSites()}
            >
              Open sites
            </Button>
            <Button
              size="small"
              variant="primary"
              disabled={selectedSiteIds.size === 0 || bulkPending !== null}
              leadingIcon={<TasksIcon size={15} />}
              onClick={() => setCategoryMembershipOpen(true)}
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

        {checkinStatus ? (
          <div class="daily-tasks-checkin-progress" role="status" aria-live="polite">
            <span class="ui-spinner" aria-hidden="true" />
            <span>{checkinStatus}</span>
          </div>
        ) : null}

        {feedback ? (
          <div
            key={feedback.id}
            class={`daily-tasks-feedback daily-tasks-feedback--${feedback.tone}`}
            role={feedback.tone === 'danger' ? 'alert' : 'status'}
            aria-live={feedback.tone === 'danger' ? 'assertive' : 'polite'}
          >
            <div>
              <strong>{feedback.title}</strong>
              {feedback.message ? <span>{feedback.message}</span> : null}
            </div>
            <button type="button" aria-label="Dismiss message" onClick={() => setFeedback(null)}>
              ×
            </button>
          </div>
        ) : null}

        {sortedCategories.length ? (
          <div class="daily-tasks-grid">
            {sortedCategories.map((category) => (
              <TaskCategoryCard
                key={category.id}
                category={category}
                dailyState={dailyState}
                checkinState={checkinState}
                date={today}
                expanded={expandedCategoryIds.has(category.id)}
                pendingSiteIds={pendingSiteIds}
                openRemainingPending={pendingOpenCategoryIds.has(category.id)}
                checkinRunning={Boolean(checkinRunId)}
                selectionMode={selectionMode}
                selectedSiteIds={selectedSiteIds}
                onToggleExpanded={() => toggleExpanded(category.id)}
                onVisit={(site) => void visitSite(category, site)}
                onSetDone={(site, done) => void setCompletion(category, site, done)}
                onOpenRemaining={() => void openRemaining(category)}
                onCheckin={(site) => void startCheckin(site.id)}
                onToggleSelected={toggleSelectedSite}
                onEdit={() => openEditCategory(category)}
                onDelete={() => setDeleteCategory(category)}
              />
            ))}
          </div>
        ) : (
          <section class="daily-tasks-empty" aria-labelledby="daily-tasks-empty-title">
            <span aria-hidden="true">
              <TasksIcon size={38} />
            </span>
            <h2 id="daily-tasks-empty-title">Build your first daily workflow</h2>
            <p>
              Create a category manually, extract a public partnership page, or import partner links
              from a local .txt file.
            </p>
            <div>
              <Button
                variant="primary"
                leadingIcon={<PlusIcon size={16} />}
                onClick={openNewCategory}
              >
                New category
              </Button>
              <Button
                variant="secondary"
                leadingIcon={<ImportIcon size={16} />}
                onClick={() => setPartnerImportOpen(true)}
              >
                Import partner page
              </Button>
              <Button
                variant="secondary"
                leadingIcon={<ImportIcon size={16} />}
                onClick={() => setTextImportOpen(true)}
              >
                Import .txt
              </Button>
            </div>
          </section>
        )}
      </div>

      <BulkCategoryDialog
        open={categoryMembershipOpen}
        sites={selectedSites}
        categories={categories}
        pending={bulkPending === 'category'}
        onClose={() => setCategoryMembershipOpen(false)}
        onApply={(categoryIds, newCategoryName) =>
          void addSelectedToCategories(categoryIds, newCategoryName)
        }
      />

      <TaskCategoryDialog
        open={editorOpen}
        category={editorCategory}
        pending={editorPending}
        onClose={() => {
          if (!editorPending) {
            setEditorOpen(false);
            setEditorCategory(null);
          }
        }}
        onSave={saveCategory}
      />

      <PartnerImportDialog
        open={partnerImportOpen}
        categoryCount={categories.length}
        onClose={() => setPartnerImportOpen(false)}
        onImported={imported}
        onFeedback={showFeedback}
      />

      <TextFileImportDialog
        open={textImportOpen}
        categoryCount={categories.length}
        onClose={() => setTextImportOpen(false)}
        onImported={imported}
        onFeedback={showFeedback}
      />

      <Dialog
        open={deleteCategory !== null}
        title="Delete Daily Tasks category?"
        description="This removes the category, every site inside it, and all recorded Daily Task progress for that category."
        onClose={() => {
          if (!deletePending) setDeleteCategory(null);
        }}
        closeOnBackdrop={!deletePending}
        footer={
          <>
            <Button
              variant="quiet"
              onClick={() => setDeleteCategory(null)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              pending={deletePending}
              leadingIcon={<TrashIcon size={16} />}
              onClick={() => void confirmDelete()}
            >
              Delete category
            </Button>
          </>
        }
      >
        <p class="daily-tasks-delete-copy">
          <strong>{deleteCategory?.name}</strong> will be permanently removed from RefTrack.
        </p>
      </Dialog>
    </main>
  );
}

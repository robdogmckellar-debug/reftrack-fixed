import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type {
  RendererTaskCategory,
  RendererTaskSite,
} from '../../../shared/view-model/renderer-snapshot';
import { publishSnapshot, rendererSnapshot } from '../../app/store';
import { ImportIcon, PlusIcon, TasksIcon, TrashIcon } from '../../components/icons';
import { Button } from '../../design-system/Button';
import { Dialog } from '../../design-system/Dialog';
import { ToggleSwitch } from '../../design-system/ToggleSwitch';
import { errorMessage, unwrapIpcResult } from '../../lib/ipc-result';
import {
  categoryProgress,
  categoryStatus,
  globalTaskProgress,
  localTaskDateKey,
  sortTaskCategories,
  taskSiteDone,
} from './daily-tasks-model';
import { PartnerImportDialog } from './components/PartnerImportDialog';
import { TaskCategoryCard } from './components/TaskCategoryCard';
import { TaskCategoryDialog } from './components/TaskCategoryDialog';

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
  const [today, setToday] = useState(() => localTaskDateKey());
  const [autoSort, setAutoSort] = useState(true);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingSiteIds, setPendingSiteIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingOpenCategoryIds, setPendingOpenCategoryIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [editorCategory, setEditorCategory] = useState<RendererTaskCategory | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPending, setEditorPending] = useState(false);
  const [deleteCategory, setDeleteCategory] = useState<RendererTaskCategory | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackTimer = useRef<number | null>(null);

  const sortedCategories = useMemo(
    () => sortTaskCategories(categories, dailyState, today, autoSort),
    [autoSort, categories, dailyState, today],
  );
  const globalProgress = useMemo(
    () => globalTaskProgress(categories, dailyState, today),
    [categories, dailyState, today],
  );

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
    if (expandedCategoryIds.size > 0 || sortedCategories.length === 0) return;
    const preferred =
      sortedCategories.find(
        (category) =>
          categoryStatus(categoryProgress(category, dailyState, today)) === 'in-progress',
      ) ?? sortedCategories[0];
    if (preferred) setExpandedCategoryIds(new Set([preferred.id]));
  }, [dailyState, expandedCategoryIds.size, sortedCategories, today]);

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
            variant="secondary"
            leadingIcon={<ImportIcon size={16} />}
            onClick={() => setImportOpen(true)}
          >
            Import partner page
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
                date={today}
                expanded={expandedCategoryIds.has(category.id)}
                pendingSiteIds={pendingSiteIds}
                openRemainingPending={pendingOpenCategoryIds.has(category.id)}
                onToggleExpanded={() => toggleExpanded(category.id)}
                onVisit={(site) => void visitSite(category, site)}
                onSetDone={(site, done) => void setCompletion(category, site, done)}
                onOpenRemaining={() => void openRemaining(category)}
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
              Create a category manually or extract partner links from a public HTTPS partnership
              page.
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
                onClick={() => setImportOpen(true)}
              >
                Import partner page
              </Button>
            </div>
          </section>
        )}
      </div>

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
        open={importOpen}
        categoryCount={categories.length}
        onClose={() => setImportOpen(false)}
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

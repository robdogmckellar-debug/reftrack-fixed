import type { JSX } from 'preact';

import type {
  RendererCheckinDailyState,
  RendererCheckinResult,
  RendererTaskCategory,
  RendererTaskDailyState,
  RendererTaskSite,
} from '../../../../shared/view-model/renderer-snapshot';
import {
  CheckIcon,
  ChevronDownIcon,
  EditIcon,
  ExternalLinkIcon,
  RefreshIcon,
  TrashIcon,
} from '../../../components/icons';
import { Button } from '../../../design-system/Button';
import {
  categoryProgress,
  categoryStatus,
  checkinDailyResult,
  taskSiteDone,
} from '../daily-tasks-model';

interface TaskCategoryCardProps {
  category: RendererTaskCategory;
  dailyState: RendererTaskDailyState;
  checkinState: RendererCheckinDailyState;
  date: string;
  expanded: boolean;
  pendingSiteIds: ReadonlySet<string>;
  openRemainingPending: boolean;
  checkinRunning: boolean;
  selectionMode: boolean;
  selectedSiteIds: ReadonlySet<string>;
  onToggleExpanded(): void;
  onVisit(site: RendererTaskSite): void;
  onSetDone(site: RendererTaskSite, done: boolean): void;
  onOpenRemaining(): void;
  onCheckin(site: RendererTaskSite): void;
  onToggleSelected(site: RendererTaskSite, selected: boolean): void;
  onEdit(): void;
  onDelete(): void;
}

function checkinStatusLabel(result: RendererCheckinResult | null): string {
  if (!result) return 'Not checked in today';
  switch (result.status) {
    case 'success':
      return 'Checked in today';
    case 'failed':
      return result.message || 'Last check-in failed';
    case 'skipped':
      return result.message || 'Check-in skipped';
  }
}

function statusLabel(status: ReturnType<typeof categoryStatus>): string {
  switch (status) {
    case 'complete':
      return 'Complete';
    case 'in-progress':
      return 'In progress';
    case 'empty':
      return 'No sites';
    case 'not-started':
      return 'Not started';
  }
}

function siteHost(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function TaskCategoryCard({
  category,
  dailyState,
  checkinState,
  date,
  expanded,
  pendingSiteIds,
  openRemainingPending,
  checkinRunning,
  selectionMode,
  selectedSiteIds,
  onToggleExpanded,
  onVisit,
  onSetDone,
  onOpenRemaining,
  onCheckin,
  onToggleSelected,
  onEdit,
  onDelete,
}: TaskCategoryCardProps): JSX.Element {
  const progress = categoryProgress(category, dailyState, date);
  const status = categoryStatus(progress);
  const remainingWithUrl = category.sites.filter(
    (site) => !taskSiteDone(dailyState, date, category.id, site.id) && Boolean(site.url),
  );
  const titleId = `task-category-${category.id}-title`;
  const panelId = `task-category-${category.id}-sites`;

  return (
    <article
      class={`task-category-card task-category-card--${status}`}
      data-colour={category.colour}
      aria-labelledby={titleId}
    >
      <span class="task-category-card__accent" aria-hidden="true" />

      <header class="task-category-card__header">
        <button
          type="button"
          class="task-category-card__disclosure"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggleExpanded}
        >
          <span class="task-category-card__status-dot" aria-hidden="true" />
          <span class="task-category-card__heading">
            <strong id={titleId}>{category.name}</strong>
            <span>{statusLabel(status)}</span>
          </span>
          <span class="task-category-card__count">
            {progress.done}/{progress.total}
          </span>
          <ChevronDownIcon
            size={18}
            class={`task-category-card__chevron${expanded ? ' is-expanded' : ''}`}
          />
        </button>

        <div class="task-category-card__management" aria-label={`${category.name} management`}>
          <button type="button" aria-label={`Edit ${category.name}`} onClick={onEdit}>
            <EditIcon size={16} />
          </button>
          <button
            type="button"
            class="is-danger"
            aria-label={`Delete ${category.name}`}
            onClick={onDelete}
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </header>

      <div
        class="task-category-card__progress"
        role="progressbar"
        aria-label={`${category.name}: ${progress.done} of ${progress.total} complete`}
        aria-valuemin={0}
        aria-valuemax={progress.total || 1}
        aria-valuenow={progress.done}
      >
        <span style={{ width: `${progress.percent}%` }} />
      </div>

      {!expanded ? (
        <div class="task-category-card__preview" aria-hidden="true">
          {category.sites.length ? (
            <>
              {category.sites.slice(0, 4).map((site) => (
                <span
                  key={site.id}
                  class={taskSiteDone(dailyState, date, category.id, site.id) ? 'is-done' : ''}
                >
                  {site.name}
                </span>
              ))}
              {category.sites.length > 4 ? <em>+{category.sites.length - 4} more</em> : null}
            </>
          ) : (
            <em>No sites configured</em>
          )}
        </div>
      ) : null}

      <div id={panelId} class="task-category-card__sites" hidden={!expanded}>
        {category.sites.length ? (
          <ul aria-label={`${category.name} sites`}>
            {category.sites.map((site) => {
              const done = taskSiteDone(dailyState, date, category.id, site.id);
              const pending = pendingSiteIds.has(site.id);
              const host = siteHost(site.url);

              return (
                <li
                  key={site.id}
                  class={`${done ? 'is-done' : ''}${selectedSiteIds.has(site.id) ? ' is-selected' : ''}`}
                >
                  {selectionMode ? (
                    <label class="task-site-select">
                      <input
                        type="checkbox"
                        checked={selectedSiteIds.has(site.id)}
                        aria-label={`Select ${site.name}`}
                        onChange={(event) => onToggleSelected(site, event.currentTarget.checked)}
                      />
                      <span aria-hidden="true">
                        {selectedSiteIds.has(site.id) ? <CheckIcon size={15} /> : null}
                      </span>
                    </label>
                  ) : (
                    <label class="task-site-check">
                      <input
                        type="checkbox"
                        checked={done}
                        disabled={pending || openRemainingPending}
                        aria-label={`Mark ${site.name} ${done ? 'not complete' : 'complete'}`}
                        onChange={(event) => onSetDone(site, event.currentTarget.checked)}
                      />
                      <span aria-hidden="true">{done ? <CheckIcon size={15} /> : null}</span>
                    </label>
                  )}

                  <div class="task-site-copy">
                    <strong>{site.name}</strong>
                    <span>{host ?? (site.url ? 'Invalid URL' : 'No URL configured')}</span>
                  </div>

                  <Button
                    size="small"
                    variant={done ? 'quiet' : 'secondary'}
                    pending={pending}
                    disabled={!site.url || openRemainingPending}
                    leadingIcon={<ExternalLinkIcon size={15} />}
                    aria-label={`${done ? 'Open again' : 'Visit'} ${site.name}`}
                    onClick={() => onVisit(site)}
                  >
                    {done ? 'Open again' : 'Visit'}
                  </Button>

                  {site.checkin?.enabled ? (
                    <div class="task-site-checkin">
                      <span
                        class={`task-site-checkin__status is-${checkinDailyResult(checkinState, date, site.id)?.status ?? 'idle'}`}
                      >
                        {checkinStatusLabel(checkinDailyResult(checkinState, date, site.id))}
                      </span>
                      <Button
                        size="small"
                        variant="quiet"
                        disabled={checkinRunning || !site.url}
                        leadingIcon={<RefreshIcon size={15} />}
                        aria-label={`Run automatic check-in for ${site.name}`}
                        onClick={() => onCheckin(site)}
                      >
                        Check in
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div class="task-category-card__empty-sites">
            <p>No sites are configured in this category.</p>
            <Button
              size="small"
              variant="quiet"
              leadingIcon={<EditIcon size={15} />}
              onClick={onEdit}
            >
              Add sites
            </Button>
          </div>
        )}

        {category.sites.length > 1 ? (
          <footer class="task-category-card__footer">
            <span>
              {remainingWithUrl.length === 0
                ? 'Every linked site is complete.'
                : `${remainingWithUrl.length} linked site${remainingWithUrl.length === 1 ? '' : 's'} remaining`}
            </span>
            <Button
              size="small"
              variant="primary"
              pending={openRemainingPending}
              disabled={remainingWithUrl.length === 0}
              leadingIcon={<ExternalLinkIcon size={15} />}
              onClick={onOpenRemaining}
            >
              Open remaining
            </Button>
          </footer>
        ) : null}
      </div>
    </article>
  );
}

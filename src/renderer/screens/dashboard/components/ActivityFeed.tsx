import type { JSX } from 'preact';

import type { RendererActivityEntry } from '../../../../shared/view-model/renderer-snapshot';
import { ActivityIcon, ClipboardIcon, SuccessIcon, TrashIcon } from '../../../components/icons';
import { Button } from '../../../design-system/Button';
import { activityClearPending, dashboardActivity } from '../dashboard-store';

interface ActivityFeedProps {
  onClear(): void;
}

function localDateKey(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatOccurredAt(value: string, now = new Date()): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';

  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  const today = localDateKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const dateKey = localDateKey(date);

  if (dateKey === today) return `Today, ${time}`;
  if (dateKey === localDateKey(yesterdayDate)) return `Yesterday, ${time}`;

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function activityDescription(entry: RendererActivityEntry): JSX.Element {
  switch (entry.type) {
    case 'copy':
      return (
        <>
          Copied <strong>{entry.siteName}</strong>
        </>
      );
    case 'success':
      return (
        <>
          Success on <strong>{entry.siteName}</strong>
          {entry.amount === null ? null : (
            <span class="dashboard-activity__amount">+${entry.amount.toFixed(2)}</span>
          )}
        </>
      );
    case 'delete':
      return (
        <>
          Deleted <strong>{entry.siteName}</strong>
        </>
      );
  }
}

function ActivityEntry({ entry }: { entry: RendererActivityEntry }): JSX.Element {
  const Icon =
    entry.type === 'copy' ? ClipboardIcon : entry.type === 'success' ? SuccessIcon : TrashIcon;

  return (
    <li class={`dashboard-activity__item dashboard-activity__item--${entry.type}`}>
      <span class="dashboard-activity__entry-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span class="dashboard-activity__entry-copy">
        <span class="dashboard-activity__description">{activityDescription(entry)}</span>
        <time class="dashboard-activity__time" dateTime={entry.occurredAt}>
          {formatOccurredAt(entry.occurredAt)}
        </time>
      </span>
    </li>
  );
}

export function ActivityFeed({ onClear }: ActivityFeedProps): JSX.Element {
  const activity = dashboardActivity.value;
  const pending = activityClearPending.value;

  return (
    <aside class="dashboard-activity" aria-labelledby="dashboard-activity-title">
      <header class="dashboard-panel-header">
        <div>
          <span class="dashboard-panel-header__eyebrow">Recent events</span>
          <h2 id="dashboard-activity-title">
            <ActivityIcon size={18} />
            Activity
          </h2>
        </div>
        <Button
          variant="quiet"
          size="small"
          disabled={activity.length === 0}
          pending={pending}
          leadingIcon={<TrashIcon size={15} />}
          onClick={onClear}
        >
          Clear
        </Button>
      </header>

      {activity.length === 0 ? (
        <div class="dashboard-activity__empty">
          <ActivityIcon size={28} />
          <strong>No activity yet</strong>
          <span>Copied links and recorded successes will appear here.</span>
        </div>
      ) : (
        <ol class="dashboard-activity__list" aria-label="Recent RefTrack activity">
          {activity.map((entry) => (
            <ActivityEntry key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </aside>
  );
}

import type { JSX } from 'preact';

import { CheckIcon, ClipboardIcon, ExternalLinkIcon, SuccessIcon } from '../../../components/icons';
import { Button } from '../../../design-system/Button';
import { formatCurrency } from '../../../lib/format';
import {
  dailySignalFor,
  pendingCopySiteIds,
  pendingSuccessSiteIds,
  siteSignalFor,
  siteStreakFor,
} from '../dashboard-store';

interface SiteCardProps {
  siteId: string;
  onCopy(siteId: string): void;
  onSuccess(siteId: string): void;
  onOpen(url: string): void;
}

export function SiteCard({ siteId, onCopy, onSuccess, onOpen }: SiteCardProps): JSX.Element | null {
  const site = siteSignalFor(siteId).value;
  const today = dailySignalFor(siteId).value;
  const copyPending = pendingCopySiteIds.value.has(siteId);
  const successPending = pendingSuccessSiteIds.value.has(siteId);
  if (!site) return null;

  const maximum = site.maxCopiesPerDay;
  const limited = maximum > 0;
  const complete = limited && today.copies >= maximum;
  const progress = limited ? Math.min(100, (today.copies / maximum) * 100) : 0;
  const streak = siteStreakFor(siteId);
  const inProgress = !complete && today.copies > 0;
  const missingUrl = !site.url;
  const status = missingUrl
    ? 'Referral URL required'
    : complete
      ? 'Complete today'
      : limited && inProgress
        ? `${today.copies} of ${maximum} copied`
        : maximum === 0
          ? `${today.copies} copied today`
          : 'Ready to copy';
  const statusClass = missingUrl
    ? ' is-missing'
    : complete
      ? ' is-complete'
      : inProgress
        ? ' is-progress'
        : '';

  return (
    <article
      class={`dashboard-site-card${complete ? ' dashboard-site-card--complete' : ''}`}
      aria-labelledby={`dashboard-site-${site.id}`}
    >
      <header class="dashboard-site-card__header">
        <div class="dashboard-site-card__identity">
          {site.url ? (
            <button
              id={`dashboard-site-${site.id}`}
              type="button"
              class="dashboard-site-card__name dashboard-site-card__name--link"
              title={`Open ${site.name} in your default browser`}
              onClick={() => onOpen(site.url)}
            >
              <span>{site.name}</span>
              <ExternalLinkIcon size={14} />
            </button>
          ) : (
            <h3 id={`dashboard-site-${site.id}`} class="dashboard-site-card__name">
              {site.name}
            </h3>
          )}
          <span class={`dashboard-site-card__status${statusClass}`}>
            <span class="dashboard-site-card__status-dot" aria-hidden="true" />
            {status}
          </span>
        </div>

        {streak >= 2 ? (
          <span class="dashboard-site-card__streak" aria-label={`${streak} day copy streak`}>
            <span aria-hidden="true">🔥</span>
            {streak}
          </span>
        ) : null}
      </header>

      <dl class="dashboard-site-card__metrics">
        <div>
          <dt>Total copies</dt>
          <dd>{site.copies}</dd>
        </div>
        <div>
          <dt>Successes</dt>
          <dd>{site.successes}</dd>
        </div>
        <div class="dashboard-site-card__earnings">
          <dt>Total earnings</dt>
          <dd>{formatCurrency(site.earnings)}</dd>
        </div>
      </dl>

      {limited ? (
        <div class="dashboard-site-card__progress">
          <div class="dashboard-site-card__progress-copy">
            <span>Daily copy progress</span>
            <strong>
              {Math.min(today.copies, maximum)} / {maximum}
            </strong>
          </div>
          <div
            class="dashboard-site-card__progress-track"
            role="progressbar"
            aria-label={`${site.name} daily copy progress`}
            aria-valuemin={0}
            aria-valuemax={maximum}
            aria-valuenow={Math.min(today.copies, maximum)}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <div class="dashboard-site-card__unlimited">
          Unlimited daily copies · {today.copies} today
        </div>
      )}

      <div class="dashboard-site-card__actions">
        <Button
          class="dashboard-site-card__copy"
          variant={complete ? 'quiet' : 'secondary'}
          pending={copyPending}
          disabled={complete || !site.url}
          leadingIcon={complete ? <CheckIcon size={16} /> : <ClipboardIcon size={16} />}
          title={!site.url ? 'Add a referral URL in Site Editor before copying' : undefined}
          onClick={() => onCopy(site.id)}
        >
          {complete ? 'Complete today' : 'Copy link'}
        </Button>
        <Button
          class="dashboard-site-card__success"
          variant="secondary"
          pending={successPending}
          leadingIcon={<SuccessIcon size={16} />}
          onClick={() => onSuccess(site.id)}
        >
          Record {formatCurrency(site.bonus)}
        </Button>
      </div>
    </article>
  );
}

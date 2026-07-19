import type { JSX } from 'preact';

import type { RendererSite } from '../../../../shared/view-model/renderer-snapshot';
import { EditIcon } from '../../../components/icons';
import { Button } from '../../../design-system/Button';
import { formatCurrency } from '../../../lib/format';

interface SiteListProps {
  sites: readonly RendererSite[];
  selectedSiteId: string | null;
  creating: boolean;
  lifecycle: 'active' | 'archived' | 'trashed';
  counts: Record<'active' | 'archived' | 'trashed', number>;
  onCreate(): boolean;
  onSelect(siteId: string): boolean;
  onLifecycleChange(lifecycle: 'active' | 'archived' | 'trashed'): void;
}

function copyLimitLabel(limit: number): string {
  if (limit === 0) return 'Unlimited copies';
  return `${limit} cop${limit === 1 ? 'y' : 'ies'} per day`;
}

export function SiteList({
  sites,
  selectedSiteId,
  creating,
  lifecycle,
  counts,
  onCreate,
  onSelect,
  onLifecycleChange,
}: SiteListProps): JSX.Element {
  const handleKeyDown = (
    event: JSX.TargetedKeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowDown':
        nextIndex = Math.min(index + 1, sites.length - 1);
        break;
      case 'ArrowUp':
        nextIndex = Math.max(index - 1, 0);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = sites.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const target = sites[nextIndex];
    if (!target || !onSelect(target.id)) return;
    queueMicrotask(() => document.getElementById(`site-editor-option-${target.id}`)?.focus());
  };

  return (
    <aside class="site-editor-list-panel" aria-label="Referral sites">
      <header class="site-editor-list-panel__header">
        <div>
          <span class="site-editor-eyebrow">Site library</span>
          <h1>Referral sites</h1>
          <p>{sites.length} shown</p>
        </div>
        <Button
          variant="primary"
          size="small"
          class="site-editor-add-button"
          onClick={() => onCreate()}
        >
          Add site
        </Button>
      </header>

      <div class="site-editor-lifecycle-tabs" role="tablist" aria-label="Site status">
        {(
          [
            ['active', 'Active'],
            ['archived', 'Archived'],
            ['trashed', 'Recycle bin'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={lifecycle === value}
            class={lifecycle === value ? 'is-selected' : ''}
            onClick={() => onLifecycleChange(value)}
          >
            <span>{label}</span>
            <strong>{counts[value]}</strong>
          </button>
        ))}
      </div>

      {creating ? (
        <div class="site-editor-new-indicator" role="status">
          <span aria-hidden="true">+</span>
          <span>Creating a new site</span>
        </div>
      ) : null}

      {sites.length ? (
        <div class="site-editor-site-list" role="listbox" aria-label="Configured sites">
          {sites.map((site, index) => {
            const selected = !creating && site.id === selectedSiteId;
            return (
              <button
                key={site.id}
                id={`site-editor-option-${site.id}`}
                class={`site-editor-site-option${selected ? ' is-selected' : ''}`}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={selected || (selectedSiteId === null && index === 0) ? 0 : -1}
                onClick={() => onSelect(site.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <span class="site-editor-site-option__icon" aria-hidden="true">
                  <EditIcon size={16} />
                </span>
                <span class="site-editor-site-option__copy">
                  <span class="site-editor-site-option__name">{site.name}</span>
                  <span class="site-editor-site-option__meta">
                    {formatCurrency(site.bonus)} bonus · {copyLimitLabel(site.maxCopiesPerDay)}
                  </span>
                  <span class="site-editor-site-option__stats">
                    {site.copies} total cop{site.copies === 1 ? 'y' : 'ies'} · {site.successes}{' '}
                    success{site.successes === 1 ? '' : 'es'}
                  </span>
                </span>
                <span class={`site-editor-site-option__link-state${site.url ? '' : ' is-missing'}`}>
                  {site.url ? 'Ready' : 'No URL'}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div class="site-editor-list-empty">
          <EditIcon size={28} />
          <strong>{lifecycle === 'active' ? 'No active sites' : `No ${lifecycle} sites`}</strong>
          <p>
            {lifecycle === 'active'
              ? 'Add your first referral site to make it available on the Dashboard.'
              : lifecycle === 'archived'
                ? 'Archived sites stay here until you restore or recycle them.'
                : 'Deleted sites stay recoverable until you remove them forever.'}
          </p>
          {lifecycle === 'active' ? (
            <Button variant="primary" onClick={() => onCreate()}>
              Add first site
            </Button>
          ) : null}
        </div>
      )}
    </aside>
  );
}

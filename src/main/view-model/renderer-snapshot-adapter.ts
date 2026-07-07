import type { AppStateV1 } from '../../domain/app-state';
import { centsToDollars } from '../../domain/money/money';
import { calculateLifetimeTotals, calculateSiteTotals } from '../../domain/selectors/statistics';
import type { RendererSnapshot } from '../../shared/view-model/renderer-snapshot';

export function toRendererSnapshot(state: AppStateV1): RendererSnapshot {
  const lifetime = calculateLifetimeTotals(state);

  return {
    revision: state.revision,
    sites: state.sites.map((site) => {
      const totals = calculateSiteTotals(state, site.id);
      return {
        id: site.id,
        name: site.name,
        url: site.url,
        prefix: site.prefix,
        suffix: site.suffix,
        dateFormat: site.dateFormat,
        bonus: centsToDollars(site.bonusCents),
        maxCopiesPerDay: site.maxCopiesPerDay,
        copies: totals.copies,
        successes: totals.successes,
        earnings: centsToDollars(totals.earningsCents),
      };
    }),
    dailyState: Object.fromEntries(
      Object.entries(state.dailyRecords).map(([date, day]) => [
        date,
        Object.fromEntries(
          Object.entries(day).map(([siteId, metrics]) => [
            siteId,
            {
              copies: metrics.copies,
              successes: metrics.successes,
              earnings: centsToDollars(metrics.earningsCents),
            },
          ]),
        ),
      ]),
    ),
    activity: state.activity.map((entry) => {
      const occurredAt = new Date(entry.occurredAt);
      return {
        id: entry.id,
        occurredAt: entry.occurredAt,
        time: formatLocalTime(occurredAt),
        type: entry.type,
        siteId: entry.siteId,
        siteName: entry.siteName,
        amount: entry.amountCents === null ? null : centsToDollars(entry.amountCents),
        ts: occurredAt.getTime(),
      };
    }),
    lifetimeEarnings: centsToDollars(lifetime.earningsCents),
    lifetimeSuccesses: lifetime.successes,
    settings: {
      darkMode: state.settings.darkMode,
      folderClearEnabled: state.settings.imageCleaner.enabled,
      folderClearPath: state.settings.imageCleaner.folderPath,
      hotkeys: {
        enabled: state.settings.hotkeys.enabled,
        bindings: state.settings.hotkeys.bindings.map((binding) => ({
          siteId: binding.siteId,
          key: binding.key,
        })),
      },
    },
    tasks: {
      categories: structuredClone(state.taskCategories),
    },
    tasksDailyState: structuredClone(state.taskDailyRecords),
  };
}

function formatLocalTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

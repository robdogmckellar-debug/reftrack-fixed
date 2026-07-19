import type { AppStateV1 } from '../../domain/app-state';
import { centsToDollars } from '../../domain/money/money';
import { calculateTotalsIndex } from '../../domain/selectors/statistics';
import type { RendererSnapshot } from '../../shared/view-model/renderer-snapshot';

export function toRendererSnapshot(state: AppStateV1): RendererSnapshot {
  const totalsIndex = calculateTotalsIndex(state);
  const lifetime = totalsIndex.lifetime;

  return {
    revision: state.revision,
    sites: state.sites.map((site) => {
      const totals = totalsIndex.bySiteId.get(site.id) ?? {
        copies: 0,
        successes: 0,
        earningsCents: 0,
      };
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
        notes: site.notes ?? '',
        lifecycle: site.lifecycle ?? 'active',
        lifecycleChangedAt: site.lifecycleChangedAt ?? null,
        payoutThreshold: centsToDollars(site.payoutThresholdCents ?? 0),
        appClaim: {
          enabled: site.appClaim?.enabled ?? false,
          downloadUrl: site.appClaim?.downloadUrl ?? '',
          apkPath: site.appClaim?.apkPath ?? null,
          packageName: site.appClaim?.packageName ?? '',
          deepLinkUrl: site.appClaim?.deepLinkUrl ?? '',
          avdName: site.appClaim?.avdName ?? '',
        },
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
      folderClearHotkey: state.settings.imageCleaner.hotkey,
      imageCompressorEnabled: state.settings.imageCompressor.enabled,
      imageCompressorPath: state.settings.imageCompressor.folderPath,
      imageCompressorQuality: state.settings.imageCompressor.quality,
      facebookGroupShares: state.settings.facebookGroupShares.groups.map((group) => ({
        id: group.id,
        label: group.label,
        groupUrl: group.groupUrl,
        currentPostUrl: group.currentPostUrl,
        useMostRecentPost: group.useMostRecentPost,
      })),
      checkinSchedule: {
        enabled: state.settings.checkin.scheduleEnabled,
        time: state.settings.checkin.scheduleTime,
        lastRunDate: state.settings.checkin.lastScheduledRunDate,
      },
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
    checkinDailyState: structuredClone(state.checkinDailyRecords),
    payouts: (state.payouts ?? []).map((payout) => ({
      id: payout.id,
      siteId: payout.siteId,
      amount: centsToDollars(payout.amountCents),
      expectedDate: payout.expectedDate,
      paidAt: payout.paidAt,
      createdAt: payout.createdAt,
      note: payout.note,
    })),
  };
}

function formatLocalTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

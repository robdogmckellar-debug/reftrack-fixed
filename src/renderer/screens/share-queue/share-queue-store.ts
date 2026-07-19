import { batch, computed, signal } from '@preact/signals';

import type {
  RendererFacebookGroupShare,
  RendererSite,
  RendererTaskSite,
} from '../../../shared/view-model/renderer-snapshot';
import { buildReferralText } from '../../../shared/referral/referral-text';

export type ShareQueueStatus = 'queued' | 'posted' | 'skipped';

export interface ShareQueueItem {
  id: string;
  siteId: string | null;
  name: string;
  siteUrl: string;
  groupUrl: string | null;
  groupLabel: string | null;
  groupPostUrl: string | null;
  groupUseMostRecentPost: boolean;
  text: string;
  imagePath: string | null;
  source: 'dashboard' | 'daily-tasks';
  status: ShareQueueStatus;
  addedAt: string;
  completedAt: string | null;
}

export const shareQueueItems = signal<ShareQueueItem[]>([]);
export const activeShareQueueItemId = signal<string | null>(null);

export const queuedShareItems = computed(() =>
  shareQueueItems.value.filter((item) => item.status === 'queued'),
);

export const completedShareItems = computed(() =>
  shareQueueItems.value.filter((item) => item.status !== 'queued'),
);

export const activeShareQueueItem = computed(() => {
  const activeId = activeShareQueueItemId.value;
  const items = shareQueueItems.value;
  let firstQueued: ShareQueueItem | null = null;
  for (const item of items) {
    if (item.status !== 'queued') continue;
    if (item.id === activeId) return item;
    firstQueued ??= item;
  }
  return firstQueued;
});

export function queueReferralSites(sites: readonly RendererSite[]): number {
  const now = new Date();
  const entries = sites
    .filter((site) => site.url)
    .map((site) => ({
      siteId: site.id,
      name: site.name,
      siteUrl: site.url,
      groupUrl: null,
      groupLabel: null,
      groupPostUrl: null,
      groupUseMostRecentPost: false,
      text: buildReferralText(
        {
          prefix: site.prefix,
          url: site.url,
          dateFormat: site.dateFormat,
          suffix: site.suffix,
        },
        now,
      ),
      imagePath: null,
      source: 'dashboard' as const,
    }));
  return appendQueueEntries(entries);
}

export function queueTaskSites(
  sites: readonly RendererTaskSite[],
  referralSites: readonly RendererSite[],
): number {
  const referralById = new Map(referralSites.map((site) => [site.id, site]));
  const now = new Date();
  const entries = sites
    .filter((site) => site.url)
    .map((site) => {
      const referral = site.sourceSiteId ? referralById.get(site.sourceSiteId) : undefined;
      return {
        siteId: referral?.id ?? null,
        name: site.name,
        siteUrl: site.url,
        groupUrl: null,
        groupLabel: null,
        groupPostUrl: null,
        groupUseMostRecentPost: false,
        text: referral
          ? buildReferralText(
              {
                prefix: referral.prefix,
                url: site.url,
                dateFormat: referral.dateFormat,
                suffix: referral.suffix,
              },
              now,
            )
          : site.url,
        imagePath: null,
        source: 'daily-tasks' as const,
      };
    });
  return appendQueueEntries(entries);
}

export function updateShareQueueText(itemId: string, text: string): void {
  shareQueueItems.value = shareQueueItems.value.map((item) =>
    item.id === itemId ? { ...item, text } : item,
  );
}

export function updateShareQueueImage(itemId: string, imagePath: string | null): void {
  shareQueueItems.value = shareQueueItems.value.map((item) =>
    item.id === itemId ? { ...item, imagePath } : item,
  );
}

export function addShareQueueGroups(itemId: string, groupUrls: readonly string[]): number {
  return addShareQueueGroupDestinations(
    itemId,
    groupUrls.map((groupUrl) => ({
      groupUrl,
      groupLabel: null,
      groupPostUrl: null,
      groupUseMostRecentPost: false,
    })),
  );
}

export function addShareQueueFacebookGroups(
  itemId: string,
  groups: readonly RendererFacebookGroupShare[],
): number {
  return addShareQueueGroupDestinations(
    itemId,
    groups.map((group) => ({
      groupUrl: group.groupUrl,
      groupLabel: group.label,
      groupPostUrl: group.currentPostUrl,
      groupUseMostRecentPost: group.useMostRecentPost,
    })),
  );
}

function addShareQueueGroupDestinations(
  itemId: string,
  destinations: readonly {
    groupUrl: string;
    groupLabel: string | null;
    groupPostUrl: string | null;
    groupUseMostRecentPost: boolean;
  }[],
): number {
  const currentItems = shareQueueItems.peek();
  const sourceIndex = currentItems.findIndex((item) => item.id === itemId);
  const source = currentItems[sourceIndex];
  if (!source) return 0;

  const normalisedDestinations = destinations
    .map((destination) => {
      const groupUrl = normaliseFacebookGroupUrl(destination.groupUrl);
      if (!groupUrl) return null;
      return {
        ...destination,
        groupUrl,
        groupLabel: destination.groupLabel ?? labelForGroupUrl(groupUrl),
      };
    })
    .filter((destination): destination is NonNullable<typeof destination> => !!destination);
  if (!normalisedDestinations.length) return 0;

  const now = new Date().toISOString();
  const existingKeys = new Set(
    currentItems.map((item) => `${item.source}:${item.siteUrl}:${item.groupUrl ?? 'material'}`),
  );
  const nextItems = [...currentItems];
  let added = 0;

  for (const destination of normalisedDestinations) {
    const { groupUrl } = destination;
    const key = `${source.source}:${source.siteUrl}:${groupUrl}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);

    const next: ShareQueueItem = {
      ...source,
      id: globalThis.crypto?.randomUUID?.() ?? `share_${Date.now()}_${Math.random()}`,
      groupUrl,
      groupLabel: destination.groupLabel,
      groupPostUrl: destination.groupPostUrl,
      groupUseMostRecentPost: destination.groupUseMostRecentPost,
      status: 'queued',
      addedAt: now,
      completedAt: null,
    };

    if (source.groupUrl === null && added === 0) {
      if (sourceIndex >= 0)
        nextItems[sourceIndex] = { ...next, id: source.id, addedAt: source.addedAt };
      else nextItems.push(next);
    } else {
      nextItems.push(next);
    }
    added += 1;
  }

  if (added > 0) shareQueueItems.value = nextItems;
  return added;
}

export function setShareQueueStatus(itemId: string, status: ShareQueueStatus): void {
  const completedAt = status === 'queued' ? null : new Date().toISOString();
  batch(() => {
    shareQueueItems.value = shareQueueItems.value.map((item) =>
      item.id === itemId ? { ...item, status, completedAt } : item,
    );
    if (activeShareQueueItemId.value === itemId) activeShareQueueItemId.value = null;
  });
}

export function removeShareQueueItem(itemId: string): void {
  batch(() => {
    shareQueueItems.value = shareQueueItems.value.filter((item) => item.id !== itemId);
    if (activeShareQueueItemId.value === itemId) activeShareQueueItemId.value = null;
  });
}

export function clearCompletedShareQueueItems(): void {
  shareQueueItems.value = shareQueueItems.value.filter((item) => item.status === 'queued');
}

export function clearShareQueue(): void {
  batch(() => {
    shareQueueItems.value = [];
    activeShareQueueItemId.value = null;
  });
}

export function extractFacebookGroupUrls(input: string): string[] {
  const matches = input.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return [...new Set(matches.map(normaliseFacebookGroupUrl).filter((url): url is string => !!url))];
}

function appendQueueEntries(
  entries: readonly Pick<
    ShareQueueItem,
    | 'siteId'
    | 'name'
    | 'siteUrl'
    | 'groupUrl'
    | 'groupLabel'
    | 'groupPostUrl'
    | 'groupUseMostRecentPost'
    | 'text'
    | 'imagePath'
    | 'source'
  >[],
): number {
  if (!entries.length) return 0;

  const now = new Date().toISOString();
  const currentItems = shareQueueItems.peek();
  const existingKeys = new Set(
    currentItems.map(
      (item) => `${item.status}:${item.source}:${item.siteUrl}:${item.groupUrl ?? 'material'}`,
    ),
  );
  const nextEntries: ShareQueueItem[] = [];

  for (const entry of entries) {
    const key = `queued:${entry.source}:${entry.siteUrl}:${entry.groupUrl ?? 'material'}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    nextEntries.push({
      ...entry,
      id: globalThis.crypto?.randomUUID?.() ?? `share_${Date.now()}_${Math.random()}`,
      status: 'queued',
      addedAt: now,
      completedAt: null,
    });
  }

  if (!nextEntries.length) return 0;

  batch(() => {
    shareQueueItems.value = [...currentItems, ...nextEntries];
    activeShareQueueItemId.value ??= nextEntries[0]?.id ?? null;
  });

  return nextEntries.length;
}

function normaliseFacebookGroupUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim().replace(/[),.;\]]+$/, ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!/(^|\.)facebook\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const groupIndex = parts.findIndex((part) => part.toLowerCase() === 'groups');
    const groupId = groupIndex >= 0 ? parts[groupIndex + 1] : null;
    if (!groupId) return null;
    return `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/`;
  } catch {
    return null;
  }
}

function labelForGroupUrl(groupUrl: string): string {
  try {
    const parts = new URL(groupUrl).pathname.split('/').filter(Boolean);
    return parts[1] ? decodeURIComponent(parts[1]) : 'Facebook group';
  } catch {
    return 'Facebook group';
  }
}

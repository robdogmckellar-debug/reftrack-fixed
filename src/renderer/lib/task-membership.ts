import type {
  RendererSite,
  RendererTaskCategory,
  RendererTaskSite,
} from '../../shared/view-model/renderer-snapshot';

const CATEGORY_COLOURS: readonly RendererTaskCategory['colour'][] = [
  'teal',
  'purple',
  'green',
  'gold',
  'orange',
  'red',
  'blue',
  'pink',
];

export function createEntityId(prefix: string): string {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

export function newCategoryDetails(
  name: string,
  categoryCount: number,
): { id: string; name: string; colour: RendererTaskCategory['colour'] } {
  return {
    id: createEntityId('category'),
    name: name.trim(),
    colour: CATEGORY_COLOURS[categoryCount % CATEGORY_COLOURS.length] ?? 'teal',
  };
}

export function taskSiteFromReferralSite(
  site: RendererSite,
  categories: readonly RendererTaskCategory[],
): RendererTaskSite {
  const existing = categories
    .flatMap((category) => category.sites)
    .find((candidate) => candidate.sourceSiteId === site.id);

  return {
    ...(existing ?? {}),
    id: existing?.id ?? createEntityId('tasksite'),
    sourceSiteId: site.id,
    name: site.name,
    url: site.url,
  };
}

export function selectedTaskSites(
  categories: readonly RendererTaskCategory[],
  selectedSiteIds: ReadonlySet<string>,
): RendererTaskSite[] {
  const selected = new Map<string, RendererTaskSite>();
  for (const category of categories) {
    for (const site of category.sites) {
      if (selectedSiteIds.has(site.id) && !selected.has(site.id)) selected.set(site.id, site);
    }
  }
  return [...selected.values()];
}

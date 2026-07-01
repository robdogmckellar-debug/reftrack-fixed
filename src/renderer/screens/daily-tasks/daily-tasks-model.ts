import type {
  RendererTaskCategory,
  RendererTaskDailyState,
  RendererTaskSite,
} from '../../../shared/view-model/renderer-snapshot';

export type TaskCategoryStatus = 'empty' | 'not-started' | 'in-progress' | 'complete';

export interface TaskProgress {
  done: number;
  total: number;
  percent: number;
}

export interface TaskSiteValidationError {
  name?: string;
  url?: string;
}

export interface TaskCategoryValidationErrors {
  name?: string;
  sites: Record<string, TaskSiteValidationError>;
}

export function localTaskDateKey(date = new Date()): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function taskSiteDone(
  dailyState: RendererTaskDailyState,
  date: string,
  categoryId: string,
  siteId: string,
): boolean {
  return dailyState[date]?.[categoryId]?.[siteId] === true;
}

export function categoryProgress(
  category: RendererTaskCategory,
  dailyState: RendererTaskDailyState,
  date: string,
): TaskProgress {
  const total = category.sites.length;
  const done = category.sites.reduce(
    (count, site) => count + (taskSiteDone(dailyState, date, category.id, site.id) ? 1 : 0),
    0,
  );

  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function categoryStatus(progress: TaskProgress): TaskCategoryStatus {
  if (progress.total === 0) return 'empty';
  if (progress.done === 0) return 'not-started';
  if (progress.done >= progress.total) return 'complete';
  return 'in-progress';
}

export function globalTaskProgress(
  categories: readonly RendererTaskCategory[],
  dailyState: RendererTaskDailyState,
  date: string,
): TaskProgress {
  let done = 0;
  let total = 0;

  for (const category of categories) {
    const progress = categoryProgress(category, dailyState, date);
    done += progress.done;
    total += progress.total;
  }

  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

const STATUS_ORDER: Readonly<Record<TaskCategoryStatus, number>> = {
  'in-progress': 0,
  'not-started': 1,
  empty: 2,
  complete: 3,
};

export function sortTaskCategories(
  categories: readonly RendererTaskCategory[],
  dailyState: RendererTaskDailyState,
  date: string,
  autoSort: boolean,
): RendererTaskCategory[] {
  if (!autoSort) return [...categories];

  return categories
    .map((category, index) => ({
      category,
      index,
      status: categoryStatus(categoryProgress(category, dailyState, date)),
    }))
    .sort((left, right) => {
      const statusDifference = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (statusDifference !== 0) return statusDifference;
      return left.index - right.index;
    })
    .map(({ category }) => category);
}

export function isCredentialFreeHttpsUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function normaliseTaskUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return new URL(trimmed).href;
}

export function validateTaskCategory(
  name: string,
  sites: readonly RendererTaskSite[],
): TaskCategoryValidationErrors {
  const errors: TaskCategoryValidationErrors = { sites: {} };

  if (!name.trim()) errors.name = 'Enter a category name.';
  else if (name.trim().length > 100) errors.name = 'Use 100 characters or fewer.';

  for (const site of sites) {
    const siteName = site.name.trim();
    const siteUrl = site.url.trim();
    if (!siteName && !siteUrl) continue;

    const siteErrors: TaskSiteValidationError = {};
    if (!siteName) siteErrors.name = 'Enter a site name or remove this row.';
    else if (siteName.length > 100) siteErrors.name = 'Use 100 characters or fewer.';

    if (siteUrl.length > 2048) siteErrors.url = 'Use a URL shorter than 2,048 characters.';
    else if (siteUrl && !isCredentialFreeHttpsUrl(siteUrl)) {
      siteErrors.url = 'Use a complete credential-free HTTPS URL.';
    }

    if (siteErrors.name || siteErrors.url) errors.sites[site.id] = siteErrors;
  }

  return errors;
}

export function hasTaskCategoryErrors(errors: TaskCategoryValidationErrors): boolean {
  return Boolean(errors.name) || Object.keys(errors.sites).length > 0;
}

export function activeTaskSites(sites: readonly RendererTaskSite[]): RendererTaskSite[] {
  return sites
    .filter((site) => site.name.trim() || site.url.trim())
    .map((site) => ({
      id: site.id,
      name: site.name.trim(),
      url: normaliseTaskUrl(site.url),
    }));
}

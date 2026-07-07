export const TASK_COLOURS = [
  'teal',
  'purple',
  'green',
  'gold',
  'orange',
  'red',
  'blue',
  'pink',
] as const;

export type TaskColour = (typeof TASK_COLOURS)[number];
export type TaskCategoryId = string;
export type TaskSiteId = string;

/**
 * Opt-in automated check-in configuration for a Daily Tasks site. When
 * enabled, RefTrack derives the login and check-in URLs from the site's URL
 * origin (using optional per-site path overrides). Credentials are never stored
 * here; they live in the separate encrypted credential store.
 */
export interface TaskSiteCheckin {
  enabled: boolean;
  loginPath?: string | undefined;
  checkinPath?: string | undefined;
}

export interface TaskSite {
  id: TaskSiteId;
  name: string;
  url: string;
  checkin?: TaskSiteCheckin | undefined;
}

export interface TaskCategory {
  id: TaskCategoryId;
  name: string;
  colour: TaskColour;
  sites: TaskSite[];
}

export type TaskDailyCategoryState = Record<TaskSiteId, boolean>;
export type TaskDailyState = Record<TaskCategoryId, TaskDailyCategoryState>;
export type TaskDailyRecords = Record<string, TaskDailyState>;

export type CheckinResultStatus = 'success' | 'failed' | 'skipped';

export interface CheckinResultRecord {
  status: CheckinResultStatus;
  at: string;
  message?: string | undefined;
}

export type CheckinDailyState = Record<TaskSiteId, CheckinResultRecord>;
export type CheckinDailyRecords = Record<string, CheckinDailyState>;

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

export interface TaskSite {
  id: TaskSiteId;
  name: string;
  url: string;
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

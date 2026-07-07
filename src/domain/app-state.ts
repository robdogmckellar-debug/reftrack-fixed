import type { DailyRecords } from './entities/daily-metrics';
import type { ActivityEntry } from './entities/activity';
import type { AppSettings } from './entities/settings';
import type { Site } from './entities/site';
import type {
  CheckinDailyRecords,
  TaskCategory,
  TaskDailyRecords,
} from './entities/task-category';

export const APP_STATE_SCHEMA_VERSION = 1 as const;

export interface AppStateV1 {
  schemaVersion: typeof APP_STATE_SCHEMA_VERSION;
  revision: number;
  sites: Site[];
  dailyRecords: DailyRecords;
  activity: ActivityEntry[];
  settings: AppSettings;
  taskCategories: TaskCategory[];
  taskDailyRecords: TaskDailyRecords;
  checkinDailyRecords: CheckinDailyRecords;
}

export interface StateTotals {
  copies: number;
  successes: number;
  earningsCents: number;
}

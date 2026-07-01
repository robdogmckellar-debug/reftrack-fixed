export interface RendererSite {
  id: string;
  name: string;
  url: string;
  prefix: string;
  suffix: string;
  dateFormat: string;
  bonus: number;
  maxCopiesPerDay: number;
  copies: number;
  successes: number;
  earnings: number;
}

export interface RendererDailyMetrics {
  copies: number;
  successes: number;
  earnings: number;
}

export type RendererDailyState = Record<string, Record<string, RendererDailyMetrics>>;

export interface RendererActivityEntry {
  id: string;
  occurredAt: string;
  time: string;
  type: 'copy' | 'success' | 'delete';
  siteId: string | null;
  siteName: string;
  amount: number | null;
  ts: number;
}

export interface RendererSettings {
  darkMode: boolean;
  folderClearEnabled: boolean;
  folderClearPath: string | null;
}

export type RendererTaskColour =
  'teal' | 'purple' | 'green' | 'gold' | 'orange' | 'red' | 'blue' | 'pink';

export interface RendererTaskSite {
  id: string;
  name: string;
  url: string;
}

export interface RendererTaskCategory {
  id: string;
  name: string;
  colour: RendererTaskColour;
  sites: RendererTaskSite[];
}

export type RendererTaskDailyState = Record<string, Record<string, Record<string, boolean>>>;

/**
 * Transitional renderer read model. It preserves the current JavaScript UI's
 * property names while canonical state remains typed and main-process owned.
 */
export interface RendererSnapshot {
  revision: number;
  sites: RendererSite[];
  dailyState: RendererDailyState;
  activity: RendererActivityEntry[];
  lifetimeEarnings: number;
  lifetimeSuccesses: number;
  settings: RendererSettings;
  tasks: {
    categories: RendererTaskCategory[];
  };
  tasksDailyState: RendererTaskDailyState;
}

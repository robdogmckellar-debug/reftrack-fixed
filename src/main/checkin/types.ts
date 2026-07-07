import type { BrowserWindow } from 'electron';

import type { CredentialSecrets } from './credential-store';

export type CheckinStage =
  'starting' | 'logging-in' | 'dismissing-popup' | 'checking-in' | 'verifying';

export interface CheckinSelectors {
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  checkinButtonSelector: string;
  dismissSelector: string;
  successSelector: string;
}

export interface CheckinRunnerContext {
  runId: string;
  taskSiteId: string;
  siteName: string;
  loginUrl: string;
  checkinUrl: string;
  hostname: string;
  credentials: CredentialSecrets;
  selectors: CheckinSelectors;
  signal: AbortSignal;
  reportStage(stage: CheckinStage, message: string): void;
  onWindowCreated?(window: BrowserWindow): void;
}

export interface CheckinRunOutcome {
  status: 'success' | 'failed';
  message: string;
}

export type RunSiteCheckin = (context: CheckinRunnerContext) => Promise<CheckinRunOutcome>;

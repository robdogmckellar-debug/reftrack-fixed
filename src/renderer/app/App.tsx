import { useEffect } from 'preact/hooks';
import type { JSX } from 'preact';

import {
  bootFailure,
  bootstrapRenderer,
  bootStatus,
  activeScreen,
  resetRendererForRetry,
} from './store';
import { StorageRecoveryBanner } from '../components/StorageRecoveryBanner';
import { TitleBar } from '../components/TitleBar';
import { RefreshIcon } from '../components/icons';
import { Button } from '../design-system/Button';
import { Spinner } from '../design-system/Spinner';
import { StatusMessage } from '../design-system/StatusMessage';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { performCopy } from '../screens/dashboard/copy-action';
import { DailyTasksScreen } from '../screens/daily-tasks/DailyTasksScreen';
import { SiteEditorScreen } from '../screens/site-editor/SiteEditorScreen';
import { StatisticsScreen } from '../screens/statistics/StatisticsScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';

function LoadingScreen(): JSX.Element {
  return (
    <div class="startup-screen">
      <div class="startup-screen__brand" aria-hidden="true">
        RT
      </div>
      <Spinner label="Starting RefTrack" size="large" />
      <p>Preparing your local workspace…</p>
    </div>
  );
}

function FailureScreen({ message }: { message: string }): JSX.Element {
  const retry = (): void => {
    resetRendererForRetry();
    void bootstrapRenderer();
  };

  return (
    <div class="startup-screen">
      <StatusMessage title="RefTrack could not start" tone="danger">
        <p>{message}</p>
        <Button variant="primary" leadingIcon={<RefreshIcon size={16} />} onClick={retry}>
          Try again
        </Button>
      </StatusMessage>
    </div>
  );
}

export function App(): JSX.Element {
  const status = bootStatus.value;

  useEffect(() => {
    void bootstrapRenderer();
  }, []);

  useEffect(() => {
    return window.reftrack.hotkeys.onTriggered(({ siteId }) => {
      void performCopy(siteId);
    });
  }, []);

  if (status === 'idle' || status === 'loading') return <LoadingScreen />;
  if (status === 'failed') {
    return (
      <FailureScreen
        message={bootFailure.value?.message ?? 'The local data store was unavailable.'}
      />
    );
  }

  const screen = activeScreen.value;

  return (
    <div class="app-shell">
      <TitleBar />
      <StorageRecoveryBanner />
      <div class="app-workspace">
        <DashboardScreen active={screen === 'dashboard'} />
        <SiteEditorScreen active={screen === 'editor'} />
        <StatisticsScreen active={screen === 'statistics'} />
        <SettingsScreen active={screen === 'settings'} />
        <DailyTasksScreen active={screen === 'tasks'} />
      </div>
    </div>
  );
}

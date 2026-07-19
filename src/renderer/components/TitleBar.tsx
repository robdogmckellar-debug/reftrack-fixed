import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';

import { activeScreenTitle } from '../app/store';
import { LinkIcon, MinimizeToTrayIcon } from './icons';
import { AppClock } from './AppClock';
import { PrimaryNavigation } from './PrimaryNavigation';

export function TitleBar(): JSX.Element {
  const screenTitle = activeScreenTitle.value;

  useEffect(() => {
    document.title = `${screenTitle} · RefTrack`;
  }, [screenTitle]);

  const hideToTray = (): void => {
    void window.reftrack.window.hideToTray().catch(() => undefined);
  };

  return (
    <header class="app-titlebar">
      <div class="app-titlebar__available-area">
        <div class="app-brand" aria-label="RefTrack">
          <span class="app-brand__mark" aria-hidden="true">
            <LinkIcon size={18} />
          </span>
          <span class="app-brand__name">RefTrack</span>
        </div>

        <PrimaryNavigation />

        <div class="app-titlebar__meta">
          <span class="app-titlebar__screen-name">{screenTitle}</span>
          <AppClock />
          <button
            type="button"
            class="app-titlebar__window-button"
            title="Minimise to notification area"
            aria-label="Minimise to notification area"
            onClick={hideToTray}
          >
            <MinimizeToTrayIcon size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

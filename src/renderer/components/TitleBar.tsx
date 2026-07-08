import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';

import { activeScreenTitle } from '../app/store';
import { LinkIcon, MinimizeIcon } from './icons';
import { AppClock } from './AppClock';
import { PrimaryNavigation } from './PrimaryNavigation';

export function TitleBar(): JSX.Element {
  const screenTitle = activeScreenTitle.value;

  useEffect(() => {
    document.title = `${screenTitle} · RefTrack`;
  }, [screenTitle]);

  const minimize = (): void => {
    void window.reftrack.window.minimize().catch(() => undefined);
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
            title="Minimise to taskbar"
            aria-label="Minimise to taskbar"
            onClick={minimize}
          >
            <MinimizeIcon size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

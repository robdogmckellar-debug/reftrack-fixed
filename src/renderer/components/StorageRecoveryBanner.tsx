import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { storageStatus } from '../app/store';
import { ShieldIcon } from './icons';

interface BannerContent {
  tone: 'warning' | 'danger';
  title: string;
  message: string;
}

function bannerContent(source: 'backup' | 'default'): BannerContent {
  if (source === 'backup') {
    return {
      tone: 'warning',
      title: 'Recovered from backup',
      message:
        'Your main data file could not be read, so RefTrack restored the last saved backup. ' +
        'Very recent changes may be missing.',
    };
  }
  return {
    tone: 'danger',
    title: 'Started with fresh data',
    message:
      'RefTrack could not read your saved data or its backup, so it started fresh. ' +
      'Your previous file was set aside rather than deleted.',
  };
}

export function StorageRecoveryBanner(): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);
  const status = storageStatus.value;

  if (dismissed || !status || status.source === 'primary') return null;

  const content = bannerContent(status.source);

  return (
    <div class={`storage-recovery-banner storage-recovery-banner--${content.tone}`} role="alert">
      <span class="storage-recovery-banner__icon" aria-hidden="true">
        <ShieldIcon size={18} />
      </span>
      <div class="storage-recovery-banner__body">
        <strong>{content.title}</strong>
        <p>{content.message}</p>
        {status.archivedPath ? (
          <p class="storage-recovery-banner__path">
            Archived file: <code title={status.archivedPath}>{status.archivedPath}</code>
          </p>
        ) : null}
      </div>
      <button
        type="button"
        class="storage-recovery-banner__dismiss"
        aria-label="Dismiss recovery notice"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </div>
  );
}

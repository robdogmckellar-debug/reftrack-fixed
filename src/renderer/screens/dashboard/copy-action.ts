import type { ImageCleanupStart } from '../../../shared/ipc/contract';
import { publishSnapshot } from '../../app/store';
import { errorMessage, unwrapIpcResult } from '../../lib/ipc-result';
import { setCopyPending, siteSignalFor } from './dashboard-store';
import { buildReferralText } from './link-format';

export type CopyResult =
  | { status: 'skipped' }
  | { status: 'copied'; siteName: string; text: string; cleanup: ImageCleanupStart }
  | { status: 'error'; siteName: string; message: string };

/**
 * Core copy-link action shared by the dashboard button and the global hotkeys.
 * Writes the clipboard, records the copy, republishes the snapshot and fires the
 * OS notification. Callers decide how to surface in-app feedback.
 */
export async function performCopy(siteId: string): Promise<CopyResult> {
  const site = siteSignalFor(siteId).peek();
  if (!site || !site.url) return { status: 'skipped' };

  setCopyPending(siteId, true);
  const now = new Date();
  const text = buildReferralText(site, now);

  try {
    const response = unwrapIpcResult(
      await window.reftrack.actions.copyLink({
        siteId,
        text,
        occurredAt: now.toISOString(),
      }),
    );
    publishSnapshot(response.snapshot);

    void window.reftrack.notifications
      .showAction({ kind: 'copy', siteName: site.name, amountCents: null })
      .catch(() => undefined);

    return { status: 'copied', siteName: site.name, text, cleanup: response.cleanup };
  } catch (error) {
    return {
      status: 'error',
      siteName: site.name,
      message: errorMessage(error, 'The referral link could not be copied.'),
    };
  } finally {
    setCopyPending(siteId, false);
  }
}

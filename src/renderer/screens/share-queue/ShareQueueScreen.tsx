import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import { publishSnapshot, rendererSnapshot } from '../../app/store';
import {
  CheckIcon,
  ClipboardIcon,
  ExternalLinkIcon,
  LinkIcon,
  TrashIcon,
} from '../../components/icons';
import { Button } from '../../design-system/Button';
import { ToggleSwitch } from '../../design-system/ToggleSwitch';
import { errorMessage, unwrapIpcResult } from '../../lib/ipc-result';
import {
  activeShareQueueItem,
  activeShareQueueItemId,
  addShareQueueFacebookGroups,
  addShareQueueGroups,
  clearCompletedShareQueueItems,
  clearShareQueue,
  completedShareItems,
  extractFacebookGroupUrls,
  queuedShareItems,
  removeShareQueueItem,
  setShareQueueStatus,
  shareQueueItems,
  updateShareQueueImage,
  updateShareQueueText,
  type ShareQueueItem,
} from './share-queue-store';
import type { RendererFacebookGroupShare } from '../../../shared/view-model/renderer-snapshot';

type FeedbackTone = 'success' | 'info' | 'danger';

interface Feedback {
  tone: FeedbackTone;
  title: string;
  message?: string;
}

interface GroupForm {
  id: string | null;
  label: string;
  groupUrl: string;
  currentPostUrl: string;
  useMostRecentPost: boolean;
}

const EMPTY_GROUP_FORM: GroupForm = {
  id: null,
  label: '',
  groupUrl: '',
  currentPostUrl: '',
  useMostRecentPost: false,
};

export function ShareQueueScreen({ active }: { active: boolean }): JSX.Element {
  const snapshot = rendererSnapshot.value;
  const savedGroups = snapshot?.settings.facebookGroupShares ?? [];
  const allItems = shareQueueItems.value;
  const queuedItems = queuedShareItems.value;
  const completedItems = completedShareItems.value;
  const activeItem = activeShareQueueItem.value;
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [groupInput, setGroupInput] = useState('');
  const [groupForm, setGroupForm] = useState<GroupForm>(EMPTY_GROUP_FORM);

  const totals = useMemo(() => {
    let posted = 0;
    let skipped = 0;
    for (const item of completedItems) {
      if (item.status === 'posted') posted += 1;
      else if (item.status === 'skipped') skipped += 1;
    }
    return { queued: queuedItems.length, posted, skipped };
  }, [completedItems, queuedItems.length]);

  useEffect(() => {
    return window.reftrack.shareQueue.onAdvanceHotkey(() => {
      const item = activeShareQueueItem.peek();
      if (!item) return;
      void postedAndOpenNext(item);
    });
  });

  const copyItemToClipboard = async (item: ShareQueueItem): Promise<void> => {
    if (item.siteId) {
      const response = unwrapIpcResult(
        await window.reftrack.actions.copyLink({
          siteId: item.siteId,
          text: item.text,
          imagePath: item.imagePath,
          occurredAt: new Date().toISOString(),
        }),
      );
      publishSnapshot(response.snapshot);
      return;
    }

    unwrapIpcResult(
      await window.reftrack.actions.copyText({ text: item.text, imagePath: item.imagePath }),
    );
  };

  const copyPost = async (item: ShareQueueItem): Promise<void> => {
    if (pendingAction) return;
    setPendingAction(`copy:${item.id}`);
    try {
      await copyItemToClipboard(item);
      setFeedback(
        item.imagePath
          ? {
              tone: 'success',
              title: `${item.name} copied`,
              message: 'Text and image are on the clipboard.',
            }
          : { tone: 'success', title: `${item.name} copied` },
      );
    } catch (error) {
      setFeedback({
        tone: 'danger',
        title: 'Copy failed',
        message: errorMessage(error, 'RefTrack could not update the clipboard.'),
      });
    } finally {
      setPendingAction(null);
    }
  };

  const openGroup = async (item: ShareQueueItem | null = activeItem): Promise<void> => {
    if (pendingAction) return;
    setPendingAction('open-facebook');
    try {
      const url = item?.groupUrl ?? 'https://www.facebook.com/groups/feed/';
      unwrapIpcResult(await window.reftrack.external.open({ url }));
      setFeedback({ tone: 'info', title: item?.groupLabel ?? 'Facebook Groups opened' });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        title: 'Could not open Facebook',
        message: errorMessage(error, 'Windows could not open Facebook Groups.'),
      });
    } finally {
      setPendingAction(null);
    }
  };

  const openSite = async (item: ShareQueueItem): Promise<void> => {
    if (pendingAction) return;
    setPendingAction(`open:${item.id}`);
    try {
      unwrapIpcResult(await window.reftrack.external.open({ url: item.siteUrl }));
      setFeedback({ tone: 'info', title: `${item.name} opened` });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        title: 'Could not open site',
        message: errorMessage(error, 'Windows could not open that URL.'),
      });
    } finally {
      setPendingAction(null);
    }
  };

  const openUrl = async (url: string, title: string): Promise<void> => {
    if (pendingAction) return;
    setPendingAction(`open-url:${url}`);
    try {
      unwrapIpcResult(await window.reftrack.external.open({ url }));
      setFeedback({ tone: 'info', title });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        title: 'Could not open link',
        message: errorMessage(error, 'Windows could not open that URL.'),
      });
    } finally {
      setPendingAction(null);
    }
  };

  const mark = (item: ShareQueueItem, status: 'posted' | 'skipped'): void => {
    setShareQueueStatus(item.id, status);
    setFeedback({
      tone: status === 'posted' ? 'success' : 'info',
      title: status === 'posted' ? `${item.name} marked posted` : `${item.name} skipped`,
    });
  };

  const addGroups = (item: ShareQueueItem): void => {
    const urls = extractFacebookGroupUrls(groupInput);
    const added = addShareQueueGroups(item.id, urls);
    if (added === 0) {
      setFeedback({
        tone: 'info',
        title: 'No groups added',
        message: 'Paste Facebook group URLs, one per line.',
      });
      return;
    }
    setGroupInput('');
    setFeedback({
      tone: 'success',
      title: `Queued ${added} group${added === 1 ? '' : 's'}`,
      message: `${item.name} is ready for those destinations.`,
    });
  };

  const addSavedGroupToQueue = (
    item: ShareQueueItem,
    groups: readonly RendererFacebookGroupShare[],
  ): void => {
    const added = addShareQueueFacebookGroups(item.id, groups);
    if (added === 0) {
      setFeedback({
        tone: 'info',
        title: 'No groups added',
        message: 'Those groups are already queued for this post.',
      });
      return;
    }
    setFeedback({
      tone: 'success',
      title: `Queued ${added} saved group${added === 1 ? '' : 's'}`,
      message: `${item.name} is ready for those destinations.`,
    });
  };

  const editGroup = (group: RendererFacebookGroupShare): void => {
    setGroupForm({
      id: group.id,
      label: group.label,
      groupUrl: group.groupUrl,
      currentPostUrl: group.currentPostUrl ?? '',
      useMostRecentPost: group.useMostRecentPost,
    });
  };

  const resetGroupForm = (): void => {
    setGroupForm(EMPTY_GROUP_FORM);
  };

  const saveGroup = async (): Promise<void> => {
    if (pendingAction) return;
    setPendingAction('save-facebook-group');
    try {
      const response = unwrapIpcResult(
        await window.reftrack.settings.upsertFacebookGroupShare({
          id: groupForm.id,
          label: groupForm.label,
          groupUrl: groupForm.groupUrl,
          currentPostUrl: groupForm.currentPostUrl.trim() || null,
          useMostRecentPost: groupForm.useMostRecentPost,
        }),
      );
      publishSnapshot(response.snapshot);
      resetGroupForm();
      setFeedback({
        tone: 'success',
        title: groupForm.id ? 'Facebook group updated' : 'Facebook group added',
      });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        title: 'Facebook group was not saved',
        message: errorMessage(error, 'Check the group and post links, then try again.'),
      });
    } finally {
      setPendingAction(null);
    }
  };

  const deleteGroup = async (group: RendererFacebookGroupShare): Promise<void> => {
    if (pendingAction) return;
    setPendingAction(`delete-facebook-group:${group.id}`);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.settings.deleteFacebookGroupShare({ groupId: group.id }),
      );
      publishSnapshot(response.snapshot);
      if (groupForm.id === group.id) resetGroupForm();
      setFeedback({ tone: 'success', title: `${group.label} removed` });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        title: 'Facebook group was not removed',
        message: errorMessage(error, 'RefTrack could not remove that group.'),
      });
    } finally {
      setPendingAction(null);
    }
  };

  const selectImage = async (item: ShareQueueItem): Promise<void> => {
    if (pendingAction) return;
    setPendingAction(`image:${item.id}`);
    try {
      const result = unwrapIpcResult(await window.reftrack.actions.selectShareImage());
      if (!result.selected || !result.filePath) return;
      updateShareQueueImage(item.id, result.filePath);
      setFeedback({ tone: 'success', title: 'Image attached' });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        title: 'Image was not attached',
        message: errorMessage(error, 'RefTrack could not select that image.'),
      });
    } finally {
      setPendingAction(null);
    }
  };

  const postedAndOpenNext = async (item: ShareQueueItem): Promise<void> => {
    if (pendingAction) return;
    const index = queuedItems.findIndex((candidate) => candidate.id === item.id);
    let next: ShareQueueItem | null = null;
    for (let i = index + 1; i < queuedItems.length; i += 1) {
      const candidate = queuedItems[i];
      if (candidate?.groupUrl) {
        next = candidate;
        break;
      }
    }

    setPendingAction(`advance:${item.id}`);
    try {
      setShareQueueStatus(item.id, 'posted');
      if (!next) {
        setFeedback({ tone: 'success', title: `${item.name} marked posted` });
        return;
      }

      activeShareQueueItemId.value = next.id;
      await copyItemToClipboard(next);
      unwrapIpcResult(await window.reftrack.external.open({ url: next.groupUrl ?? next.siteUrl }));
      setFeedback({
        tone: 'success',
        title: `${item.name} posted. Next group opened.`,
        message: 'The next post material is already on the clipboard.',
      });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        title: 'Could not advance queue',
        message: errorMessage(error, 'RefTrack could not open the next group.'),
      });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <main
      id="tab-share"
      class="share-queue-screen"
      role="tabpanel"
      aria-labelledby="nav-share"
      aria-label="Facebook Group Shares"
      tabIndex={active ? 0 : -1}
      hidden={!active}
      aria-hidden={!active || undefined}
    >
      <header class="share-queue-header">
        <div class="share-queue-header__identity">
          <span class="share-queue-header__icon" aria-hidden="true">
            <ClipboardIcon size={22} />
          </span>
          <div>
            <span class="share-queue-eyebrow">Assisted sharing</span>
            <h1>Facebook Group Shares</h1>
            <p>
              Prepare posts, open Facebook groups or current group posts, copy text, then manually
              submit and mark each result.
            </p>
          </div>
        </div>
        <div class="share-queue-header__actions">
          <Button
            size="small"
            variant="secondary"
            leadingIcon={<ExternalLinkIcon size={16} />}
            pending={pendingAction === 'open-facebook'}
            onClick={() => void openGroup()}
          >
            Open groups
          </Button>
          <Button
            size="small"
            variant="quiet"
            disabled={completedItems.length === 0}
            onClick={clearCompletedShareQueueItems}
          >
            Clear done
          </Button>
          <Button
            size="small"
            variant="quiet"
            disabled={allItems.length === 0}
            onClick={clearShareQueue}
          >
            Clear all
          </Button>
        </div>
      </header>

      <section class="share-queue-summary" aria-label="Facebook Group Shares status">
        <div>
          <span>Queued</span>
          <strong>{totals.queued}</strong>
        </div>
        <div>
          <span>Posted</span>
          <strong>{totals.posted}</strong>
        </div>
        <div>
          <span>Skipped</span>
          <strong>{totals.skipped}</strong>
        </div>
      </section>

      <div class="share-queue-body">
        {feedback ? (
          <div
            class={`share-queue-feedback share-queue-feedback--${feedback.tone}`}
            role={feedback.tone === 'danger' ? 'alert' : 'status'}
          >
            <div>
              <strong>{feedback.title}</strong>
              {feedback.message ? <span>{feedback.message}</span> : null}
            </div>
            <button type="button" aria-label="Dismiss message" onClick={() => setFeedback(null)}>
              x
            </button>
          </div>
        ) : null}

        <section class="share-queue-group-library" aria-labelledby="facebook-groups-title">
          <header>
            <div>
              <span class="share-queue-eyebrow">Saved destinations</span>
              <h2 id="facebook-groups-title">Facebook groups</h2>
            </div>
            <Button
              size="small"
              variant="secondary"
              disabled={!activeItem || savedGroups.length === 0}
              onClick={() => activeItem && addSavedGroupToQueue(activeItem, savedGroups)}
            >
              Add all to current share
            </Button>
          </header>

          <form
            class="share-queue-group-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveGroup();
            }}
          >
            <label>
              <span>Group name</span>
              <input
                type="text"
                value={groupForm.label}
                maxLength={120}
                placeholder="VIP Referral Group"
                onInput={(event) =>
                  setGroupForm((current) => ({
                    ...current,
                    label: event.currentTarget.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Facebook group link</span>
              <input
                type="url"
                value={groupForm.groupUrl}
                placeholder="https://www.facebook.com/groups/example"
                onInput={(event) =>
                  setGroupForm((current) => ({
                    ...current,
                    groupUrl: event.currentTarget.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Current post link</span>
              <input
                type="url"
                value={groupForm.currentPostUrl}
                placeholder="https://www.facebook.com/groups/example/posts/123"
                onInput={(event) =>
                  setGroupForm((current) => ({
                    ...current,
                    currentPostUrl: event.currentTarget.value,
                  }))
                }
              />
            </label>
            <ToggleSwitch
              id="facebook-group-most-recent-post"
              label="Most recent post"
              description="Stores this group as a most-recent-post target; the saved current-post link remains the fallback link."
              checked={groupForm.useMostRecentPost}
              onChange={(useMostRecentPost) =>
                setGroupForm((current) => ({ ...current, useMostRecentPost }))
              }
            />
            <div class="share-queue-group-form__actions">
              <Button
                size="small"
                variant="primary"
                type="submit"
                pending={pendingAction === 'save-facebook-group'}
                disabled={!groupForm.label.trim() || !groupForm.groupUrl.trim()}
              >
                {groupForm.id ? 'Update group' : 'Add group'}
              </Button>
              {groupForm.id ? (
                <Button size="small" variant="quiet" onClick={resetGroupForm}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>

          {savedGroups.length > 0 ? (
            <ul class="share-queue-group-list" aria-label="Saved Facebook groups">
              {savedGroups.map((group) => (
                <li key={group.id}>
                  <div>
                    <strong>{group.label}</strong>
                    <span>{group.groupUrl}</span>
                    {group.currentPostUrl ? <span>{group.currentPostUrl}</span> : null}
                    {group.useMostRecentPost ? <small>Most recent post preferred</small> : null}
                  </div>
                  <div>
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={!activeItem}
                      onClick={() => activeItem && addSavedGroupToQueue(activeItem, [group])}
                    >
                      Add to share
                    </Button>
                    <Button
                      size="small"
                      variant="quiet"
                      leadingIcon={<ExternalLinkIcon size={15} />}
                      pending={pendingAction === `open-url:${group.groupUrl}`}
                      onClick={() => void openUrl(group.groupUrl, `${group.label} opened`)}
                    >
                      Open group
                    </Button>
                    <Button
                      size="small"
                      variant="quiet"
                      disabled={!group.currentPostUrl}
                      leadingIcon={<ExternalLinkIcon size={15} />}
                      pending={pendingAction === `open-url:${group.currentPostUrl ?? ''}`}
                      onClick={() =>
                        group.currentPostUrl &&
                        void openUrl(group.currentPostUrl, `${group.label} current post opened`)
                      }
                    >
                      Open post
                    </Button>
                    <Button size="small" variant="quiet" onClick={() => editGroup(group)}>
                      Edit
                    </Button>
                    <Button
                      size="small"
                      variant="quiet"
                      pending={pendingAction === `delete-facebook-group:${group.id}`}
                      onClick={() => void deleteGroup(group)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p class="share-queue-group-empty">No saved Facebook groups yet.</p>
          )}
        </section>

        {allItems.length === 0 ? (
          <section class="share-queue-empty" aria-labelledby="share-queue-empty-title">
            <ClipboardIcon size={38} />
            <h2 id="share-queue-empty-title">No sites queued</h2>
            <p>Select sites from Dashboard or Daily Tasks, then choose Queue share.</p>
          </section>
        ) : (
          <div class="share-queue-layout">
            <section class="share-queue-list" aria-label="Queued shares">
              {queuedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  class={`share-queue-row${activeItem?.id === item.id ? ' is-active' : ''}`}
                  onClick={() => {
                    activeShareQueueItemId.value = item.id;
                  }}
                >
                  <span class="share-queue-row__status" aria-hidden="true" />
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.groupLabel ? `Group: ${item.groupLabel}` : 'Add Facebook group URLs'}
                    </small>
                  </span>
                </button>
              ))}

              {completedItems.length ? (
                <div class="share-queue-completed">
                  <h2>Completed</h2>
                  {completedItems.map((item) => (
                    <div key={item.id} class={`share-queue-completed-row is-${item.status}`}>
                      <span>{item.status === 'posted' ? <CheckIcon size={15} /> : null}</span>
                      <strong>{item.name}</strong>
                      <small>{item.status}</small>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section class="share-queue-detail" aria-label="Current share">
              {activeItem ? (
                <>
                  <header>
                    <div>
                      <span class="share-queue-eyebrow">Current post</span>
                      <h2>{activeItem.name}</h2>
                    </div>
                    <Button
                      size="small"
                      variant="quiet"
                      leadingIcon={<TrashIcon size={15} />}
                      onClick={() => removeShareQueueItem(activeItem.id)}
                    >
                      Remove
                    </Button>
                  </header>

                  <div class="share-queue-link">
                    <LinkIcon size={16} />
                    <span>{activeItem.siteUrl}</span>
                    <Button
                      size="small"
                      variant="quiet"
                      leadingIcon={<ExternalLinkIcon size={15} />}
                      pending={pendingAction === `open:${activeItem.id}`}
                      onClick={() => void openSite(activeItem)}
                    >
                      Open site
                    </Button>
                  </div>

                  <section class="share-queue-groups" aria-label="Facebook group destinations">
                    <div>
                      <span class="share-queue-eyebrow">Facebook destination</span>
                      <strong>{activeItem.groupLabel ?? 'No group selected yet'}</strong>
                      {activeItem.groupUrl ? <small>{activeItem.groupUrl}</small> : null}
                      {activeItem.groupUseMostRecentPost ? (
                        <small>Most recent post preferred</small>
                      ) : null}
                    </div>
                    <textarea
                      value={groupInput}
                      rows={4}
                      placeholder="Paste Facebook group URLs here, one per line."
                      onInput={(event) => setGroupInput(event.currentTarget.value)}
                    />
                    <div>
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={groupInput.trim().length === 0}
                        onClick={() => addGroups(activeItem)}
                      >
                        Add group URLs
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        leadingIcon={<ExternalLinkIcon size={15} />}
                        disabled={!activeItem.groupUrl}
                        pending={pendingAction === 'open-facebook'}
                        onClick={() => void openGroup(activeItem)}
                      >
                        Open group
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        leadingIcon={<ExternalLinkIcon size={15} />}
                        disabled={!activeItem.groupPostUrl}
                        pending={pendingAction === `open-url:${activeItem.groupPostUrl ?? ''}`}
                        onClick={() =>
                          activeItem.groupPostUrl &&
                          void openUrl(activeItem.groupPostUrl, 'Current group post opened')
                        }
                      >
                        Open current post
                      </Button>
                    </div>
                  </section>

                  <section class="share-queue-image" aria-label="Share image">
                    <div>
                      <span class="share-queue-eyebrow">Image</span>
                      <strong>{activeItem.imagePath ? 'Attached' : 'None attached'}</strong>
                      {activeItem.imagePath ? <small>{activeItem.imagePath}</small> : null}
                    </div>
                    <div>
                      <Button
                        size="small"
                        variant="secondary"
                        pending={pendingAction === `image:${activeItem.id}`}
                        onClick={() => void selectImage(activeItem)}
                      >
                        Choose image
                      </Button>
                      <Button
                        size="small"
                        variant="quiet"
                        disabled={!activeItem.imagePath}
                        onClick={() => updateShareQueueImage(activeItem.id, null)}
                      >
                        Clear image
                      </Button>
                    </div>
                  </section>

                  <label class="share-queue-editor">
                    <span>Prepared post</span>
                    <textarea
                      value={activeItem.text}
                      rows={8}
                      spellcheck
                      onInput={(event) =>
                        updateShareQueueText(activeItem.id, event.currentTarget.value)
                      }
                    />
                  </label>

                  <div class="share-queue-actions">
                    <Button
                      variant="primary"
                      leadingIcon={<ClipboardIcon size={16} />}
                      pending={pendingAction === `copy:${activeItem.id}`}
                      disabled={activeItem.text.trim().length === 0}
                      onClick={() => void copyPost(activeItem)}
                    >
                      Copy post
                    </Button>
                    <Button
                      variant="secondary"
                      leadingIcon={<ExternalLinkIcon size={16} />}
                      pending={pendingAction === 'open-facebook'}
                      disabled={!activeItem.groupUrl}
                      onClick={() => void openGroup(activeItem)}
                    >
                      Open group
                    </Button>
                    <Button
                      variant="secondary"
                      leadingIcon={<CheckIcon size={16} />}
                      disabled={!activeItem.groupUrl}
                      pending={pendingAction === `advance:${activeItem.id}`}
                      onClick={() => void postedAndOpenNext(activeItem)}
                    >
                      Posted, open next
                    </Button>
                    <Button variant="quiet" onClick={() => mark(activeItem, 'skipped')}>
                      Skip
                    </Button>
                  </div>
                </>
              ) : (
                <div class="share-queue-detail__empty">
                  <CheckIcon size={34} />
                  <strong>Queue complete</strong>
                  <span>{snapshot ? 'Add more selected sites when you are ready.' : ''}</span>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

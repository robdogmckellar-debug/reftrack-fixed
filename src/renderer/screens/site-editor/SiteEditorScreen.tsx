import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type { RendererSite } from '../../../shared/view-model/renderer-snapshot';
import {
  completeGuardedNavigation,
  publishSnapshot,
  registerNavigationGuard,
  rendererSnapshot,
  type ScreenId,
} from '../../app/store';
import { EditIcon } from '../../components/icons';
import { Button } from '../../design-system/Button';
import { Dialog } from '../../design-system/Dialog';
import { RendererCommandError, errorMessage, unwrapIpcResult } from '../../lib/ipc-result';
import { SiteForm, type EditorFeedback } from './components/SiteForm';
import { SiteList } from './components/SiteList';
import {
  createEmptySiteDraft,
  sameSiteDraft,
  siteToDraft,
  type SiteEditorDraft,
  type SiteEditorField,
  validateSiteDraft,
} from './site-editor-model';

type EditorSelection =
  | { kind: 'none' }
  | { kind: 'site'; siteId: string }
  | { kind: 'new'; returnSiteId: string | null };

type PendingIntent =
  | { kind: 'select'; siteId: string }
  | { kind: 'create' }
  | { kind: 'navigate'; screen: ScreenId }
  | { kind: 'lifecycle'; lifecycle: SiteLifecycle };

type SiteLifecycle = 'active' | 'archived' | 'trashed';

const ALL_FIELDS: readonly SiteEditorField[] = [
  'name',
  'url',
  'prefix',
  'suffix',
  'dateFormat',
  'bonus',
  'maxCopiesPerDay',
  'notes',
  'payoutThreshold',
  'appClaimEnabled',
  'appClaimDownloadUrl',
  'appClaimApkPath',
  'appClaimPackageName',
  'appClaimDeepLinkUrl',
  'appClaimAvdName',
];

function fieldElementId(field: SiteEditorField): string {
  return `site-editor-${field}`;
}

function focusField(field: SiteEditorField): void {
  queueMicrotask(() => document.getElementById(fieldElementId(field))?.focus());
}

function nextSiteAfterDeletion(
  sitesBeforeDelete: readonly RendererSite[],
  sitesAfterDelete: readonly RendererSite[],
  deletedId: string,
): RendererSite | null {
  if (!sitesAfterDelete.length) return null;
  const deletedIndex = Math.max(
    0,
    sitesBeforeDelete.findIndex((site) => site.id === deletedId),
  );
  return sitesAfterDelete[Math.min(deletedIndex, sitesAfterDelete.length - 1)] ?? null;
}

export function SiteEditorScreen({ active }: { active: boolean }): JSX.Element {
  const snapshot = rendererSnapshot.value;
  const allSites = snapshot?.sites ?? [];
  const [lifecycle, setLifecycle] = useState<SiteLifecycle>('active');
  const sites = useMemo(
    () => allSites.filter((site) => (site.lifecycle ?? 'active') === lifecycle),
    [allSites, lifecycle],
  );
  const counts = useMemo(() => {
    const nextCounts = { active: 0, archived: 0, trashed: 0 };
    for (const site of allSites) nextCounts[site.lifecycle ?? 'active'] += 1;
    return nextCounts;
  }, [allSites]);
  const [selection, setSelection] = useState<EditorSelection>({ kind: 'none' });
  const [draft, setDraft] = useState<SiteEditorDraft>(createEmptySiteDraft);
  const [baseline, setBaseline] = useState<SiteEditorDraft>(createEmptySiteDraft);
  const [touched, setTouched] = useState<ReadonlySet<SiteEditorField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<SiteEditorField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lifecyclePending, setLifecyclePending] = useState(false);
  const [appClaimPending, setAppClaimPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<EditorFeedback | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);

  const creating = selection.kind === 'new';
  const selectedSiteId = selection.kind === 'site' ? selection.siteId : null;
  const selectedSite =
    selectedSiteId === null ? null : (allSites.find((site) => site.id === selectedSiteId) ?? null);
  const dirty = !sameSiteDraft(draft, baseline);
  const validation = useMemo(
    () => validateSiteDraft(draft, selectedSiteId),
    [draft, selectedSiteId],
  );
  const displayedErrors = useMemo(() => {
    const visible: Partial<Record<SiteEditorField, string>> = { ...serverErrors };
    for (const field of ALL_FIELDS) {
      if ((submitted || touched.has(field)) && validation.errors[field]) {
        visible[field] = validation.errors[field];
      }
    }
    return visible;
  }, [serverErrors, submitted, touched, validation.errors]);

  const resetInteractionState = (): void => {
    setTouched(new Set());
    setSubmitted(false);
    setServerErrors({});
    setFeedback(null);
  };

  const loadSite = (site: RendererSite): void => {
    const nextDraft = siteToDraft(site);
    setSelection({ kind: 'site', siteId: site.id });
    setDraft(nextDraft);
    setBaseline(nextDraft);
    resetInteractionState();
  };

  const beginCreate = (): void => {
    const returnSiteId = selection.kind === 'site' ? selection.siteId : (sites[0]?.id ?? null);
    const nextDraft = createEmptySiteDraft();
    setSelection({ kind: 'new', returnSiteId });
    setDraft(nextDraft);
    setBaseline(nextDraft);
    resetInteractionState();
    queueMicrotask(() => document.getElementById('site-editor-name')?.focus());
  };

  useEffect(() => {
    if (!snapshot || creating || saving) return;

    if (selection.kind === 'none') {
      const firstSite = sites[0];
      if (firstSite) loadSite(firstSite);
      return;
    }

    if (selection.kind !== 'site') return;
    const current = sites.find((site) => site.id === selection.siteId);
    if (!current) {
      const firstSite = sites[0];
      if (firstSite) loadSite(firstSite);
      else {
        const empty = createEmptySiteDraft();
        setSelection({ kind: 'none' });
        setDraft(empty);
        setBaseline(empty);
        resetInteractionState();
      }
      return;
    }

    if (!dirty) {
      const currentDraft = siteToDraft(current);
      if (!sameSiteDraft(currentDraft, baseline)) {
        setDraft(currentDraft);
        setBaseline(currentDraft);
      }
    }
  }, [baseline, creating, dirty, saving, selection, sites, snapshot]);

  useEffect(
    () =>
      registerNavigationGuard((target) => {
        if (!active || !dirty || target === 'editor') return true;
        setPendingIntent({ kind: 'navigate', screen: target });
        return false;
      }),
    [active, dirty],
  );

  const requestSiteSelection = (siteId: string): boolean => {
    if (selection.kind === 'site' && selection.siteId === siteId) return true;
    if (dirty) {
      setPendingIntent({ kind: 'select', siteId });
      return false;
    }
    const site = sites.find((candidate) => candidate.id === siteId);
    if (!site) return false;
    loadSite(site);
    return true;
  };

  const requestCreate = (): boolean => {
    if (creating) return true;
    if (dirty) {
      setPendingIntent({ kind: 'create' });
      return false;
    }
    beginCreate();
    return true;
  };

  const switchLifecycleView = (nextLifecycle: SiteLifecycle): void => {
    if (nextLifecycle === lifecycle) return;
    if (dirty) {
      setPendingIntent({ kind: 'lifecycle', lifecycle: nextLifecycle });
      return;
    }
    setLifecycle(nextLifecycle);
    setSelection({ kind: 'none' });
    resetInteractionState();
  };

  const discardAndContinue = (): void => {
    const intent = pendingIntent;
    setPendingIntent(null);
    if (!intent) return;

    if (intent.kind === 'navigate') {
      setDraft(baseline);
      resetInteractionState();
      completeGuardedNavigation(intent.screen);
      queueMicrotask(() => document.getElementById(`nav-${intent.screen}`)?.focus());
      return;
    }

    if (intent.kind === 'create') {
      beginCreate();
      return;
    }

    if (intent.kind === 'lifecycle') {
      setDraft(baseline);
      setLifecycle(intent.lifecycle);
      setSelection({ kind: 'none' });
      resetInteractionState();
      return;
    }

    const site = sites.find((candidate) => candidate.id === intent.siteId);
    if (site) {
      loadSite(site);
      queueMicrotask(() => document.getElementById(`site-editor-option-${site.id}`)?.focus());
    }
  };

  const changeField = (field: SiteEditorField, value: string | boolean): void => {
    setDraft((current) => ({ ...current, [field]: value }));
    setServerErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    if (feedback) setFeedback(null);
  };

  const markTouched = (field: SiteEditorField): void => {
    setTouched((current) => {
      if (current.has(field)) return current;
      const next = new Set(current);
      next.add(field);
      return next;
    });
  };

  const submit = async (event: JSX.TargetedSubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitted(true);
    setServerErrors({});

    if (!validation.request) {
      if (validation.firstInvalidField) focusField(validation.firstInvalidField);
      setFeedback({ tone: 'danger', message: 'Correct the highlighted fields and try again.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const response = unwrapIpcResult(await window.reftrack.sites.upsert(validation.request));
      publishSnapshot(response.snapshot);
      const savedSite = response.snapshot.sites.find((site) => site.id === response.siteId);
      if (!savedSite) throw new Error('The saved site was not returned by RefTrack.');

      const savedDraft = siteToDraft(savedSite);
      setSelection({ kind: 'site', siteId: savedSite.id });
      setDraft(savedDraft);
      setBaseline(savedDraft);
      setTouched(new Set());
      setSubmitted(false);
      setServerErrors({});
      setFeedback({
        tone: 'success',
        message: creating ? `${savedSite.name} added.` : `${savedSite.name} saved.`,
      });
    } catch (error) {
      if (
        error instanceof RendererCommandError &&
        ALL_FIELDS.includes(error.field as SiteEditorField)
      ) {
        const field = error.field as SiteEditorField;
        setServerErrors({ [field]: error.message });
        focusField(field);
      }
      setFeedback({
        tone: 'danger',
        message: errorMessage(error, 'RefTrack could not save this site.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const cancel = (): void => {
    if (creating) {
      const returnSiteId = selection.returnSiteId;
      const returnSite = sites.find((site) => site.id === returnSiteId) ?? sites[0] ?? null;
      if (returnSite) loadSite(returnSite);
      else {
        const empty = createEmptySiteDraft();
        setSelection({ kind: 'none' });
        setDraft(empty);
        setBaseline(empty);
        resetInteractionState();
      }
      return;
    }

    setDraft(baseline);
    resetInteractionState();
  };

  const openLink = async (): Promise<void> => {
    try {
      unwrapIpcResult(await window.reftrack.external.open({ url: draft.url.trim() }));
      setFeedback({ tone: 'info', message: 'Link opened in your default browser.' });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message: errorMessage(error, 'Windows could not open this link.'),
      });
    }
  };

  const selectApk = async (): Promise<void> => {
    if (appClaimPending) return;
    setAppClaimPending('select-apk');
    try {
      const result = unwrapIpcResult(await window.reftrack.sites.selectApk());
      if (!result.selected || !result.filePath) return;
      changeField('appClaimApkPath', result.filePath);
      markTouched('appClaimApkPath');
      setFeedback({ tone: 'success', message: 'APK selected.' });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message: errorMessage(error, 'RefTrack could not select an APK.'),
      });
    } finally {
      setAppClaimPending(null);
    }
  };

  const installApk = async (): Promise<void> => {
    if (appClaimPending || !draft.appClaimApkPath.trim()) return;
    setAppClaimPending('install-apk');
    try {
      const result = unwrapIpcResult(
        await window.reftrack.sites.installApk({
          apkPath: draft.appClaimApkPath,
          avdName: draft.appClaimAvdName.trim() || null,
        }),
      );
      if (result.packageName) {
        changeField('appClaimPackageName', result.packageName);
        markTouched('appClaimPackageName');
      }
      setFeedback({
        tone: 'success',
        message: result.packageName
          ? `APK installed. Package name filled: ${result.packageName}.`
          : 'APK installed in the connected emulator.',
      });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message: errorMessage(error, 'RefTrack could not install the APK through adb.'),
      });
    } finally {
      setAppClaimPending(null);
    }
  };

  const launchAndroidPackage = async (): Promise<void> => {
    if (appClaimPending || !draft.appClaimPackageName.trim()) return;
    setAppClaimPending('launch-package');
    try {
      unwrapIpcResult(
        await window.reftrack.sites.launchAndroidPackage({
          packageName: draft.appClaimPackageName.trim(),
          avdName: draft.appClaimAvdName.trim() || null,
        }),
      );
      setFeedback({ tone: 'success', message: 'Android app launched in the emulator.' });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message: errorMessage(error, 'RefTrack could not launch that Android package.'),
      });
    } finally {
      setAppClaimPending(null);
    }
  };

  const openAppClaimLink = async (kind: 'download' | 'deep-link'): Promise<void> => {
    if (appClaimPending) return;
    const url =
      kind === 'download' ? draft.appClaimDownloadUrl.trim() : draft.appClaimDeepLinkUrl.trim();
    if (!url) return;
    setAppClaimPending(kind === 'download' ? 'open-download' : 'open-deep-link');
    try {
      if (kind === 'download') unwrapIpcResult(await window.reftrack.external.open({ url }));
      else {
        unwrapIpcResult(
          await window.reftrack.sites.openAndroidDeepLink({
            url,
            avdName: draft.appClaimAvdName.trim() || null,
          }),
        );
      }
      setFeedback({
        tone: 'info',
        message: kind === 'download' ? 'Download page opened.' : 'Deep link sent to emulator.',
      });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message: errorMessage(error, 'RefTrack could not open that app-claim link.'),
      });
    } finally {
      setAppClaimPending(null);
    }
  };

  const changeSiteLifecycle = async (nextLifecycle: SiteLifecycle): Promise<void> => {
    if (!selectedSite || lifecyclePending || dirty) return;
    setLifecyclePending(true);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.sites.setLifecycle({
          siteId: selectedSite.id,
          lifecycle: nextLifecycle,
          occurredAt: new Date().toISOString(),
        }),
      );
      publishSnapshot(response.snapshot);
      setLifecycle(nextLifecycle);
      const updated = response.snapshot.sites.find((site) => site.id === selectedSite.id);
      if (updated) loadSite(updated);
      setFeedback({
        tone: 'info',
        message:
          nextLifecycle === 'active'
            ? `${selectedSite.name} restored to Active.`
            : `${selectedSite.name} archived with its statistics intact.`,
      });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message: errorMessage(error, 'RefTrack could not update this site.'),
      });
    } finally {
      setLifecyclePending(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!selectedSite || deleting) return;
    setDeleting(true);
    try {
      if ((selectedSite.lifecycle ?? 'active') !== 'trashed') {
        const response = unwrapIpcResult(
          await window.reftrack.sites.setLifecycle({
            siteId: selectedSite.id,
            lifecycle: 'trashed',
            occurredAt: new Date().toISOString(),
          }),
        );
        publishSnapshot(response.snapshot);
        setLifecycle('trashed');
        const recycled = response.snapshot.sites.find((site) => site.id === selectedSite.id);
        if (recycled) loadSite(recycled);
        setDeleteDialogOpen(false);
        setFeedback({
          tone: 'info',
          message: `${selectedSite.name} moved to the recycle bin. Its statistics are intact.`,
        });
        return;
      }

      const response = unwrapIpcResult(
        await window.reftrack.sites.delete({
          siteId: selectedSite.id,
          occurredAt: new Date().toISOString(),
        }),
      );
      const deletedName = selectedSite.name;
      const remainingRecycled = response.snapshot.sites.filter(
        (site) => site.lifecycle === 'trashed',
      );
      const nextSite = nextSiteAfterDeletion(sites, remainingRecycled, selectedSite.id);
      publishSnapshot(response.snapshot);
      setDeleteDialogOpen(false);
      setTouched(new Set());
      setSubmitted(false);
      setServerErrors({});

      if (nextSite) {
        const nextDraft = siteToDraft(nextSite);
        setSelection({ kind: 'site', siteId: nextSite.id });
        setDraft(nextDraft);
        setBaseline(nextDraft);
      } else {
        const empty = createEmptySiteDraft();
        setSelection({ kind: 'none' });
        setDraft(empty);
        setBaseline(empty);
      }
      setFeedback({ tone: 'info', message: `${deletedName} permanently deleted.` });
    } catch (error) {
      setDeleteDialogOpen(false);
      setFeedback({
        tone: 'danger',
        message: errorMessage(error, 'RefTrack could not delete this site.'),
      });
    } finally {
      setDeleting(false);
    }
  };

  const panelClasses = `site-editor-screen${active ? ' is-active' : ''}`;

  return (
    <section
      id="tab-editor"
      class={panelClasses}
      role="tabpanel"
      aria-labelledby="nav-editor"
      aria-label="Site Editor"
      hidden={!active}
      tabIndex={0}
    >
      <SiteList
        sites={sites}
        selectedSiteId={selectedSiteId}
        creating={creating}
        lifecycle={lifecycle}
        counts={counts}
        onCreate={requestCreate}
        onSelect={requestSiteSelection}
        onLifecycleChange={switchLifecycleView}
      />

      {selection.kind === 'none' ? (
        <section class="site-editor-empty-panel" aria-labelledby="site-editor-empty-title">
          <span class="site-editor-empty-panel__icon" aria-hidden="true">
            <EditIcon size={38} />
          </span>
          <span class="site-editor-eyebrow">Site Editor</span>
          <h2 id="site-editor-empty-title">
            {lifecycle === 'active'
              ? 'Add your first referral site'
              : lifecycle === 'archived'
                ? 'No archived sites'
                : 'Recycle bin is empty'}
          </h2>
          <p>
            {lifecycle === 'active'
              ? 'Configure the URL, copy format, success bonus, and daily limit. RefTrack keeps the data locally on this computer.'
              : lifecycle === 'archived'
                ? 'Sites you archive will remain available here with their statistics intact.'
                : 'Sites moved to the recycle bin remain recoverable until you delete them forever.'}
          </p>
          {lifecycle === 'active' ? (
            <Button variant="primary" onClick={() => requestCreate()}>
              Add a site
            </Button>
          ) : null}
          {feedback ? (
            <div class={`site-editor-empty-feedback site-editor-empty-feedback--${feedback.tone}`}>
              {feedback.message}
            </div>
          ) : null}
        </section>
      ) : (
        <SiteForm
          draft={draft}
          errors={displayedErrors}
          selectedSite={selectedSite}
          creating={creating}
          dirty={dirty}
          saving={saving}
          lifecyclePending={lifecyclePending || deleting}
          appClaimPending={appClaimPending}
          feedback={feedback}
          onChange={changeField}
          onFieldBlur={markTouched}
          onSubmit={(event) => void submit(event)}
          onCancel={cancel}
          onDelete={() => setDeleteDialogOpen(true)}
          onArchive={() => void changeSiteLifecycle('archived')}
          onRestore={() => void changeSiteLifecycle('active')}
          onOpenLink={() => void openLink()}
          onSelectApk={() => void selectApk()}
          onInstallApk={() => void installApk()}
          onLaunchAndroidPackage={() => void launchAndroidPackage()}
          onOpenAppClaimLink={(kind) => void openAppClaimLink(kind)}
        />
      )}

      <Dialog
        open={pendingIntent !== null}
        title="Discard unsaved changes?"
        description="Your edits have not been saved to RefTrack."
        initialFocusRef={keepEditingRef}
        onClose={() => setPendingIntent(null)}
        footer={
          <>
            <Button
              buttonRef={keepEditingRef}
              variant="secondary"
              onClick={() => setPendingIntent(null)}
            >
              Keep editing
            </Button>
            <Button variant="danger" onClick={discardAndContinue}>
              Discard changes
            </Button>
          </>
        }
      >
        <p class="site-editor-dialog-copy">
          Discard the current changes and continue? This action cannot be undone.
        </p>
      </Dialog>

      <Dialog
        open={deleteDialogOpen && selectedSite !== null}
        title={
          selectedSite?.lifecycle === 'trashed'
            ? `Delete ${selectedSite.name} forever?`
            : `Move ${selectedSite?.name ?? 'site'} to the recycle bin?`
        }
        description={
          selectedSite?.lifecycle === 'trashed'
            ? 'This permanently removes the site and cannot be undone.'
            : 'The site will leave active workflows but can still be restored.'
        }
        initialFocusRef={cancelDeleteRef}
        closeOnBackdrop={!deleting}
        onClose={() => {
          if (!deleting) setDeleteDialogOpen(false);
        }}
        footer={
          <>
            <Button
              buttonRef={cancelDeleteRef}
              variant="secondary"
              disabled={deleting}
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" pending={deleting} onClick={() => void confirmDelete()}>
              {selectedSite?.lifecycle === 'trashed' ? 'Delete forever' : 'Move to recycle bin'}
            </Button>
          </>
        }
      >
        <div class="site-editor-delete-summary">
          <p>
            {selectedSite?.lifecycle === 'trashed' ? (
              <>
                <strong>{selectedSite.name}</strong>, its copy history, successes, earnings, notes,
                and activity entries will be permanently deleted.
              </>
            ) : (
              <>
                <strong>{selectedSite?.name}</strong> and all of its history will remain intact in
                the recycle bin.
              </>
            )}
          </p>
          {dirty ? <p>Any unsaved edits in the form will also be discarded.</p> : null}
        </div>
      </Dialog>
    </section>
  );
}

import type { JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import type {
  ImporterProgressEvent,
  ImporterResult,
  ImporterStage,
} from '../../../../shared/ipc/contract';
import type {
  RendererSnapshot,
  RendererTaskColour,
} from '../../../../shared/view-model/renderer-snapshot';
import { CheckIcon, ImportIcon, ShieldIcon } from '../../../components/icons';
import { Button } from '../../../design-system/Button';
import { Dialog } from '../../../design-system/Dialog';
import { errorMessage, unwrapIpcResult } from '../../../lib/ipc-result';
import { isCredentialFreeHttpsUrl, normaliseTaskUrl } from '../daily-tasks-model';

const IMPORT_COLOURS: readonly RendererTaskColour[] = [
  'teal',
  'purple',
  'green',
  'gold',
  'orange',
  'red',
  'blue',
  'pink',
];

const IMPORT_STEPS: ReadonlyArray<{
  label: string;
  stages: readonly ImporterStage[];
}> = [
  { label: 'Validate and connect', stages: ['validating', 'connecting'] },
  { label: 'Download bounded HTML', stages: ['downloading'] },
  {
    label: 'Analyse page or isolated render',
    stages: ['analysing', 'browser-starting', 'browser-loading', 'browser-rendering'],
  },
  { label: 'Prepare review results', stages: ['finalising'] },
];

interface ImportReviewSite {
  id: string;
  name: string;
  url: string;
  selected: boolean;
}

interface ReviewErrors {
  categoryName?: string;
  sites: Record<string, { name?: string; url?: string }>;
}

type ImportPhase = 'input' | 'loading' | 'review';
type FeedbackTone = 'success' | 'info' | 'danger';

interface PartnerImportDialogProps {
  open: boolean;
  categoryCount: number;
  onClose(): void;
  onImported(
    categoryId: string,
    categoryName: string,
    siteCount: number,
    snapshot: RendererSnapshot,
  ): void;
  onFeedback(tone: FeedbackTone, title: string, message?: string): void;
}

function createEntityId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

function validateReview(categoryName: string, sites: readonly ImportReviewSite[]): ReviewErrors {
  const errors: ReviewErrors = { sites: {} };
  if (!categoryName.trim()) errors.categoryName = 'Enter a category name.';
  else if (categoryName.trim().length > 100) errors.categoryName = 'Use 100 characters or fewer.';

  for (const site of sites) {
    if (!site.selected) continue;
    const siteErrors: { name?: string; url?: string } = {};
    if (!site.name.trim()) siteErrors.name = 'Enter a site name.';
    else if (site.name.trim().length > 100) siteErrors.name = 'Use 100 characters or fewer.';

    if (!site.url.trim()) siteErrors.url = 'Enter the partner site URL.';
    else if (!isCredentialFreeHttpsUrl(site.url)) {
      siteErrors.url = 'Use a complete credential-free HTTPS URL.';
    }

    if (siteErrors.name || siteErrors.url) errors.sites[site.id] = siteErrors;
  }

  return errors;
}

function hasReviewErrors(errors: ReviewErrors): boolean {
  return Boolean(errors.categoryName) || Object.keys(errors.sites).length > 0;
}

function activeStepFor(stage: ImporterStage): number {
  const index = IMPORT_STEPS.findIndex((step) => step.stages.includes(stage));
  return index < 0 ? 0 : index;
}

export function PartnerImportDialog({
  open,
  categoryCount,
  onClose,
  onImported,
  onFeedback,
}: PartnerImportDialogProps): JSX.Element | null {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const jobIdRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<ImportPhase>('input');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImporterProgressEvent>({
    jobId: '',
    stage: 'validating',
    message: 'Validating the secure destination…',
    percent: 2,
  });
  const [result, setResult] = useState<ImporterResult | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [reviewSites, setReviewSites] = useState<ImportReviewSite[]>([]);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = useCallback((): void => {
    setPhase('input');
    setUrl('');
    setUrlError(null);
    setProgress({
      jobId: '',
      stage: 'validating',
      message: 'Validating the secure destination…',
      percent: 2,
    });
    setResult(null);
    setCategoryName('');
    setReviewSites([]);
    setReviewSubmitted(false);
    setStarting(false);
    setCancelling(false);
    setSaving(false);
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    const removeProgress = window.reftrack.importer.onProgress((event) => {
      if (event.jobId !== jobIdRef.current) return;
      setProgress(event);
    });

    const removeCompleted = window.reftrack.importer.onCompleted((event) => {
      if (event.jobId !== jobIdRef.current) return;
      jobIdRef.current = null;
      setStarting(false);
      setCancelling(false);

      if (!event.ok) {
        setPhase('input');
        if (event.error.code === 'IMPORT_CANCELLED') {
          onFeedback('info', 'Import cancelled');
        } else {
          const message = event.error.message || 'The partner page could not be extracted.';
          setUrlError(message);
          onFeedback('danger', 'Extraction failed', message);
        }
        return;
      }

      setResult(event.result);
      setCategoryName(event.result.brandName || 'Imported Partners');
      setReviewSites(
        event.result.sites.map((site) => ({
          id: createEntityId('importsite'),
          name: site.name,
          url: site.url,
          selected: true,
        })),
      );
      setReviewSubmitted(false);
      setPhase('review');
    });

    return () => {
      removeProgress();
      removeCompleted();
    };
  }, [onFeedback]);

  const requestClose = useCallback((): void => {
    const jobId = jobIdRef.current;
    jobIdRef.current = null;
    if (jobId) void window.reftrack.importer.cancel({ jobId });
    reset();
    onClose();
  }, [onClose, reset]);

  const startImport = async (event?: JSX.TargetedEvent<HTMLFormElement, Event>): Promise<void> => {
    event?.preventDefault();
    if (starting || jobIdRef.current) return;

    const trimmed = url.trim();
    if (!trimmed) {
      setUrlError('Enter a public HTTPS partner-page URL.');
      return;
    }
    if (!isCredentialFreeHttpsUrl(trimmed)) {
      setUrlError('Use a complete credential-free HTTPS URL.');
      return;
    }

    setUrlError(null);
    setStarting(true);
    setPhase('loading');
    setProgress({
      jobId: '',
      stage: 'validating',
      message: 'Validating the secure destination…',
      percent: 2,
    });

    try {
      const response = unwrapIpcResult(
        await window.reftrack.importer.start({ url: normaliseTaskUrl(trimmed) }),
      );
      jobIdRef.current = response.jobId;
    } catch (error) {
      setStarting(false);
      setPhase('input');
      const message = errorMessage(error, 'The partner import could not be started.');
      setUrlError(message);
      onFeedback('danger', 'Import could not start', message);
    }
  };

  const cancelImport = async (): Promise<void> => {
    const jobId = jobIdRef.current;
    if (!jobId || cancelling) return;
    setCancelling(true);
    try {
      const response = unwrapIpcResult(await window.reftrack.importer.cancel({ jobId }));
      if (response.cancelled) {
        jobIdRef.current = null;
        setPhase('input');
        setStarting(false);
        onFeedback('info', 'Import cancelled');
      } else {
        onFeedback(
          'info',
          'Import already finished',
          'The result will appear when processing completes.',
        );
      }
    } catch (error) {
      onFeedback(
        'danger',
        'Import could not be cancelled',
        errorMessage(error, 'RefTrack could not complete the partner import.'),
      );
    } finally {
      setCancelling(false);
    }
  };

  const updateReviewSite = (siteId: string, field: 'name' | 'url', value: string): void => {
    setReviewSites((current) =>
      current.map((site) => (site.id === siteId ? { ...site, [field]: value } : site)),
    );
  };

  const toggleReviewSite = (siteId: string, selected: boolean): void => {
    setReviewSites((current) =>
      current.map((site) => (site.id === siteId ? { ...site, selected } : site)),
    );
  };

  const saveImport = async (): Promise<void> => {
    if (saving) return;
    setReviewSubmitted(true);
    const errors = validateReview(categoryName, reviewSites);
    const selected = reviewSites.filter((site) => site.selected);
    if (selected.length === 0) {
      onFeedback('danger', 'No sites selected', 'Select at least one partner site to import.');
      return;
    }
    if (hasReviewErrors(errors)) return;

    const categoryId = createEntityId('category');
    const cleanName = categoryName.trim();
    setSaving(true);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.tasks.upsertCategory({
          category: {
            id: categoryId,
            name: cleanName,
            colour: IMPORT_COLOURS[categoryCount % IMPORT_COLOURS.length] ?? 'teal',
            sites: selected.map((site) => ({
              id: createEntityId('tasksite'),
              name: site.name.trim(),
              url: normaliseTaskUrl(site.url),
            })),
          },
        }),
      );
      onImported(response.categoryId, cleanName, selected.length, response.snapshot);
      requestClose();
    } catch (error) {
      onFeedback(
        'danger',
        'Import could not be saved',
        errorMessage(error, 'RefTrack could not complete the partner import.'),
      );
    } finally {
      setSaving(false);
    }
  };

  const reviewErrors = validateReview(categoryName, reviewSites);
  const selectedCount = reviewSites.filter((site) => site.selected).length;
  const activeStep = activeStepFor(progress.stage);

  return (
    <Dialog
      open={open}
      title="Import partner page"
      description="Extract partner links through RefTrack's restricted static-first importer."
      onClose={requestClose}
      initialFocusRef={urlInputRef}
      closeOnBackdrop={phase !== 'loading'}
      footer={
        phase === 'input' ? (
          <>
            <Button variant="quiet" onClick={requestClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="partner-import-form"
              pending={starting}
              leadingIcon={<ImportIcon size={16} />}
            >
              Extract partners
            </Button>
          </>
        ) : phase === 'review' ? (
          <>
            <Button variant="quiet" onClick={() => setPhase('input')} disabled={saving}>
              Back
            </Button>
            <Button
              variant="primary"
              pending={saving}
              disabled={selectedCount === 0}
              leadingIcon={<ImportIcon size={16} />}
              onClick={() => void saveImport()}
            >
              Import {selectedCount} site{selectedCount === 1 ? '' : 's'}
            </Button>
          </>
        ) : undefined
      }
    >
      {phase === 'input' ? (
        <form
          id="partner-import-form"
          class="partner-import-input"
          onSubmit={(event) => void startImport(event)}
        >
          <div class="partner-import-intro">
            <span aria-hidden="true">
              <ShieldIcon size={22} />
            </span>
            <div>
              <strong>Restricted by default</strong>
              <p>
                RefTrack accepts public HTTPS pages, limits redirects, response size and runtime,
                and opens an isolated browser only when static extraction is inconclusive.
              </p>
            </div>
          </div>

          <div class="task-field">
            <label for="partner-import-url">Partner-page URL</label>
            <input
              ref={urlInputRef}
              id="partner-import-url"
              type="url"
              value={url}
              autoComplete="off"
              spellcheck={false}
              placeholder="https://partners.example.com/brands"
              aria-invalid={Boolean(urlError)}
              aria-describedby={urlError ? 'partner-import-url-error' : 'partner-import-url-hint'}
              onInput={(event) => {
                setUrl(event.currentTarget.value);
                if (urlError) setUrlError(null);
              }}
            />
            {urlError ? (
              <span id="partner-import-url-error" class="task-field__error" role="alert">
                {urlError}
              </span>
            ) : (
              <span id="partner-import-url-hint" class="task-field__hint">
                Authentication, local addresses, non-standard ports and HTTP pages are rejected.
              </span>
            )}
          </div>

          <ul class="partner-import-boundaries" aria-label="Importer safety boundaries">
            <li>Maximum 2 MiB HTML response</li>
            <li>Maximum five redirects</li>
            <li>Private and reserved addresses blocked</li>
            <li>Nothing saved before your review</li>
          </ul>
        </form>
      ) : null}

      {phase === 'loading' ? (
        <div class="partner-import-loading" role="status" aria-live="polite">
          <span class="partner-import-loading__icon" aria-hidden="true">
            <ImportIcon size={26} />
          </span>
          <div>
            <h3>Extracting partner data</h3>
            <p>{progress.message}</p>
          </div>
          <progress
            max={100}
            value={typeof progress.percent === 'number' ? progress.percent : undefined}
            aria-label="Partner import progress"
          />
          <ol class="partner-import-steps">
            {IMPORT_STEPS.map((step, index) => (
              <li
                key={step.label}
                class={index < activeStep ? 'is-complete' : index === activeStep ? 'is-active' : ''}
                aria-current={index === activeStep ? 'step' : undefined}
              >
                <span aria-hidden="true">
                  {index < activeStep ? <CheckIcon size={14} /> : index + 1}
                </span>
                {step.label}
              </li>
            ))}
          </ol>
          <Button variant="secondary" pending={cancelling} onClick={() => void cancelImport()}>
            Cancel import
          </Button>
        </div>
      ) : null}

      {phase === 'review' && result ? (
        <div class="partner-import-review">
          <section class="partner-import-review__summary" aria-label="Extraction summary">
            <div>
              <strong>
                {result.method === 'browser' ? 'Isolated browser fallback' : 'Bounded static HTML'}
              </strong>
              <span>{Math.round(result.confidence * 100)}% extraction confidence</span>
            </div>
            <span>{selectedCount} selected</span>
          </section>

          {result.warnings.length ? (
            <div class="partner-import-warning" role="note">
              <strong>Review recommended</strong>
              <ul>
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div class="task-field">
            <label for="partner-import-category-name">Category name</label>
            <input
              id="partner-import-category-name"
              type="text"
              value={categoryName}
              maxLength={100}
              aria-invalid={reviewSubmitted && Boolean(reviewErrors.categoryName)}
              aria-describedby={
                reviewSubmitted && reviewErrors.categoryName
                  ? 'partner-import-category-name-error'
                  : undefined
              }
              onInput={(event) => setCategoryName(event.currentTarget.value)}
            />
            {reviewSubmitted && reviewErrors.categoryName ? (
              <span id="partner-import-category-name-error" class="task-field__error" role="alert">
                {reviewErrors.categoryName}
              </span>
            ) : null}
          </div>

          <div class="partner-import-selection-bar">
            <span>
              {selectedCount} of {reviewSites.length} site{reviewSites.length === 1 ? '' : 's'}{' '}
              selected
            </span>
            <div>
              <Button
                size="small"
                variant="quiet"
                onClick={() =>
                  setReviewSites((current) => current.map((site) => ({ ...site, selected: true })))
                }
              >
                Select all
              </Button>
              <Button
                size="small"
                variant="quiet"
                onClick={() =>
                  setReviewSites((current) => current.map((site) => ({ ...site, selected: false })))
                }
              >
                Select none
              </Button>
            </div>
          </div>

          {reviewSites.length ? (
            <div class="partner-import-site-list">
              {reviewSites.map((site, index) => {
                const siteErrors = reviewErrors.sites[site.id];
                return (
                  <div
                    class={`partner-import-site${site.selected ? '' : ' is-deselected'}`}
                    key={site.id}
                  >
                    <label class="partner-import-site__select">
                      <input
                        type="checkbox"
                        checked={site.selected}
                        aria-label={`Include ${site.name || `result ${index + 1}`}`}
                        onChange={(event) => toggleReviewSite(site.id, event.currentTarget.checked)}
                      />
                      <span aria-hidden="true">
                        {site.selected ? <CheckIcon size={14} /> : null}
                      </span>
                    </label>
                    <div class="task-field">
                      <label for={`partner-import-${site.id}-name`}>Site name</label>
                      <input
                        id={`partner-import-${site.id}-name`}
                        type="text"
                        value={site.name}
                        maxLength={100}
                        disabled={!site.selected}
                        aria-invalid={reviewSubmitted && Boolean(siteErrors?.name)}
                        onInput={(event) =>
                          updateReviewSite(site.id, 'name', event.currentTarget.value)
                        }
                      />
                      {reviewSubmitted && siteErrors?.name ? (
                        <span class="task-field__error" role="alert">
                          {siteErrors.name}
                        </span>
                      ) : null}
                    </div>
                    <div class="task-field task-field--url">
                      <label for={`partner-import-${site.id}-url`}>HTTPS URL</label>
                      <input
                        id={`partner-import-${site.id}-url`}
                        type="url"
                        value={site.url}
                        disabled={!site.selected}
                        spellcheck={false}
                        aria-invalid={reviewSubmitted && Boolean(siteErrors?.url)}
                        onInput={(event) =>
                          updateReviewSite(site.id, 'url', event.currentTarget.value)
                        }
                      />
                      {reviewSubmitted && siteErrors?.url ? (
                        <span class="task-field__error" role="alert">
                          {siteErrors.url}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div class="partner-import-no-results" role="status">
              <strong>No partner sites were extracted.</strong>
              <p>
                The page may require a login or use an unsupported structure. Return and enter the
                sites manually.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}

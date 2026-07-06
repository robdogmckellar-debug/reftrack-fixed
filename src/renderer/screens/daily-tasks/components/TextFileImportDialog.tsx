import type { JSX } from 'preact';
import { useCallback, useMemo, useRef, useState } from 'preact/hooks';

import type {
  RendererSnapshot,
  RendererTaskColour,
} from '../../../../shared/view-model/renderer-snapshot';
import { ImportIcon } from '../../../components/icons';
import { Button } from '../../../design-system/Button';
import { Dialog } from '../../../design-system/Dialog';
import { errorMessage, unwrapIpcResult } from '../../../lib/ipc-result';
import { isCredentialFreeHttpsUrl, normaliseTaskUrl } from '../daily-tasks-model';
import { parsePartnerTextFile, type ParsedPartnerTextFile } from '../text-file-import';

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

interface TextImportSite {
  id: string;
  selected: boolean;
  name: string;
  url: string;
}

type FeedbackTone = 'success' | 'info' | 'danger';

interface TextFileImportDialogProps {
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

export function TextFileImportDialog({
  open,
  categoryCount,
  onClose,
  onImported,
  onFeedback,
}: TextFileImportDialogProps): JSX.Element | null {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedPartnerTextFile | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [sites, setSites] = useState<TextImportSite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedCount = useMemo(() => sites.filter((site) => site.selected).length, [sites]);

  const reset = useCallback((): void => {
    setParsed(null);
    setCategoryName('');
    setSites([]);
    setError(null);
    setReading(false);
    setSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const requestClose = (): void => {
    if (reading || saving) return;
    reset();
    onClose();
  };

  const chooseFile = (): void => {
    if (!reading && !saving) fileInputRef.current?.click();
  };

  const readFile = async (event: JSX.TargetedEvent<HTMLInputElement, Event>): Promise<void> => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    setReading(true);
    setError(null);
    try {
      const result = await parsePartnerTextFile(file);
      setParsed(result);
      setCategoryName(result.categoryName);
      setSites(
        result.sites.map((site) => ({
          id: createEntityId('textsite'),
          selected: true,
          name: site.name,
          url: site.url,
        })),
      );
    } catch (caught) {
      const message = errorMessage(caught, 'RefTrack could not read that text file.');
      setParsed(null);
      setSites([]);
      setError(message);
      onFeedback('danger', 'Text-file import failed', message);
    } finally {
      setReading(false);
    }
  };

  const updateSite = (siteId: string, field: 'name' | 'url', value: string): void => {
    setSites((current) =>
      current.map((site) => (site.id === siteId ? { ...site, [field]: value } : site)),
    );
    setError(null);
  };

  const setAllSelected = (selected: boolean): void => {
    setSites((current) => current.map((site) => ({ ...site, selected })));
  };

  const saveImport = async (): Promise<void> => {
    if (saving) return;
    const cleanCategoryName = categoryName.trim();
    const selected = sites.filter((site) => site.selected);

    if (!cleanCategoryName) {
      setError('Enter a category name.');
      return;
    }
    if (cleanCategoryName.length > 100) {
      setError('Use 100 characters or fewer for the category name.');
      return;
    }
    if (selected.length === 0) {
      setError('Select at least one partner site.');
      return;
    }

    for (const site of selected) {
      if (!site.name.trim()) {
        setError('Every selected site needs a name.');
        return;
      }
      if (site.name.trim().length > 100) {
        setError(`Use 100 characters or fewer for ${site.name || 'the selected site'}.`);
        return;
      }
      if (!isCredentialFreeHttpsUrl(site.url)) {
        setError(`Enter a complete credential-free HTTPS URL for ${site.name || 'the selected site'}.`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.tasks.upsertCategory({
          category: {
            id: createEntityId('category'),
            name: cleanCategoryName,
            colour: IMPORT_COLOURS[categoryCount % IMPORT_COLOURS.length] ?? 'teal',
            sites: selected.map((site) => ({
              id: createEntityId('tasksite'),
              name: site.name.trim(),
              url: normaliseTaskUrl(site.url),
            })),
          },
        }),
      );
      onImported(response.categoryId, cleanCategoryName, selected.length, response.snapshot);
      reset();
      onClose();
    } catch (caught) {
      const message = errorMessage(
        caught,
        'RefTrack could not save the imported Daily Tasks category.',
      );
      setError(message);
      onFeedback('danger', 'Text-file import could not be saved', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      title="Import partner list from .txt"
      description="Create a Daily Tasks category from HTTPS partner links stored in a local text file."
      closeOnBackdrop={!reading && !saving}
      onClose={requestClose}
      footer={
        <>
          <Button variant="quiet" disabled={reading || saving} onClick={requestClose}>
            Cancel
          </Button>
          {parsed ? (
            <Button variant="secondary" disabled={reading || saving} onClick={chooseFile}>
              Choose another file
            </Button>
          ) : null}
          <Button
            variant="primary"
            pending={saving}
            disabled={!parsed || selectedCount === 0 || reading}
            leadingIcon={<ImportIcon size={16} />}
            onClick={() => void saveImport()}
          >
            Import {selectedCount || ''} site{selectedCount === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <input
        ref={fileInputRef}
        class="text-file-import__native-input"
        type="file"
        accept=".txt,text/plain"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void readFile(event)}
      />

      {!parsed ? (
        <div class="text-file-import__empty">
          <strong>Select a partner-list text file</strong>
          <p>
            Supported content includes saved HTML source, one HTTPS link per line, or rows such as
            <code> Site Name, https://example.com/REFCODE</code>.
          </p>
          <Button
            variant="primary"
            pending={reading}
            disabled={saving}
            leadingIcon={<ImportIcon size={16} />}
            onClick={chooseFile}
          >
            Choose .txt file
          </Button>
          <span>
            The new Daily Tasks category name is taken from the file name. Maximum file size: 2 MiB.
          </span>
        </div>
      ) : (
        <div class="text-file-import__review">
          <div class="text-file-import__summary">
            <div>
              <strong>{parsed.fileName}</strong>
              <span>
                {selectedCount} of {sites.length} site{sites.length === 1 ? '' : 's'} selected
              </span>
            </div>
            <div class="text-file-import__selection-actions">
              <button type="button" disabled={saving} onClick={() => setAllSelected(true)}>
                Select all
              </button>
              <button type="button" disabled={saving} onClick={() => setAllSelected(false)}>
                Select none
              </button>
            </div>
          </div>

          <label class="text-file-import__category">
            <span>Category name</span>
            <input
              type="text"
              value={categoryName}
              maxLength={100}
              disabled={saving}
              onInput={(event) => {
                setCategoryName(event.currentTarget.value);
                setError(null);
              }}
            />
          </label>

          {parsed.warnings.length ? (
            <div class="text-file-import__warnings" role="status">
              {parsed.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}

          <div class="text-file-import__list">
            {sites.map((site) => (
              <div key={site.id} class="text-file-import__row">
                <label class="text-file-import__checkbox">
                  <input
                    type="checkbox"
                    checked={site.selected}
                    disabled={saving}
                    aria-label={`Select ${site.name}`}
                    onChange={(event) => {
                      const selected = event.currentTarget.checked;
                      setSites((current) =>
                        current.map((candidate) =>
                          candidate.id === site.id ? { ...candidate, selected } : candidate,
                        ),
                      );
                    }}
                  />
                </label>
                <label>
                  <span>Site name</span>
                  <input
                    type="text"
                    value={site.name}
                    maxLength={100}
                    disabled={saving}
                    onInput={(event) => updateSite(site.id, 'name', event.currentTarget.value)}
                  />
                </label>
                <label>
                  <span>HTTPS URL</span>
                  <input
                    type="url"
                    value={site.url}
                    maxLength={2048}
                    disabled={saving}
                    onInput={(event) => updateSite(site.id, 'url', event.currentTarget.value)}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <div class="text-file-import__feedback" role="alert">
          {error}
        </div>
      ) : null}
    </Dialog>
  );
}

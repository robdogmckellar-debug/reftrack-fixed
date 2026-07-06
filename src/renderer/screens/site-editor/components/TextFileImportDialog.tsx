import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { publishSnapshot, rendererSnapshot } from '../../../app/store';
import { Button } from '../../../design-system/Button';
import { Dialog } from '../../../design-system/Dialog';
import { errorMessage, unwrapIpcResult } from '../../../lib/ipc-result';
import { parsePartnerTextFile, type ParsedPartnerTextFile } from '../text-file-import';

interface TextFileImportDialogProps {
  open: boolean;
  onClose(): void;
  onImported(count: number): void;
}

interface ImportRow {
  key: string;
  selected: boolean;
  name: string;
  url: string;
  existingSiteId: string | null;
}

export function TextFileImportDialog({
  open,
  onClose,
  onImported,
}: TextFileImportDialogProps): JSX.Element | null {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedPartnerTextFile | null>(null);
  const [rows, setRows] = useState<readonly ImportRow[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);

  const selectedCount = useMemo(() => rows.filter((row) => row.selected).length, [rows]);

  useEffect(() => {
    if (open) return;
    setParsed(null);
    setRows([]);
    setCategoryName('');
    setFeedback(null);
    setReading(false);
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open]);

  const chooseFile = (): void => {
    if (!reading && !importing) fileInputRef.current?.click();
  };

  const readFile = async (event: JSX.TargetedEvent<HTMLInputElement, Event>): Promise<void> => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    setReading(true);
    setFeedback(null);
    try {
      const result = await parsePartnerTextFile(file);
      const existingSites = rendererSnapshot.value?.sites ?? [];
      const nextRows = result.sites.map((site, index): ImportRow => {
        const existing = existingSites.find(
          (candidate) => normaliseUrl(candidate.url) === normaliseUrl(site.url),
        );
        return {
          key: `${index}-${site.url}`,
          selected: true,
          name: existing?.name ?? site.name,
          url: existing?.url ?? site.url,
          existingSiteId: existing?.id ?? null,
        };
      });

      setParsed(result);
      setRows(nextRows);
      setCategoryName(`${result.brandName} Partnership`.slice(0, 100));
    } catch (error) {
      setParsed(null);
      setRows([]);
      setFeedback(errorMessage(error, 'RefTrack could not read that text file.'));
    } finally {
      setReading(false);
    }
  };

  const updateRow = (key: string, patch: Partial<Pick<ImportRow, 'name' | 'url'>>): void => {
    setRows((current) =>
      current.map((row) =>
        row.key === key
          ? {
              ...row,
              ...patch,
              existingSiteId: patch.url === undefined ? row.existingSiteId : null,
            }
          : row,
      ),
    );
    setFeedback(null);
  };

  const setAllSelected = (selected: boolean): void => {
    setRows((current) => current.map((row) => ({ ...row, selected })));
  };

  const importSelected = async (): Promise<void> => {
    const selectedRows = rows.filter((row) => row.selected);
    const category = categoryName.trim();
    if (!category) {
      setFeedback('Enter a category name.');
      return;
    }
    if (category.length > 100) {
      setFeedback('Use 100 characters or fewer for the category name.');
      return;
    }
    if (selectedRows.length === 0) {
      setFeedback('Select at least one partner site.');
      return;
    }

    for (const row of selectedRows) {
      if (!row.name.trim()) {
        setFeedback('Every selected site needs a name.');
        return;
      }
      if (!isCredentialFreeHttpsUrl(row.url)) {
        setFeedback(`Enter a valid credential-free HTTPS URL for ${row.name || 'the selected site'}.`);
        return;
      }
    }

    setImporting(true);
    setFeedback(null);
    try {
      let snapshot = rendererSnapshot.value;
      if (!snapshot) throw new Error('RefTrack data is not available.');

      const taskSites: Array<{ id: string; name: string; url: string }> = [];
      for (const row of selectedRows) {
        const existing = row.existingSiteId
          ? snapshot.sites.find((site) => site.id === row.existingSiteId)
          : null;
        if (existing) {
          taskSites.push({ id: existing.id, name: existing.name, url: existing.url });
          continue;
        }

        const response = unwrapIpcResult(
          await window.reftrack.sites.upsert({
            id: null,
            name: row.name.trim().toUpperCase(),
            url: normaliseUrl(row.url),
            prefix: '',
            suffix: '',
            dateFormat: '',
            bonusCents: 0,
            maxCopiesPerDay: 1,
          }),
        );
        snapshot = response.snapshot;
        publishSnapshot(snapshot);
        const savedSite = snapshot.sites.find((site) => site.id === response.siteId);
        if (!savedSite) throw new Error(`${row.name} was saved but could not be reloaded.`);
        taskSites.push({ id: savedSite.id, name: savedSite.name, url: savedSite.url });
      }

      const categoryResponse = unwrapIpcResult(
        await window.reftrack.tasks.upsertCategory({
          category: {
            id: `category_${randomId()}`,
            name: category,
            colour: 'gold',
            sites: taskSites,
          },
        }),
      );
      publishSnapshot(categoryResponse.snapshot);
      onImported(selectedRows.length);
      onClose();
    } catch (error) {
      setFeedback(errorMessage(error, 'RefTrack could not import the selected partner sites.'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      title="Import partners from text file"
      description="Extract HTTPS partner links from a local .txt file, review them, then add them to RefTrack."
      closeOnBackdrop={!reading && !importing}
      onClose={() => {
        if (!reading && !importing) onClose();
      }}
      footer={
        <>
          <Button variant="secondary" disabled={reading || importing} onClick={onClose}>
            Cancel
          </Button>
          {parsed ? (
            <Button variant="secondary" disabled={reading || importing} onClick={chooseFile}>
              Choose another file
            </Button>
          ) : null}
          <Button
            variant="primary"
            pending={importing}
            disabled={!parsed || selectedCount === 0 || reading}
            onClick={() => void importSelected()}
          >
            Import {selectedCount || ''} selected
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
          <strong>Select a partner-page text file</strong>
          <p>
            The file may contain saved HTML source, one HTTPS link per line, or rows such as
            <code> Site Name, https://example.com/REFCODE</code>.
          </p>
          <Button variant="primary" pending={reading} disabled={importing} onClick={chooseFile}>
            Choose .txt file
          </Button>
          <span>Maximum file size: 2 MiB. The file is read locally and no scripts are executed.</span>
        </div>
      ) : (
        <div class="text-file-import__review">
          <div class="text-file-import__summary">
            <div>
              <strong>{parsed.fileName}</strong>
              <span>
                {selectedCount} of {rows.length} site{rows.length === 1 ? '' : 's'} selected
              </span>
            </div>
            <div class="text-file-import__selection-actions">
              <button type="button" onClick={() => setAllSelected(true)}>
                Select all
              </button>
              <button type="button" onClick={() => setAllSelected(false)}>
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
              disabled={importing}
              onInput={(event) => {
                setCategoryName(event.currentTarget.value);
                setFeedback(null);
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
            {rows.map((row) => (
              <div key={row.key} class="text-file-import__row">
                <label class="text-file-import__checkbox">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    disabled={importing}
                    aria-label={`Select ${row.name}`}
                    onChange={(event) => {
                      const selected = event.currentTarget.checked;
                      setRows((current) =>
                        current.map((candidate) =>
                          candidate.key === row.key ? { ...candidate, selected } : candidate,
                        ),
                      );
                    }}
                  />
                </label>
                <label>
                  <span>Site name</span>
                  <input
                    type="text"
                    value={row.name}
                    maxLength={100}
                    disabled={importing || row.existingSiteId !== null}
                    onInput={(event) => updateRow(row.key, { name: event.currentTarget.value })}
                  />
                </label>
                <label>
                  <span>HTTPS URL</span>
                  <input
                    type="url"
                    value={row.url}
                    maxLength={2048}
                    disabled={importing || row.existingSiteId !== null}
                    onInput={(event) => updateRow(row.key, { url: event.currentTarget.value })}
                  />
                </label>
                {row.existingSiteId ? (
                  <span class="text-file-import__existing">Already configured</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {feedback ? (
        <div class="text-file-import__feedback" role="alert">
          {feedback}
        </div>
      ) : null}
    </Dialog>
  );
}

function isCredentialFreeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function normaliseUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = '';
    return url.href;
  } catch {
    return value.trim();
  }
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

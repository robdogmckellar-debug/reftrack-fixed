import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type {
  RendererTaskCategory,
  RendererTaskColour,
  RendererTaskSite,
} from '../../../../shared/view-model/renderer-snapshot';
import { EditIcon, PlusIcon, TrashIcon } from '../../../components/icons';
import { Button } from '../../../design-system/Button';
import { Dialog } from '../../../design-system/Dialog';
import { activeTaskSites, hasTaskCategoryErrors, validateTaskCategory } from '../daily-tasks-model';

const COLOURS: ReadonlyArray<{ value: RendererTaskColour; label: string }> = [
  { value: 'teal', label: 'Teal' },
  { value: 'purple', label: 'Purple' },
  { value: 'green', label: 'Green' },
  { value: 'gold', label: 'Gold' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' },
  { value: 'blue', label: 'Blue' },
  { value: 'pink', label: 'Pink' },
];

function createEntityId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

function createBlankSite(): RendererTaskSite {
  return { id: createEntityId('tasksite'), name: '', url: '' };
}

interface TaskCategoryDialogProps {
  open: boolean;
  category: RendererTaskCategory | null;
  pending: boolean;
  onClose(): void;
  onSave(category: RendererTaskCategory): Promise<boolean>;
}

export function TaskCategoryDialog({
  open,
  category,
  pending,
  onClose,
  onSave,
}: TaskCategoryDialogProps): JSX.Element | null {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [colour, setColour] = useState<RendererTaskColour>('teal');
  const [sites, setSites] = useState<RendererTaskSite[]>([createBlankSite()]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setColour(category?.colour ?? 'teal');
    setSites(
      category?.sites.length ? category.sites.map((site) => ({ ...site })) : [createBlankSite()],
    );
    setSubmitted(false);
  }, [category, open]);

  const errors = useMemo(() => validateTaskCategory(name, sites), [name, sites]);

  const addSite = (): void => {
    const next = createBlankSite();
    setSites((current) => [...current, next]);
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>(`[data-task-site-name="${next.id}"]`)?.focus();
    }, 0);
  };

  const updateSite = (siteId: string, field: 'name' | 'url', value: string): void => {
    setSites((current) =>
      current.map((site) => (site.id === siteId ? { ...site, [field]: value } : site)),
    );
  };

  const removeSite = (siteId: string): void => {
    setSites((current) => {
      const next = current.filter((site) => site.id !== siteId);
      return next.length ? next : [createBlankSite()];
    });
  };

  const submit = async (event: JSX.TargetedSubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitted(true);
    if (hasTaskCategoryErrors(errors)) return;

    const saved = await onSave({
      id: category?.id ?? createEntityId('category'),
      name: name.trim(),
      colour,
      sites: activeTaskSites(sites),
    });
    if (saved) setSubmitted(false);
  };

  const requestClose = (): void => {
    if (!pending) onClose();
  };

  return (
    <Dialog
      open={open}
      title={category ? `Edit ${category.name}` : 'New Daily Tasks category'}
      description="Group related sites and preserve their stable daily-progress identities."
      onClose={requestClose}
      initialFocusRef={nameRef}
      closeOnBackdrop={!pending}
      footer={
        <>
          <Button variant="quiet" onClick={requestClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="task-category-form"
            pending={pending}
            leadingIcon={<EditIcon size={16} />}
          >
            {category ? 'Save changes' : 'Create category'}
          </Button>
        </>
      }
    >
      <form
        id="task-category-form"
        class="task-category-editor"
        onSubmit={(event) => void submit(event)}
      >
        <div class="task-category-editor__meta">
          <div class="task-field">
            <label for="task-category-name">Category name</label>
            <input
              ref={nameRef}
              id="task-category-name"
              type="text"
              value={name}
              maxLength={100}
              autoComplete="off"
              aria-invalid={submitted && Boolean(errors.name)}
              aria-describedby={submitted && errors.name ? 'task-category-name-error' : undefined}
              onInput={(event) => setName(event.currentTarget.value)}
            />
            {submitted && errors.name ? (
              <span id="task-category-name-error" class="task-field__error" role="alert">
                {errors.name}
              </span>
            ) : (
              <span class="task-field__hint">Use a concise workflow or partnership name.</span>
            )}
          </div>

          <fieldset class="task-colour-picker">
            <legend>Accent colour</legend>
            <div class="task-colour-picker__options">
              {COLOURS.map((option) => (
                <label key={option.value} class="task-colour-option" data-colour={option.value}>
                  <input
                    type="radio"
                    name="task-category-colour"
                    value={option.value}
                    checked={colour === option.value}
                    onChange={() => setColour(option.value)}
                  />
                  <span class="task-colour-option__swatch" aria-hidden="true" />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <section class="task-category-editor__sites" aria-labelledby="task-sites-heading">
          <header>
            <div>
              <h3 id="task-sites-heading">Sites</h3>
              <p>URLs are optional. Configured links must use credential-free HTTPS.</p>
            </div>
            <Button
              size="small"
              variant="secondary"
              leadingIcon={<PlusIcon size={15} />}
              onClick={addSite}
              disabled={pending}
            >
              Add site
            </Button>
          </header>

          <div class="task-site-editor-list">
            {sites.map((site, index) => {
              const siteErrors = errors.sites[site.id];
              const nameErrorId = `task-site-${site.id}-name-error`;
              const urlErrorId = `task-site-${site.id}-url-error`;

              return (
                <div class="task-site-editor-row" key={site.id}>
                  <span class="task-site-editor-row__index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div class="task-field">
                    <label for={`task-site-${site.id}-name`}>Site name</label>
                    <input
                      id={`task-site-${site.id}-name`}
                      data-task-site-name={site.id}
                      type="text"
                      value={site.name}
                      maxLength={100}
                      autoComplete="off"
                      placeholder="Site name"
                      aria-invalid={submitted && Boolean(siteErrors?.name)}
                      aria-describedby={submitted && siteErrors?.name ? nameErrorId : undefined}
                      onInput={(event) => updateSite(site.id, 'name', event.currentTarget.value)}
                    />
                    {submitted && siteErrors?.name ? (
                      <span id={nameErrorId} class="task-field__error" role="alert">
                        {siteErrors.name}
                      </span>
                    ) : null}
                  </div>
                  <div class="task-field task-field--url">
                    <label for={`task-site-${site.id}-url`}>HTTPS URL</label>
                    <input
                      id={`task-site-${site.id}-url`}
                      type="url"
                      value={site.url}
                      maxLength={2048}
                      autoComplete="off"
                      spellcheck={false}
                      placeholder="https://example.com"
                      aria-invalid={submitted && Boolean(siteErrors?.url)}
                      aria-describedby={submitted && siteErrors?.url ? urlErrorId : undefined}
                      onInput={(event) => updateSite(site.id, 'url', event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Tab' && !event.shiftKey && index === sites.length - 1) {
                          event.preventDefault();
                          addSite();
                        }
                      }}
                    />
                    {submitted && siteErrors?.url ? (
                      <span id={urlErrorId} class="task-field__error" role="alert">
                        {siteErrors.url}
                      </span>
                    ) : null}
                  </div>
                  <button
                    class="task-site-editor-row__remove"
                    type="button"
                    aria-label={`Remove ${site.name.trim() || `site row ${index + 1}`}`}
                    title="Remove site row"
                    onClick={() => removeSite(site.id)}
                    disabled={pending}
                  >
                    <TrashIcon size={17} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </form>
    </Dialog>
  );
}

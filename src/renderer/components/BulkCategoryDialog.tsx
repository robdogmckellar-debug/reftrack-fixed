import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import type {
  RendererTaskCategory,
  RendererTaskSite,
} from '../../shared/view-model/renderer-snapshot';
import { Button } from '../design-system/Button';
import { Dialog } from '../design-system/Dialog';

interface BulkCategoryDialogProps {
  open: boolean;
  sites: readonly RendererTaskSite[];
  categories: readonly RendererTaskCategory[];
  pending: boolean;
  onClose(): void;
  onApply(categoryIds: string[], newCategoryName: string): void;
}

export function BulkCategoryDialog({
  open,
  sites,
  categories,
  pending,
  onClose,
  onApply,
}: BulkCategoryDialogProps): JSX.Element {
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<ReadonlySet<string>>(new Set());
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedCategoryIds(new Set());
    setNewCategoryName('');
  }, [open, sites]);

  const cleanNewCategoryName = newCategoryName.trim();
  const canApply =
    sites.length > 0 && (selectedCategoryIds.size > 0 || cleanNewCategoryName.length > 0);
  const selectedNames = useMemo(
    () =>
      sites
        .slice(0, 4)
        .map((site) => site.name)
        .join(', '),
    [sites],
  );

  const toggleCategory = (categoryId: string, selected: boolean): void => {
    setSelectedCategoryIds((current) => {
      const next = new Set(current);
      if (selected) next.add(categoryId);
      else next.delete(categoryId);
      return next;
    });
  };

  return (
    <Dialog
      open={open}
      title={`Add ${sites.length} site${sites.length === 1 ? '' : 's'} to categories`}
      description={
        sites.length > 4
          ? `${selectedNames}, and ${sites.length - 4} more`
          : selectedNames || 'Choose sites before adding category memberships.'
      }
      onClose={() => {
        if (!pending) onClose();
      }}
      closeOnBackdrop={!pending}
      footer={
        <>
          <Button variant="quiet" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            pending={pending}
            disabled={!canApply}
            onClick={() => onApply([...selectedCategoryIds], cleanNewCategoryName)}
          >
            Add to categories
          </Button>
        </>
      }
    >
      <div class="bulk-category-dialog">
        <fieldset>
          <legend>Existing categories</legend>
          {categories.length ? (
            <div class="bulk-category-dialog__list">
              {categories.map((category) => {
                const existingCount = sites.filter((site) =>
                  category.sites.some((candidate) => candidate.id === site.id),
                ).length;
                return (
                  <label key={category.id}>
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.has(category.id)}
                      disabled={pending || existingCount === sites.length}
                      onChange={(event) => toggleCategory(category.id, event.currentTarget.checked)}
                    />
                    <span>
                      <strong>{category.name}</strong>
                      <small>
                        {existingCount === sites.length
                          ? 'Already contains every selected site'
                          : existingCount > 0
                            ? `${existingCount} already present`
                            : `${category.sites.length} site${category.sites.length === 1 ? '' : 's'}`}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p class="bulk-category-dialog__empty">No categories yet.</p>
          )}
        </fieldset>

        <label class="bulk-category-dialog__new" htmlFor="bulk-category-new-name">
          <span>New category</span>
          <input
            id="bulk-category-new-name"
            type="text"
            maxLength={100}
            value={newCategoryName}
            disabled={pending}
            placeholder="Optional category name"
            onInput={(event) => setNewCategoryName(event.currentTarget.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}

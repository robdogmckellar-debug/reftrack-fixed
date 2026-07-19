import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';

import type { RendererPayoutEntry } from '../../../shared/view-model/renderer-snapshot';
import { publishSnapshot, rendererSnapshot } from '../../app/store';
import { CalendarIcon, CheckIcon, EarningsIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { Button } from '../../design-system/Button';
import { Dialog } from '../../design-system/Dialog';
import { formatCurrency } from '../../lib/format';
import { errorMessage, unwrapIpcResult } from '../../lib/ipc-result';
import { localDateKey } from '../dashboard/link-format';
import { buildPayoutModel, type PayoutStatus } from './payouts-model';

type LedgerFilter = 'attention' | 'pending' | 'paid' | 'all';

interface PayoutDraft {
  id: string | null;
  siteId: string;
  amount: string;
  expectedDate: string;
  paidAt: string | null;
  note: string;
}

function createDraft(siteId: string): PayoutDraft {
  return {
    id: null,
    siteId,
    amount: '',
    expectedDate: localDateKey(),
    paidAt: null,
    note: '',
  };
}

function entryToDraft(entry: RendererPayoutEntry): PayoutDraft {
  return {
    id: entry.id,
    siteId: entry.siteId,
    amount: entry.amount.toFixed(2),
    expectedDate: entry.expectedDate,
    paidAt: entry.paidAt,
    note: entry.note,
  };
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function statusLabel(status: PayoutStatus): string {
  if (status === 'paid') return 'Received';
  if (status === 'overdue') return 'Overdue';
  return 'Expected';
}

export function PayoutsScreen({ active }: { active: boolean }): JSX.Element {
  const snapshot = rendererSnapshot.value;
  const today = localDateKey();
  const model = useMemo(
    () => (snapshot ? buildPayoutModel(snapshot, today) : null),
    [snapshot, today],
  );
  const availableSites = snapshot?.sites ?? [];
  const [filter, setFilter] = useState<LedgerFilter>('attention');
  const [draft, setDraft] = useState<PayoutDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RendererPayoutEntry | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; message: string } | null>(
    null,
  );

  const visibleEntries = (model?.entries ?? []).filter((entry) => {
    if (filter === 'all') return true;
    if (filter === 'attention') return entry.status === 'overdue';
    return filter === 'paid' ? entry.status === 'paid' : entry.status !== 'paid';
  });

  const openNew = (): void => setDraft(createDraft(availableSites[0]?.id ?? ''));

  const save = async (): Promise<void> => {
    if (!draft || saving) return;
    const amount = Number(draft.amount);
    if (
      !draft.siteId ||
      !draft.expectedDate ||
      !/^\d+(?:\.\d{1,2})?$/.test(draft.amount) ||
      amount <= 0
    ) {
      setFeedback({
        tone: 'danger',
        message: 'Choose a site, positive amount, and expected date.',
      });
      return;
    }

    setSaving(true);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.payouts.upsert({
          id: draft.id,
          siteId: draft.siteId,
          amountCents: Math.round(amount * 100),
          expectedDate: draft.expectedDate,
          paidAt: draft.paidAt,
          occurredAt: new Date().toISOString(),
          note: draft.note.trim(),
        }),
      );
      publishSnapshot(response.snapshot);
      setDraft(null);
      setFeedback({ tone: 'success', message: draft.id ? 'Payout updated.' : 'Payout added.' });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message: errorMessage(error, 'The payout could not be saved.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleReceived = async (entry: RendererPayoutEntry): Promise<void> => {
    if (pendingId) return;
    setPendingId(entry.id);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.payouts.upsert({
          id: entry.id,
          siteId: entry.siteId,
          amountCents: Math.round(entry.amount * 100),
          expectedDate: entry.expectedDate,
          paidAt: entry.paidAt ? null : new Date().toISOString(),
          occurredAt: entry.createdAt,
          note: entry.note,
        }),
      );
      publishSnapshot(response.snapshot);
      setFeedback({
        tone: 'success',
        message: entry.paidAt ? 'Payout returned to pending.' : 'Payout marked as received.',
      });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message: errorMessage(error, 'The payout could not be updated.'),
      });
    } finally {
      setPendingId(null);
    }
  };

  const remove = async (): Promise<void> => {
    if (!deleteTarget || pendingId) return;
    setPendingId(deleteTarget.id);
    try {
      const response = unwrapIpcResult(
        await window.reftrack.payouts.delete({ payoutId: deleteTarget.id }),
      );
      publishSnapshot(response.snapshot);
      setDeleteTarget(null);
      setFeedback({ tone: 'success', message: 'Payout entry deleted.' });
    } catch (error) {
      setDeleteTarget(null);
      setFeedback({
        tone: 'danger',
        message: errorMessage(error, 'The payout could not be deleted.'),
      });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section
      id="tab-payouts"
      class="payouts-screen"
      role="tabpanel"
      aria-labelledby="payouts-title"
      hidden={!active}
      tabIndex={0}
    >
      <header class="payouts-header">
        <div>
          <span class="payouts-eyebrow">Income reconciliation</span>
          <h1 id="payouts-title">
            <EarningsIcon size={21} /> Payouts
          </h1>
          <p>Compare recorded earnings with payments actually received.</p>
        </div>
        <Button
          variant="primary"
          leadingIcon={<PlusIcon size={16} />}
          disabled={availableSites.length === 0}
          onClick={openNew}
        >
          Add payout
        </Button>
      </header>

      {feedback ? (
        <div
          class={`payouts-feedback is-${feedback.tone}`}
          role={feedback.tone === 'danger' ? 'alert' : 'status'}
        >
          {feedback.message}
        </div>
      ) : null}

      <section class="payouts-summary" aria-label="Payout summary">
        {[
          ['Recorded earnings', model?.recordedEarnings ?? 0],
          ['Received', model?.received ?? 0],
          ['Outstanding', model?.outstanding ?? 0],
          ['Expected payouts', model?.pending ?? 0],
        ].map(([label, value]) => (
          <div key={label as string}>
            <span>{label}</span>
            <strong>{formatCurrency(value as number)}</strong>
          </div>
        ))}
      </section>

      {(model?.overdueCount ?? 0) > 0 || (model?.thresholdCount ?? 0) > 0 ? (
        <section class="payouts-alerts" aria-label="Payout alerts">
          {(model?.overdueCount ?? 0) > 0 ? (
            <div class="is-overdue">
              <CalendarIcon size={18} />
              <strong>
                {model?.overdueCount} overdue payout{model?.overdueCount === 1 ? '' : 's'}
              </strong>
            </div>
          ) : null}
          {(model?.thresholdCount ?? 0) > 0 ? (
            <div class="is-threshold">
              <EarningsIcon size={18} />
              <strong>
                {model?.thresholdCount} site{model?.thresholdCount === 1 ? '' : 's'} ready for
                payout
              </strong>
            </div>
          ) : null}
        </section>
      ) : null}

      <div class="payouts-layout">
        <section class="payouts-ledger" aria-labelledby="payout-ledger-title">
          <header>
            <div>
              <span class="payouts-eyebrow">Ledger</span>
              <h2 id="payout-ledger-title">Expected and received</h2>
            </div>
            <div class="payouts-filter" role="group" aria-label="Filter payouts">
              {(['attention', 'pending', 'paid', 'all'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  class={filter === value ? 'is-selected' : ''}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {value === 'attention' ? 'Overdue' : value[0]?.toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </header>

          {visibleEntries.length ? (
            <div class="payouts-table" role="table" aria-label="Payout ledger">
              <div class="payouts-table__header" role="row">
                <span role="columnheader">Site</span>
                <span role="columnheader">Amount</span>
                <span role="columnheader">Due</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Actions</span>
              </div>
              {visibleEntries.map((entry) => (
                <div key={entry.id} class={`payouts-table__row is-${entry.status}`} role="row">
                  <div role="cell">
                    <strong>{entry.siteName}</strong>
                    {entry.note ? <small>{entry.note}</small> : null}
                  </div>
                  <strong role="cell">{formatCurrency(entry.amount)}</strong>
                  <span role="cell">{formatDate(entry.expectedDate)}</span>
                  <span role="cell" class="payouts-status">
                    {statusLabel(entry.status)}
                  </span>
                  <div role="cell" class="payouts-row-actions">
                    <Button
                      size="small"
                      variant="quiet"
                      disabled={pendingId !== null}
                      onClick={() => setDraft(entryToDraft(entry))}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      variant={entry.paidAt ? 'quiet' : 'secondary'}
                      leadingIcon={entry.paidAt ? undefined : <CheckIcon size={14} />}
                      pending={pendingId === entry.id}
                      onClick={() => void toggleReceived(entry)}
                    >
                      {entry.paidAt ? 'Undo received' : 'Mark received'}
                    </Button>
                    <button
                      type="button"
                      aria-label={`Delete payout for ${entry.siteName}`}
                      disabled={pendingId !== null}
                      onClick={() => setDeleteTarget(entry)}
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div class="payouts-empty">
              <EarningsIcon size={30} />
              <strong>No payouts in this view</strong>
              <p>Add an expected payout or choose another filter.</p>
            </div>
          )}
        </section>

        <aside class="payouts-sites" aria-labelledby="payout-sites-title">
          <header>
            <span class="payouts-eyebrow">Balances</span>
            <h2 id="payout-sites-title">By site</h2>
          </header>
          {model?.sites.map((summary) => (
            <div key={summary.site.id} class={summary.thresholdReached ? 'is-ready' : ''}>
              <header>
                <strong>{summary.site.name}</strong>
                {summary.thresholdReached ? <span>Ready</span> : null}
              </header>
              <dl>
                <dt>Outstanding</dt>
                <dd>{formatCurrency(summary.outstanding)}</dd>
                <dt>Received</dt>
                <dd>{formatCurrency(summary.received)}</dd>
              </dl>
              {summary.threshold > 0 ? (
                <div class="payouts-threshold">
                  <span
                    style={{
                      width: `${Math.min(100, (summary.outstanding / summary.threshold) * 100)}%`,
                    }}
                  />
                  <small>{formatCurrency(summary.threshold)} threshold</small>
                </div>
              ) : (
                <small>No payout threshold set</small>
              )}
            </div>
          ))}
        </aside>
      </div>

      <Dialog
        open={draft !== null}
        title={draft?.id ? 'Edit payout' : 'Add expected payout'}
        description="Track when earnings should arrive, then mark them received."
        closeOnBackdrop={!saving}
        onClose={() => {
          if (!saving) setDraft(null);
        }}
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" pending={saving} onClick={() => void save()}>
              {draft?.id ? 'Save changes' : 'Add payout'}
            </Button>
          </>
        }
      >
        {draft ? (
          <form
            class="payout-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              <span>Site</span>
              <select
                value={draft.siteId}
                onChange={(event) => setDraft({ ...draft, siteId: event.currentTarget.value })}
              >
                {availableSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Amount</span>
              <span class="payout-dialog__money">
                <span>$</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={draft.amount}
                  onInput={(event) => setDraft({ ...draft, amount: event.currentTarget.value })}
                />
              </span>
            </label>
            <label>
              <span>Expected date</span>
              <input
                type="date"
                required
                value={draft.expectedDate}
                onInput={(event) => setDraft({ ...draft, expectedDate: event.currentTarget.value })}
              />
            </label>
            <label class="is-full">
              <span>Note</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={draft.note}
                placeholder="Reference number, payment method, or follow-up details"
                onInput={(event) => setDraft({ ...draft, note: event.currentTarget.value })}
              />
            </label>
          </form>
        ) : null}
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        title="Delete payout entry?"
        description="This removes the ledger entry but does not change recorded earnings."
        closeOnBackdrop={pendingId === null}
        onClose={() => {
          if (!pendingId) setDeleteTarget(null);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={pendingId !== null}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              pending={pendingId === deleteTarget?.id}
              onClick={() => void remove()}
            >
              Delete entry
            </Button>
          </>
        }
      >
        <p>
          {deleteTarget
            ? `${formatCurrency(deleteTarget.amount)} for ${availableSites.find((site) => site.id === deleteTarget.siteId)?.name ?? 'this site'}`
            : ''}
        </p>
      </Dialog>
    </section>
  );
}

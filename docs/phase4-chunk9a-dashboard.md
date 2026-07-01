# Phase 4, Chunk 9A — Preact Dashboard

## Scope

This increment replaces the active Dashboard implementation with typed Preact components and fine-grained Signals state. Site Editor, Statistics, Settings, and Daily Tasks remain on the transitional renderer and are intentionally unchanged.

## Architecture

The application now mounts two renderer surfaces inside one workspace:

- `DashboardScreen` is the production Preact Dashboard panel.
- `LegacyScreenHost` continues to host the remaining four screens.

The former Dashboard markup remains hidden as `legacy-tab-dashboard` only to avoid coupling this increment to unrelated legacy callbacks. It is never exposed as the active `tab-dashboard` panel. The active panel ID now belongs exclusively to the Preact Dashboard.

The legacy renderer subscribes to the canonical renderer snapshot, so Dashboard commands immediately propagate to Statistics, Site Editor, Settings, and Daily Tasks without restoring whole-state writes.

## Fine-grained renderer state

`dashboard-store.ts` reconciles each returned canonical snapshot into:

- A stable ordered site-ID signal.
- One signal per site.
- One current-day metrics signal per site.
- A bounded activity signal.
- A summary signal.
- Independent pending-action signals.

Unchanged sites and daily metrics retain their current signal values. A copy or success on one site therefore does not rebuild every site card or rebind event listeners.

The Dashboard performs no `innerHTML` rendering and uses no manual event binding.

## Component structure

- `DashboardScreen` — command orchestration, filters, midnight rollover, notifications, and layout.
- `SummaryStrip` — five headline metrics.
- `SiteCard` — one independently reactive site with semantic progress and direct actions.
- `ActivityFeed` — bounded recent activity with full timestamps and a clear action.
- `DashboardFeedback` — live-region toasts and precise success undo.

## Behaviour retained

- Referral text order remains prefix, URL, date/time, suffix.
- Existing date and Unix timestamp formats remain supported.
- Daily copy limits and unlimited-copy sites retain their existing rules.
- Site names still open their approved HTTPS URL through the validated main-process command.
- Success amounts, notifications, Image Cleaner orchestration, and exact-transaction undo remain unchanged.
- Historical statistics and canonical storage remain main-process owned.

## UI and accessibility changes

- Clearer summary hierarchy with readable labels and tabular monetary values.
- Three-column site grid at the normal desktop width, with responsive two- and one-column layouts.
- Text status accompanies every colour indicator.
- Proper article headings and definition lists for site metrics.
- Native buttons replace generated clickable markup.
- Daily copy progress uses a labelled semantic progress bar.
- Activity entries use real `time` elements and full date context.
- Filters expose pressed state.
- Empty states provide a direct recovery action.
- Toasts use a polite live region and have dismiss controls.
- Undo is keyboard-operable and targets the exact returned activity ID.
- Reduced-motion and Windows forced-colour modes are covered.

## Performance decisions

- No new runtime dependency was added.
- Snapshot reconciliation avoids publishing unchanged per-site values.
- Copy and Success update only the affected Signals and derived totals.
- The legacy Dashboard is hidden and no longer serves the visible workflow.
- The current compatibility bundle remains until the other four screens are replaced; removing its retired Dashboard logic is deferred until doing so cannot affect those screens.

## New production files

- `src/renderer/lib/ipc-result.ts`
- `src/renderer/screens/dashboard/DashboardScreen.tsx`
- `src/renderer/screens/dashboard/dashboard-store.ts`
- `src/renderer/screens/dashboard/link-format.ts`
- `src/renderer/screens/dashboard/components/ActivityFeed.tsx`
- `src/renderer/screens/dashboard/components/DashboardFeedback.tsx`
- `src/renderer/screens/dashboard/components/SiteCard.tsx`
- `src/renderer/screens/dashboard/components/SummaryStrip.tsx`
- `src/renderer/styles/dashboard.css`

## New tests

- `tests/renderer/dashboard-link-format.test.ts`
- `tests/renderer/dashboard-store.test.ts`
- `tests/renderer/dashboard-screen.test.tsx`

The store test verifies that changing one site does not publish new values to unrelated site and daily-metrics signals.

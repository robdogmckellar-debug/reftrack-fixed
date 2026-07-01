# Phase 4, Chunk 9C — Statistics replacement

## Scope

This chunk replaces the visible legacy Statistics screen with strict TypeScript and Preact components. Dashboard and Site Editor remain unchanged. Settings and Daily Tasks remain in the temporary compatibility renderer.

## New renderer modules

- `src/renderer/screens/statistics/StatisticsScreen.tsx`
- `src/renderer/screens/statistics/statistics-model.ts`
- `src/renderer/styles/statistics.css`

The new screen is mounted directly by `App.tsx`. `LegacyScreenHost` now treats Statistics as a native Preact screen, and all legacy Statistics markup, renderer functions, event handlers, and CSS were removed.

## Data and calculation model

Statistics continue to use the main-owned read-only renderer snapshot. No new IPC channel or persistence format was introduced.

The pure statistics model provides:

- day, month, and year totals;
- stable-site aggregation across arbitrary date ranges;
- all-time, current-year, current-month, and current-week leaderboards;
- deterministic top-three ranking with tie-break rules;
- 12-month year summaries;
- Monday-to-Sunday month calendar construction;
- monthly top earners; and
- per-day, per-site detail.

Calculations are memoised against the snapshot revision and the selected controls. Year, leaderboard, month, and day models are created only while Statistics is active. Month and day drill-down models are created only when those views are open.

## User-interface changes

The replacement keeps the existing core workflow while simplifying the hierarchy:

1. A fixed Top Sites panel provides metric and period controls.
2. A year overview presents earnings, successes, and copies followed by 12 month rows.
3. Selecting a month opens an accessible Monday-to-Sunday calendar and monthly top earners.
4. Selecting a populated day opens a per-site performance table.
5. Back controls return from day to month and from month to year.

The screen uses the existing RefTrack design tokens and dark visual identity, but increases text contrast, target size, spacing consistency, and numeric readability.

## Accessibility

- The screen is a labelled tab panel.
- Ranking controls expose pressed state.
- Month rows are semantic buttons inside a list.
- Empty and out-of-month calendar cells cannot receive focus.
- Populated calendar days have descriptive accessible names.
- Daily site performance uses table semantics.
- Year changes are announced through a polite live region.
- Focus indicators, reduced motion, and Windows forced-colour support use the shared accessibility layer.
- No status depends on colour alone.

## Behaviour retained

- Most Copied and Most Successful ranking modes
- All Time, current year, current month, and current week periods
- Previous and next year navigation
- Month, week, day, and per-site drill-down
- Historical records for sites that were later deleted
- Australian date and currency presentation

The new day detail also exposes copy counts, which were present in the data but omitted from the former daily detail panel.

## Tests added

- Pure aggregation and leap-year coverage
- Stable site-ID grouping
- Deterministic leaderboard ordering
- Non-mutating year, month, week, and day models
- Accessible screen structure and controls
- Metric switching
- Month-to-day drill-down and back navigation
- Inactive-screen calculation guard

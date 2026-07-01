import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import { rendererSnapshot } from '../../app/store';
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardIcon,
  EarningsIcon,
  StatisticsIcon,
  SuccessIcon,
  TrophyIcon,
} from '../../components/icons';
import { VisuallyHidden } from '../../design-system/VisuallyHidden';
import {
  buildDayDrilldown,
  buildLeaderboard,
  buildMonthDrilldown,
  buildYearStatistics,
  type DayDrilldown,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type MonthDrilldown,
  type StatisticsTotals,
  type YearStatistics,
} from './statistics-model';

const currencyFormatter = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integerFormatter = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

function SummaryMetrics({
  totals,
  label,
}: {
  totals: StatisticsTotals;
  label: string;
}): JSX.Element {
  return (
    <dl class="statistics-summary" aria-label={`${label} summary`}>
      <div class="statistics-summary__item statistics-summary__item--earnings">
        <dt>
          <EarningsIcon size={16} /> Earnings
        </dt>
        <dd>{formatCurrency(totals.earnings)}</dd>
      </div>
      <div class="statistics-summary__item statistics-summary__item--successes">
        <dt>
          <SuccessIcon size={16} /> Successes
        </dt>
        <dd>{formatInteger(totals.successes)}</dd>
      </div>
      <div class="statistics-summary__item statistics-summary__item--copies">
        <dt>
          <ClipboardIcon size={16} /> Copies
        </dt>
        <dd>{formatInteger(totals.copies)}</dd>
      </div>
    </dl>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}): JSX.Element {
  return (
    <div class="statistics-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          class={value === option.value ? 'is-selected' : undefined}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function RankMark({ rank }: { rank: number }): JSX.Element {
  return (
    <span class={`statistics-rank statistics-rank--${rank}`} aria-label={`Rank ${rank}`}>
      {rank}
    </span>
  );
}

function LeaderboardCard({
  entry,
  metric,
}: {
  entry: LeaderboardEntry;
  metric: LeaderboardMetric;
}): JSX.Element {
  const supportingText =
    metric === 'copies'
      ? `${formatInteger(entry.successes)} successes · ${formatCurrency(entry.earnings)}`
      : `${formatInteger(entry.copies)} copies · ${formatCurrency(entry.earnings)}`;

  return (
    <li class="statistics-leaderboard__entry">
      <RankMark rank={entry.rank} />
      <div class="statistics-leaderboard__identity">
        <div class="statistics-leaderboard__name">{entry.name}</div>
        <div class="statistics-leaderboard__support">{supportingText}</div>
        <div
          class="statistics-progress"
          role="progressbar"
          aria-label={`${entry.name} relative ${metric}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={entry.percentage}
        >
          <span style={{ width: `${entry.percentage}%` }} />
        </div>
      </div>
      <strong class="statistics-leaderboard__value">{formatInteger(entry.value)}</strong>
    </li>
  );
}

function LeaderboardPanel({
  entries,
  metric,
  period,
  onMetricChange,
  onPeriodChange,
}: {
  entries: readonly LeaderboardEntry[];
  metric: LeaderboardMetric;
  period: LeaderboardPeriod;
  onMetricChange: (metric: LeaderboardMetric) => void;
  onPeriodChange: (period: LeaderboardPeriod) => void;
}): JSX.Element {
  return (
    <aside class="statistics-leaderboard" aria-labelledby="statistics-leaderboard-title">
      <header class="statistics-panel-heading">
        <span class="statistics-panel-heading__icon statistics-panel-heading__icon--gold">
          <TrophyIcon size={18} />
        </span>
        <div>
          <span class="statistics-eyebrow">Ranking</span>
          <h2 id="statistics-leaderboard-title">Top sites</h2>
        </div>
      </header>

      <div class="statistics-leaderboard__controls">
        <SegmentedControl
          label="Leaderboard metric"
          value={metric}
          options={[
            { value: 'copies', label: 'Most copied' },
            { value: 'successes', label: 'Most successful' },
          ]}
          onChange={onMetricChange}
        />
        <SegmentedControl
          label="Leaderboard period"
          value={period}
          options={[
            { value: 'alltime', label: 'All time' },
            { value: 'yearly', label: 'Year' },
            { value: 'monthly', label: 'Month' },
            { value: 'weekly', label: 'Week' },
          ]}
          onChange={onPeriodChange}
        />
      </div>

      {entries.length ? (
        <ol class="statistics-leaderboard__list">
          {entries.map((entry) => (
            <LeaderboardCard key={entry.siteId} entry={entry} metric={metric} />
          ))}
        </ol>
      ) : (
        <div class="statistics-empty statistics-empty--compact">
          <TrophyIcon size={28} />
          <strong>No ranked sites yet</strong>
          <p>Copy or record a success to populate this period.</p>
        </div>
      )}
    </aside>
  );
}

function YearNavigation({
  year,
  onPrevious,
  onNext,
}: {
  year: number;
  onPrevious: () => void;
  onNext: () => void;
}): JSX.Element {
  return (
    <div class="statistics-year-navigation" aria-label="Statistics year">
      <button type="button" onClick={onPrevious} aria-label={`Show ${year - 1}`}>
        <ChevronLeftIcon size={18} />
      </button>
      <span aria-live="polite">{year}</span>
      <button type="button" onClick={onNext} aria-label={`Show ${year + 1}`}>
        <ChevronRightIcon size={18} />
      </button>
    </div>
  );
}

function YearOverview({
  model,
  onOpenMonth,
}: {
  model: YearStatistics;
  onOpenMonth: (month: number) => void;
}): JSX.Element {
  return (
    <div class="statistics-view statistics-year-view">
      <SummaryMetrics totals={model.totals} label={`${model.year}`} />
      <ul class="statistics-month-list" aria-label={`Months in ${model.year}`}>
        {model.months.map((month) => (
          <li key={month.month}>
            <button
              type="button"
              class={`statistics-month-row${month.hasData ? ' has-data' : ''}`}
              aria-label={`${month.name}: ${formatCurrency(month.totals.earnings)}, ${formatInteger(month.totals.successes)} successes, ${formatInteger(month.totals.copies)} copies`}
              onClick={() => onOpenMonth(month.month)}
            >
              <span class="statistics-month-row__name">{month.name}</span>
              <span class="statistics-month-row__bar" aria-hidden="true">
                <span style={{ width: `${month.earningsPercentage}%` }} />
              </span>
              <span class="statistics-month-row__earnings">
                {formatCurrency(month.totals.earnings)}
              </span>
              <span class="statistics-month-row__count">
                {formatInteger(month.totals.successes)} successes
              </span>
              <span class="statistics-month-row__copies">
                {formatInteger(month.totals.copies)} copies
              </span>
              <ChevronRightIcon size={17} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContextTopSites({ model }: { model: MonthDrilldown }): JSX.Element | null {
  if (!model.topSites.length) return null;
  return (
    <section class="statistics-context" aria-labelledby="statistics-context-title">
      <div class="statistics-context__heading">
        <span class="statistics-eyebrow">Top earners</span>
        <h3 id="statistics-context-title">{model.name} leaders</h3>
      </div>
      <ol class="statistics-context__list">
        {model.topSites.map((site, index) => (
          <li key={site.siteId}>
            <RankMark rank={index + 1} />
            <span>{site.name}</span>
            <strong>{formatCurrency(site.earnings)}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MonthView({
  model,
  onBack,
  onOpenDay,
}: {
  model: MonthDrilldown;
  onBack: () => void;
  onOpenDay: (dateKey: string) => void;
}): JSX.Element {
  return (
    <div class="statistics-view statistics-month-view">
      <div class="statistics-drill-header">
        <button type="button" class="statistics-back-button" onClick={onBack}>
          <ChevronLeftIcon size={17} />
          <span>Year overview</span>
        </button>
        <div>
          <span class="statistics-eyebrow">Monthly detail</span>
          <h2>{model.name}</h2>
        </div>
      </div>

      <SummaryMetrics totals={model.totals} label={`${model.name} ${model.year}`} />
      <ContextTopSites model={model} />

      <div class="statistics-weeks" aria-label={`${model.name} ${model.year} calendar`}>
        {model.weeks.map((week) => (
          <section key={week.id} class="statistics-week" aria-labelledby={`${week.id}-title`}>
            <header class="statistics-week__header">
              <h3 id={`${week.id}-title`}>{week.label}</h3>
              <span>{formatCurrency(week.totals.earnings)}</span>
              <span>{formatInteger(week.totals.successes)} successes</span>
            </header>
            <div class="statistics-week__days">
              {week.days.map((day) => {
                const disabled = day.outsideMonth || !day.hasData;
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    class={`statistics-day${day.today ? ' is-today' : ''}${day.outsideMonth ? ' is-outside' : ''}${day.hasData ? ' has-data' : ''}`}
                    disabled={disabled}
                    aria-label={
                      day.outsideMonth
                        ? `${day.dayName} ${day.dayNumber}, outside selected month`
                        : `${day.dayName} ${day.dayNumber}: ${formatCurrency(day.totals.earnings)}, ${formatInteger(day.totals.successes)} successes, ${formatInteger(day.totals.copies)} copies`
                    }
                    onClick={() => onOpenDay(day.dateKey)}
                  >
                    <span class="statistics-day__name">{day.dayName}</span>
                    <span class="statistics-day__number">{day.dayNumber}</span>
                    {day.hasData ? (
                      <>
                        <strong>{formatCurrency(day.totals.earnings)}</strong>
                        <span>{formatInteger(day.totals.successes)} success</span>
                      </>
                    ) : (
                      <span class="statistics-day__empty" aria-hidden="true">
                        —
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function DayView({ model, onBack }: { model: DayDrilldown; onBack: () => void }): JSX.Element {
  return (
    <div class="statistics-view statistics-day-view">
      <div class="statistics-drill-header">
        <button type="button" class="statistics-back-button" onClick={onBack}>
          <ChevronLeftIcon size={17} />
          <span>Month calendar</span>
        </button>
        <div>
          <span class="statistics-eyebrow">Daily detail</span>
          <h2>{model.label}</h2>
        </div>
      </div>

      <SummaryMetrics totals={model.totals} label={model.label} />

      <section class="statistics-day-sites" aria-labelledby="statistics-day-sites-title">
        <header>
          <div>
            <span class="statistics-eyebrow">Performance</span>
            <h3 id="statistics-day-sites-title">Sites for this day</h3>
          </div>
          <span>{model.sites.length} recorded</span>
        </header>

        {model.sites.length ? (
          <div
            class="statistics-day-table"
            role="table"
            aria-label={`Site performance for ${model.label}`}
          >
            <div class="statistics-day-table__header" role="row">
              <span role="columnheader">Rank</span>
              <span role="columnheader">Site</span>
              <span role="columnheader">Earnings</span>
              <span role="columnheader">Successes</span>
              <span role="columnheader">Copies</span>
            </div>
            {model.sites.map((site) => (
              <div key={site.siteId} class="statistics-day-table__row" role="row">
                <span role="cell">
                  <RankMark rank={site.rank} />
                </span>
                <strong role="cell">{site.name}</strong>
                <span role="cell" class="is-earnings">
                  {formatCurrency(site.earnings)}
                </span>
                <span role="cell">{formatInteger(site.successes)}</span>
                <span role="cell">{formatInteger(site.copies)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div class="statistics-empty">
            <CalendarIcon size={30} />
            <strong>No activity recorded</strong>
            <p>This date has no site-level statistics.</p>
          </div>
        )}
      </section>
    </div>
  );
}

export function StatisticsScreen({ active }: { active: boolean }): JSX.Element {
  const snapshot = rendererSnapshot.value;
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [metric, setMetric] = useState<LeaderboardMetric>('copies');
  const [period, setPeriod] = useState<LeaderboardPeriod>('alltime');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    if (!active) return;
    let timer = 0;

    const refreshDate = (): void => setToday(new Date());
    const scheduleMidnight = (): void => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      timer = window.setTimeout(
        () => {
          refreshDate();
          scheduleMidnight();
        },
        Math.max(1000, nextMidnight.getTime() - now.getTime()),
      );
    };
    const handleVisibility = (): void => {
      if (!document.hidden) refreshDate();
    };

    refreshDate();
    scheduleMidnight();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [active]);

  const revision = snapshot?.revision ?? -1;
  const yearModel = useMemo(
    () => (active && snapshot ? buildYearStatistics(snapshot, year) : null),
    [active, revision, snapshot, year],
  );
  const leaderboard = useMemo(
    () => (active && snapshot ? buildLeaderboard(snapshot, metric, period, today) : []),
    [active, metric, period, revision, snapshot, today],
  );
  const monthModel = useMemo(
    () =>
      active && snapshot && selectedMonth !== null
        ? buildMonthDrilldown(snapshot, year, selectedMonth, today)
        : null,
    [active, revision, selectedMonth, snapshot, today, year],
  );
  const dayModel = useMemo(
    () => (active && snapshot && selectedDay ? buildDayDrilldown(snapshot, selectedDay) : null),
    [active, revision, selectedDay, snapshot],
  );

  const changeYear = (nextYear: number): void => {
    setYear(nextYear);
    setSelectedMonth(null);
    setSelectedDay(null);
  };

  return (
    <section
      id="tab-statistics"
      class="statistics-screen"
      role="tabpanel"
      aria-labelledby="statistics-screen-title"
      tabIndex={0}
      hidden={!active}
    >
      <header class="statistics-screen__header">
        <div class="statistics-screen__title">
          <span class="statistics-screen__icon">
            <StatisticsIcon size={20} />
          </span>
          <div>
            <span class="statistics-eyebrow">Performance history</span>
            <h1 id="statistics-screen-title">Statistics</h1>
            <p>Explore earnings, successes, and copy activity without losing historical data.</p>
          </div>
        </div>
        <YearNavigation
          year={year}
          onPrevious={() => changeYear(year - 1)}
          onNext={() => changeYear(year + 1)}
        />
      </header>

      <div class="statistics-screen__body">
        <LeaderboardPanel
          entries={leaderboard}
          metric={metric}
          period={period}
          onMetricChange={setMetric}
          onPeriodChange={setPeriod}
        />

        <main class="statistics-analysis" aria-label="Statistics detail">
          {!snapshot || !yearModel ? (
            <div class="statistics-empty">
              <StatisticsIcon size={32} />
              <strong>Statistics are unavailable</strong>
              <p>RefTrack has not loaded a data snapshot yet.</p>
            </div>
          ) : dayModel ? (
            <DayView model={dayModel} onBack={() => setSelectedDay(null)} />
          ) : monthModel ? (
            <MonthView
              model={monthModel}
              onBack={() => setSelectedMonth(null)}
              onOpenDay={setSelectedDay}
            />
          ) : (
            <YearOverview model={yearModel} onOpenMonth={setSelectedMonth} />
          )}
        </main>
      </div>
      <VisuallyHidden>
        Leaderboard periods use the current calendar week, month, and year. The year selector
        controls the detailed monthly history.
      </VisuallyHidden>
    </section>
  );
}

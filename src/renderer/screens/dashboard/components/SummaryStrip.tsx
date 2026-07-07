import type { ComponentType, JSX } from 'preact';

import { ClipboardIcon, EarningsIcon, SuccessIcon } from '../../../components/icons';
import { formatCurrency } from '../../../lib/format';
import { dashboardSummary } from '../dashboard-store';

interface SummaryMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: 'success' | 'primary' | 'warning' | 'accent' | 'info';
  icon: ComponentType<{ size?: number }>;
}

export function SummaryStrip(): JSX.Element {
  const summary = dashboardSummary.value;
  const metrics: readonly SummaryMetric[] = [
    {
      id: 'today-earnings',
      label: "Today's earnings",
      value: formatCurrency(summary.todayEarnings),
      detail: 'Recorded today',
      tone: 'success',
      icon: EarningsIcon,
    },
    {
      id: 'today-successes',
      label: "Today's successes",
      value: String(summary.todaySuccesses),
      detail: summary.todaySuccesses === 1 ? 'Successful redeposit' : 'Successful redeposits',
      tone: 'primary',
      icon: SuccessIcon,
    },
    {
      id: 'lifetime-earnings',
      label: 'Lifetime earnings',
      value: formatCurrency(summary.lifetimeEarnings),
      detail: 'Across all sites',
      tone: 'warning',
      icon: EarningsIcon,
    },
    {
      id: 'lifetime-successes',
      label: 'Lifetime successes',
      value: String(summary.lifetimeSuccesses),
      detail: 'Across all history',
      tone: 'accent',
      icon: SuccessIcon,
    },
    {
      id: 'today-copies',
      label: "Today's copies",
      value: String(summary.todayCopies),
      detail: summary.todayCopies === 1 ? 'Referral copied' : 'Referrals copied',
      tone: 'info',
      icon: ClipboardIcon,
    },
  ];

  return (
    <section class="dashboard-summary" aria-label="Dashboard summary">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div
            key={metric.id}
            class={`dashboard-summary__metric dashboard-summary__metric--${metric.tone}`}
          >
            <span class="dashboard-summary__icon" aria-hidden="true">
              <Icon size={17} />
            </span>
            <span class="dashboard-summary__copy">
              <span class="dashboard-summary__label">{metric.label}</span>
              <strong class="dashboard-summary__value">{metric.value}</strong>
              <span class="dashboard-summary__detail">{metric.detail}</span>
            </span>
          </div>
        );
      })}
    </section>
  );
}

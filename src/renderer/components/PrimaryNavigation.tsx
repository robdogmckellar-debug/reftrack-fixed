import type { ComponentType, JSX } from 'preact';

import { activeScreen, navigateTo, SCREEN_IDS } from '../app/store';
import type { ScreenId } from '../app/store';
import {
  DashboardIcon,
  ClipboardIcon,
  EarningsIcon,
  EditIcon,
  SettingsIcon,
  StatisticsIcon,
  TasksIcon,
} from './icons';

interface NavigationItem {
  id: ScreenId;
  label: string;
  shortLabel: string;
  icon: ComponentType<{ size?: number }>;
}

const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: DashboardIcon },
  { id: 'editor', label: 'Site Editor', shortLabel: 'Sites', icon: EditIcon },
  { id: 'share', label: 'Facebook Group Shares', shortLabel: 'Shares', icon: ClipboardIcon },
  { id: 'payouts', label: 'Payouts', shortLabel: 'Paid', icon: EarningsIcon },
  { id: 'statistics', label: 'Statistics', shortLabel: 'Stats', icon: StatisticsIcon },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: SettingsIcon },
  { id: 'tasks', label: 'Daily Tasks', shortLabel: 'Tasks', icon: TasksIcon },
];

function focusNavigationItem(screen: ScreenId): void {
  document.getElementById(`nav-${screen}`)?.focus();
}

function adjacentScreen(current: ScreenId, direction: -1 | 1): ScreenId {
  const currentIndex = SCREEN_IDS.indexOf(current);
  const nextIndex = (currentIndex + direction + SCREEN_IDS.length) % SCREEN_IDS.length;
  return SCREEN_IDS[nextIndex] ?? 'dashboard';
}

export function PrimaryNavigation(): JSX.Element {
  const selected = activeScreen.value;

  const handleKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>): void => {
    const current = event.currentTarget.dataset.tab as ScreenId | undefined;
    if (!current) return;

    let target: ScreenId | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        target = adjacentScreen(current, -1);
        break;
      case 'ArrowRight':
        target = adjacentScreen(current, 1);
        break;
      case 'Home':
        target = SCREEN_IDS[0];
        break;
      case 'End':
        target = SCREEN_IDS.at(-1) ?? 'tasks';
        break;
      default:
        return;
    }

    event.preventDefault();
    if (navigateTo(target)) queueMicrotask(() => focusNavigationItem(target));
  };

  return (
    <nav class="app-nav" aria-label="Primary">
      <div class="app-nav__list" role="tablist" aria-label="RefTrack screens">
        {NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon;
          const isSelected = selected === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              class={`tab-btn app-nav__item${isSelected ? ' active' : ''}`}
              type="button"
              role="tab"
              data-tab={item.id}
              aria-controls={`tab-${item.id}`}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              title={item.label}
              onClick={() => navigateTo(item.id)}
              onKeyDown={handleKeyDown}
            >
              <Icon size={17} />
              <span class="app-nav__label">{item.label}</span>
              <span class="app-nav__short-label" aria-hidden="true">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

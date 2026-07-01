// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { activeScreen } from '../../src/renderer/app/store';
import { PrimaryNavigation } from '../../src/renderer/components/PrimaryNavigation';

afterEach(cleanup);

beforeEach(() => {
  activeScreen.value = 'dashboard';
});

describe('PrimaryNavigation', () => {
  it('exposes one selected tab and matching panel relationships', () => {
    render(<PrimaryNavigation />);

    const dashboard = screen.getByRole('tab', { name: 'Dashboard' });
    const tasks = screen.getByRole('tab', { name: 'Daily Tasks' });

    expect(dashboard.getAttribute('aria-selected')).toBe('true');
    expect(dashboard.getAttribute('aria-controls')).toBe('tab-dashboard');
    expect(tasks.getAttribute('aria-selected')).toBe('false');
    expect(dashboard.tabIndex).toBe(0);
    expect(tasks.tabIndex).toBe(-1);
  });

  it('supports arrow, Home, and End keyboard navigation', async () => {
    render(<PrimaryNavigation />);
    const dashboard = screen.getByRole('tab', { name: 'Dashboard' });

    dashboard.focus();
    fireEvent.keyDown(dashboard, { key: 'ArrowRight' });
    await Promise.resolve();

    expect(activeScreen.value).toBe('editor');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Site Editor' }));

    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    await Promise.resolve();
    expect(activeScreen.value).toBe('tasks');

    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    await Promise.resolve();
    expect(activeScreen.value).toBe('dashboard');
  });

  it('changes screens through a normal pointer activation', () => {
    render(<PrimaryNavigation />);

    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));

    expect(activeScreen.value).toBe('settings');
    expect(screen.getByRole('tab', { name: 'Settings' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});

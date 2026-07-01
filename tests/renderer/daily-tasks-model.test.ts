import { describe, expect, it } from 'vitest';

import type {
  RendererTaskCategory,
  RendererTaskDailyState,
} from '../../src/shared/view-model/renderer-snapshot';
import {
  categoryProgress,
  categoryStatus,
  globalTaskProgress,
  isCredentialFreeHttpsUrl,
  localTaskDateKey,
  sortTaskCategories,
  taskSiteDone,
  validateTaskCategory,
} from '../../src/renderer/screens/daily-tasks/daily-tasks-model';

const categories: RendererTaskCategory[] = [
  {
    id: 'cat-a',
    name: 'Not started',
    colour: 'teal',
    sites: [{ id: 'site-a', name: 'A', url: 'https://a.example/' }],
  },
  {
    id: 'cat-b',
    name: 'In progress',
    colour: 'purple',
    sites: [
      { id: 'site-b', name: 'B', url: 'https://b.example/' },
      { id: 'site-c', name: 'C', url: 'https://c.example/' },
    ],
  },
  {
    id: 'cat-c',
    name: 'Complete',
    colour: 'green',
    sites: [{ id: 'site-d', name: 'D', url: 'https://d.example/' }],
  },
];

const dailyState: RendererTaskDailyState = {
  '2026-07-02': {
    'cat-b': { 'site-b': true, 'site-c': false },
    'cat-c': { 'site-d': true },
  },
};

describe('Daily Tasks model', () => {
  it('reads stable category/site completion and calculates local progress', () => {
    expect(taskSiteDone(dailyState, '2026-07-02', 'cat-b', 'site-b')).toBe(true);
    expect(categoryProgress(categories[1]!, dailyState, '2026-07-02')).toEqual({
      done: 1,
      total: 2,
      percent: 50,
    });
    expect(categoryStatus(categoryProgress(categories[1]!, dailyState, '2026-07-02'))).toBe(
      'in-progress',
    );
    expect(globalTaskProgress(categories, dailyState, '2026-07-02')).toEqual({
      done: 2,
      total: 4,
      percent: 50,
    });
  });

  it('auto-sorts in-progress, not-started and complete categories without mutating source order', () => {
    const sorted = sortTaskCategories(categories, dailyState, '2026-07-02', true);
    expect(sorted.map((category) => category.id)).toEqual(['cat-b', 'cat-a', 'cat-c']);
    expect(categories.map((category) => category.id)).toEqual(['cat-a', 'cat-b', 'cat-c']);
    expect(sortTaskCategories(categories, dailyState, '2026-07-02', false)).toEqual(categories);
  });

  it('uses a local yyyy-mm-dd task record key', () => {
    expect(localTaskDateKey(new Date(2026, 6, 2, 23, 30))).toBe('2026-07-02');
  });

  it('accepts optional credential-free HTTPS URLs and rejects unsafe alternatives', () => {
    expect(isCredentialFreeHttpsUrl('')).toBe(true);
    expect(isCredentialFreeHttpsUrl('https://example.com/path')).toBe(true);
    expect(isCredentialFreeHttpsUrl('http://example.com')).toBe(false);
    expect(isCredentialFreeHttpsUrl('https://user:pass@example.com')).toBe(false);
    expect(isCredentialFreeHttpsUrl('not a url')).toBe(false);
  });

  it('reports category and site validation errors without changing stable IDs', () => {
    const errors = validateTaskCategory('', [
      { id: 'stable-id', name: '', url: 'https://example.com' },
      { id: 'valid-id', name: 'Valid', url: 'http://example.com' },
    ]);
    expect(errors.name).toBeTruthy();
    expect(errors.sites['stable-id']?.name).toBeTruthy();
    expect(errors.sites['valid-id']?.url).toBeTruthy();
  });
});

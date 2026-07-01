import { describe, expect, it } from 'vitest';

import {
  categoryProgress,
  categoryStatus,
  globalTaskProgress,
  taskSiteDone,
} from '../../src/renderer/screens/daily-tasks/daily-tasks-model';

const categories = [
  {
    id: 'cat-a',
    name: 'Category A',
    colour: 'teal',
    sites: [
      { id: 'site-a', name: 'A', url: '' },
      { id: 'site-b', name: 'B', url: '' },
    ],
  },
  {
    id: 'cat-b',
    name: 'Category B',
    colour: 'green',
    sites: [{ id: 'site-c', name: 'C', url: '' }],
  },
];

const dailyState = {
  '2026-06-30': {
    'cat-a': { 'site-a': true, 'site-b': false },
    'cat-b': { 'site-c': true },
  },
};

describe('typed Daily Tasks progress', () => {
  it('reads completion by stable category and site ID', () => {
    expect(taskSiteDone(dailyState, '2026-06-30', 'cat-a', 'site-a')).toBe(true);
    expect(taskSiteDone(dailyState, '2026-06-30', 'cat-a', 'site-b')).toBe(false);
  });

  it('reports partial and completed category states', () => {
    expect(categoryProgress(categories[0], dailyState, '2026-06-30')).toEqual({
      done: 1,
      total: 2,
      percent: 50,
    });
    expect(categoryStatus(categoryProgress(categories[0], dailyState, '2026-06-30'))).toBe(
      'in-progress',
    );
    expect(categoryStatus(categoryProgress(categories[1], dailyState, '2026-06-30'))).toBe(
      'complete',
    );
  });

  it('combines every category into the global progress total', () => {
    expect(globalTaskProgress(categories, dailyState, '2026-06-30')).toEqual({
      done: 2,
      total: 3,
      percent: 67,
    });
  });
});

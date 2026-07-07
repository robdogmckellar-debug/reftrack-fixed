import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Daily Tasks category expansion', () => {
  it('auto-expands only once so users can collapse every category', () => {
    const screen = read('src/renderer/screens/daily-tasks/DailyTasksScreen.tsx');

    expect(screen).toContain('const initialExpansionApplied = useRef(false);');
    expect(screen).toContain(
      'if (initialExpansionApplied.current || sortedCategories.length === 0) return;',
    );
    expect(screen).toContain('initialExpansionApplied.current = true;');
    expect(screen).not.toContain(
      'if (expandedCategoryIds.size > 0 || sortedCategories.length === 0) return;',
    );
  });
});

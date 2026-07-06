import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Daily Tasks text-file import placement', () => {
  it('exposes text import in Daily Tasks and not in Site Editor', () => {
    const dailyTasks = read('src/renderer/screens/daily-tasks/DailyTasksScreen.tsx');
    const siteList = read('src/renderer/screens/site-editor/components/SiteList.tsx');
    const dialog = read(
      'src/renderer/screens/daily-tasks/components/TextFileImportDialog.tsx',
    );

    expect(dailyTasks).toContain('Import .txt');
    expect(dailyTasks).toContain('<TextFileImportDialog');
    expect(siteList).not.toContain('Import .txt');
    expect(dialog).toContain('name: cleanCategoryName');
    expect(dialog).toContain('window.reftrack.tasks.upsertCategory');
  });
});

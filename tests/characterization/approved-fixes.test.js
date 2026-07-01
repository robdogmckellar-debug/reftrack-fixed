import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('approved Phase 2 corrections completed through Chunk 9E', () => {
  it('uses semantic typed screens and managed dialogs without the legacy renderer', () => {
    expect(fs.existsSync(path.join(root, 'src/renderer/legacy'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/renderer/components/LegacyScreenHost.tsx'))).toBe(
      false,
    );
    const dialog = read('src/renderer/design-system/Dialog.tsx');
    const navigation = read('src/renderer/components/PrimaryNavigation.tsx');
    const tasks = read('src/renderer/screens/daily-tasks/DailyTasksScreen.tsx');
    expect(dialog).toContain('trapTabKey');
    expect(dialog).toContain("event.key === 'Escape'");
    expect(navigation).toContain('role="tablist"');
    expect(tasks).toContain('role="tabpanel"');
  });
});

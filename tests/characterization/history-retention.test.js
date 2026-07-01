import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('historical data retention', () => {
  it('caps presentation activity without deleting canonical daily history', () => {
    const dashboardStore = read('src/renderer/screens/dashboard/dashboard-store.ts');
    const commandService = read('src/main/services/application-command-service.ts');

    expect(dashboardStore).toContain('snapshot.activity.slice(0, 50)');
    expect(commandService).not.toContain('historyCutoff');
    expect(commandService).not.toContain('90 * 24 * 60 * 60');
  });
});

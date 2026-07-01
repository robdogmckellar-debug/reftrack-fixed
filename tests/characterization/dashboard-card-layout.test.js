import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('dashboard site card layout', () => {
  it('keeps the action buttons inside every card', () => {
    const rendererEntry = read('src/renderer/main.tsx');
    const layout = read('src/renderer/styles/dashboard-card-layout.css');

    expect(rendererEntry).toContain("import './styles/dashboard-card-layout.css';");
    expect(layout).toContain('grid-auto-rows: max-content;');
    expect(layout).toContain('min-height: 280px;');
    expect(layout).toContain('flex: 0 0 auto;');
  });
});

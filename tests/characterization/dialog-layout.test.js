import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('dialog viewport layout', () => {
  it('keeps the footer visible while the dialog body scrolls', () => {
    const rendererEntry = read('src/renderer/main.tsx');
    const layout = read('src/renderer/styles/dialog-layout.css');

    expect(rendererEntry).toContain("import './styles/dialog-layout.css';");
    expect(layout).toContain('grid-template-rows: auto minmax(0, 1fr) auto;');
    expect(layout).toContain('.ui-dialog__body');
    expect(layout).toContain('min-height: 0;');
  });
});

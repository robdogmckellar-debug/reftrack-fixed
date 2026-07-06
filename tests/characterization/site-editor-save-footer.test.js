import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('site editor save footer layout', () => {
  it('keeps the form actions visible while the editor body scrolls', () => {
    const siteList = read('src/renderer/screens/site-editor/components/SiteList.tsx');
    const layout = read('src/renderer/styles/site-editor-layout.css');

    expect(siteList).toContain("import '../../../styles/site-editor-layout.css';");
    expect(layout).toContain('grid-template-rows: auto minmax(0, 1fr) auto;');
    expect(layout).toContain(':has(> .site-editor-command-error)');
    expect(layout).toContain('grid-template-rows: auto auto minmax(0, 1fr) auto;');
    expect(layout).toContain('grid-template-rows: minmax(0, 1fr);');
  });
});

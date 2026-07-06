import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('site editor save footer layout', () => {
  it('loads the layout override after the base Site Editor stylesheet', () => {
    const rendererEntry = read('src/renderer/main.tsx');
    const layout = read('src/renderer/styles/site-editor-layout.css');
    const siteForm = read('src/renderer/screens/site-editor/components/SiteForm.tsx');

    expect(rendererEntry.indexOf("import './styles/site-editor.css';")).toBeLessThan(
      rendererEntry.indexOf("import './styles/site-editor-layout.css';"),
    );
    expect(layout).toContain('grid-template-rows: auto minmax(0, 1fr) auto !important;');
    expect(layout).toContain(':has(> .site-editor-command-error)');
    expect(layout).toContain('grid-template-rows: auto auto minmax(0, 1fr) auto !important;');
    expect(layout).toContain('min-height: 66px;');
    expect(siteForm).toContain("{creating ? 'Add site' : 'Save changes'}");
  });
});

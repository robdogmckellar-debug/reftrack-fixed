import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('importer utility-process messaging', () => {
  it('uses the parent port exposed on the utility process global', () => {
    const worker = read('src/main/importer/importer-worker.ts');

    expect(worker).toContain('const importerPort = process.parentPort;');
    expect(worker).not.toContain("import { parentPort } from 'electron';");
  });
});

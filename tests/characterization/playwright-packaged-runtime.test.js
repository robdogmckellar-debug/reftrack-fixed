import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  expectedDocumentTitle,
  hasValidScreenResult,
  PRIMARY_SCREEN_NAMES,
} from '../../scripts/lib/packaged-smoke-contract.mjs';
import { mergeDebugNamespaces } from '../../scripts/lib/playwright-packaged-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('packaged Playwright runtime', () => {
  it('adds Playwright browser diagnostics without discarding existing DEBUG namespaces', () => {
    expect(mergeDebugNamespaces(undefined)).toBe('pw:browser*');
    expect(mergeDebugNamespaces('reftrack:*')).toBe('reftrack:*,pw:browser*');
    expect(mergeDebugNamespaces('pw:browser*,reftrack:*')).toBe('pw:browser*,reftrack:*');
  });

  it('keeps the release inspector fuse disabled and enables it only in a disposable copy', () => {
    const builder = read('electron-builder.yml');
    const runtime = read('scripts/lib/playwright-packaged-runtime.mjs');
    const verifier = read('scripts/verify-packaged-app.mjs');

    expect(builder).toContain('enableNodeCliInspectArguments: false');
    expect(verifier).toContain(
      '[FuseV1Options.EnableNodeCliInspectArguments, FuseWireState.DISABLE]',
    );
    expect(runtime).toContain('mkdtemp(');
    expect(runtime).toContain('[FuseV1Options.EnableNodeCliInspectArguments]: true');
    expect(runtime).toContain('The production executable was not modified.');
  });

  it('accepts screen-aware document titles and rejects mismatched screen results', () => {
    expect(PRIMARY_SCREEN_NAMES).toEqual([
      'Dashboard',
      'Site Editor',
      'Statistics',
      'Settings',
      'Daily Tasks',
    ]);
    expect(expectedDocumentTitle('Dashboard')).toBe('Dashboard · RefTrack');
    expect(expectedDocumentTitle('Settings')).toBe('Settings · RefTrack');
    expect(() => expectedDocumentTitle('Unknown')).toThrow('Unknown RefTrack screen');
    expect(
      hasValidScreenResult({
        screen: 'Dashboard',
        selected: 'true',
        visible: true,
        documentTitle: 'Dashboard · RefTrack',
      }),
    ).toBe(true);
    expect(
      hasValidScreenResult({
        screen: 'Dashboard',
        selected: 'true',
        visible: true,
        documentTitle: 'RefTrack',
      }),
    ).toBe(false);
  });

  it('probes production DevTools behaviour instead of trusting an omitted preference field', () => {
    const smoke = read('scripts/run-packaged-smoke.mjs');
    expect(smoke).toContain('contents.openDevTools({');
    expect(smoke).toContain('contents.isDevToolsOpened()');
    expect(smoke).toContain('devToolsProbe.openedAfterRequest !== false');
    expect(smoke).not.toContain('preferences.devTools');
    expect(smoke).not.toContain("title !== 'RefTrack'");
  });

  it('uses the disposable runtime for packaged smoke and accessibility automation', () => {
    for (const script of [
      'scripts/run-packaged-smoke.mjs',
      'scripts/run-packaged-accessibility.mjs',
    ]) {
      const source = read(script);
      expect(source).toContain('launchPackagedAppForPlaywright');
      expect(source).not.toContain("from '@playwright/test'");
    }
  });
});

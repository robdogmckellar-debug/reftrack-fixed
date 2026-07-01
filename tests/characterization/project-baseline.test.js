import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('reproducible project baseline', () => {
  it('pins the approved runtime, build, TypeScript and renderer dependencies exactly', () => {
    expect(packageJson.devDependencies.electron).toBe('42.5.1');
    expect(packageJson.devDependencies['electron-builder']).toBe('26.15.3');
    expect(packageJson.devDependencies['electron-vite']).toBe('5.0.0');
    expect(packageJson.devDependencies.vite).toBe('7.3.6');
    expect(packageJson.devDependencies.typescript).toBe('6.0.3');
    expect(packageJson.dependencies.preact).toBe('10.29.3');
    expect(packageJson.dependencies['@preact/signals']).toBe('2.9.2');
    expect(packageJson.dependencies.zod).toBe('4.4.3');
    expect(packageJson.dependencies.parse5).toBe('8.0.1');
    expect(packageJson.devDependencies['@electron/fuses']).toBe('1.8.0');
    expect(packageJson.devDependencies['@electron/asar']).toBe('3.4.1');
    expect(packageJson.devDependencies['@playwright/test']).toBe('1.61.1');
    expect(packageJson.devDependencies['@axe-core/playwright']).toBe('4.12.1');
  });

  it('keeps package.json and the root lockfile declarations aligned with exact versions', () => {
    expect(packageLock.packages[''].devDependencies).toEqual(packageJson.devDependencies);
    expect(packageLock.packages[''].dependencies).toEqual(packageJson.dependencies);
    for (const version of [
      ...Object.values(packageJson.devDependencies),
      ...Object.values(packageJson.dependencies),
    ]) {
      expect(version).not.toMatch(/^[~^<>=*]/);
    }
  });

  it('uses the electron-vite TypeScript process entries and production build commands', () => {
    expect(packageJson.main).toBe('out/main/index.js');
    expect(packageJson.scripts.start).toBe('electron-vite dev');
    expect(packageJson.scripts['build:app']).toBe('electron-vite build');
    expect(packageJson.scripts.typecheck).toBe('tsc -b');
    expect(fs.existsSync(path.join(root, 'src/main/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/preload/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/renderer/main.tsx'))).toBe(true);
  });

  it('uses only the narrow typed IPC surface', () => {
    const channelsSource = read('src/shared/ipc/channels.ts');
    const preloadSource = read('src/preload/index.ts');
    const mainSource = read('src/main/ipc/register-handlers.ts');

    for (const obsolete of [
      'load-data',
      'save-data',
      'copy-to-clipboard',
      'show-notification',
      'open-url',
      'pick-folder',
      'clear-folder',
      'scrape-partner-page',
    ]) {
      expect(channelsSource).not.toContain(obsolete);
      expect(preloadSource).not.toContain(obsolete);
    }

    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('reftrack'");
    expect(mainSource).toContain('assertTrustedIpcSender');
    expect(mainSource).toContain('schema.parse(payload)');
  });
});

describe('Windows-only secure application shell baseline', () => {
  it('packages only hardened Windows 11 x64 installer and portable targets', () => {
    const builder = read('electron-builder.yml');
    expect(packageJson.version).toBe('2.0.0');
    expect(packageJson.build).toBeUndefined();
    expect(builder).toContain('target: nsis');
    expect(builder).toContain('target: portable');
    expect(builder).toContain('- x64');
    expect(builder).not.toContain('mac:');
    expect(builder).not.toContain('linux:');
    expect(builder).toContain('onlyLoadAppFromAsar: true');
    expect(builder).toContain('enableEmbeddedAsarIntegrityValidation: true');
    expect(builder).toContain('runAsNode: false');
    expect(builder).toContain('grantFileProtocolExtraPrivileges: false');
    expect(builder).toContain('allowElevation: false');
    expect(builder).toContain('deleteAppDataOnUninstall: false');
    expect(builder).toContain("- '!**/*.map'");
  });

  it('uses the production application protocol, single-instance lock and secure BrowserWindow', () => {
    const mainSource = read('src/main/index.ts');
    const windowSource = read('src/main/application/create-main-window.ts');

    expect(mainSource).toContain('registerApplicationScheme();');
    expect(mainSource).toContain('acquireSingleInstanceLock');
    expect(windowSource).toContain('APP_ENTRY_URL');
    expect(windowSource).toContain('await window.loadURL(rendererUrl)');
    for (const setting of [
      'nodeIntegration: false',
      'contextIsolation: true',
      'sandbox: true',
      'webSecurity: true',
      'allowRunningInsecureContent: false',
      'navigateOnDragDrop: false',
      'safeDialogs: true',
    ]) {
      expect(windowSource).toContain(setting);
    }
    expect(windowSource).toContain('window.removeMenu()');
    expect(windowSource).toContain("titleBarStyle: 'hidden'");
    expect(windowSource).toContain('titleBarOverlay:');
  });

  it('removes obsolete platform and tray code and disallows inline renderer scripts', () => {
    const mainSource = read('src/main/index.ts');
    const preloadSource = read('src/preload/index.ts');
    const html = read('src/renderer/index.html');
    const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';

    for (const source of [mainSource, preloadSource]) {
      expect(source).not.toContain('get-platform');
      expect(source).not.toContain('getPlatform');
      expect(source).not.toContain('nativeImage');
      expect(source).not.toContain('Tray');
      expect(source).not.toContain("'darwin'");
    }
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'none'");
  });
});

describe('typed Preact renderer baseline', () => {
  it('mounts every primary screen directly and removes the transitional renderer', () => {
    const app = read('src/renderer/app/App.tsx');
    const entry = read('src/renderer/main.tsx');
    const store = read('src/renderer/app/store.ts');

    expect(entry).toContain('render(<App />, root)');
    expect(store).toContain("signal<ScreenId>('dashboard')");
    expect(store).toContain('rendererSnapshot');
    for (const screen of [
      'DashboardScreen',
      'SiteEditorScreen',
      'StatisticsScreen',
      'SettingsScreen',
      'DailyTasksScreen',
    ]) {
      expect(app).toContain(screen);
    }

    expect(fs.existsSync(path.join(root, 'src/renderer/legacy'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/renderer/components/LegacyScreenHost.tsx'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(root, 'src/renderer/styles/legacy.css'))).toBe(false);
    expect(entry).not.toContain('legacy.css');
    expect(store).not.toContain('legacyStatus');
  });

  it('uses native caption controls, semantic navigation and managed modal focus', () => {
    const navigation = read('src/renderer/components/PrimaryNavigation.tsx');
    const dialog = read('src/renderer/design-system/Dialog.tsx');
    expect(navigation).toContain('role="tablist"');
    expect(navigation).toContain('aria-selected={isSelected}');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain('trapTabKey');
    expect(dialog).toContain("event.key === 'Escape'");
  });
});

describe('domain, storage and safe-service baseline', () => {
  it('uses versioned main-owned state with stable task identities and safe cleanup', () => {
    const mainSource = read('src/main/index.ts');
    const taskDialog = read('src/renderer/screens/daily-tasks/components/TaskCategoryDialog.tsx');
    const cleanerSource = read('src/main/services/image-cleaner-service.ts');
    const handlersSource = read('src/main/ipc/register-handlers.ts');

    expect(mainSource).toContain("'reftrack-state-v1.json'");
    expect(mainSource).toContain('StateService.create');
    expect(taskDialog).toContain('category.sites.map((site) => ({ ...site }))');
    expect(taskDialog).toContain('sites: activeTaskSites(sites)');
    expect(taskDialog).not.toContain('existingSites[i]');
    expect(cleanerSource).toContain('readdir(canonicalFolder, { withFileTypes: true })');
    expect(cleanerSource).toContain('hasExpectedImageSignature');
    expect(cleanerSource).toContain('entry.isSymbolicLink()');
    expect(cleanerSource).not.toContain('recursive: true');
    expect(handlersSource).toContain('shell.trashItem(filePath)');
  });
});

describe('restricted partner importer baseline', () => {
  it('uses bounded utility-process extraction and an isolated disposable browser fallback', () => {
    const channelsSource = read('src/shared/ipc/channels.ts');
    const viteSource = read('electron.vite.config.ts');
    const staticImportSource = read('src/main/importer/static-import.ts');
    const policySource = read('src/main/importer/network-policy.ts');
    const browserSource = read('src/main/importer/browser-fallback.ts');

    expect(channelsSource).toContain("importerStart: 'importer:start'");
    expect(channelsSource).toContain("importerCancel: 'importer:cancel'");
    expect(channelsSource).toContain("importerProgress: 'importer:progress'");
    expect(channelsSource).toContain("importerCompleted: 'importer:completed'");
    expect(viteSource).toContain("'importer-worker'");
    expect(staticImportSource).toContain('MAX_RESPONSE_BYTES = 2 * 1024 * 1024');
    expect(staticImportSource).toContain('MAX_REDIRECTS = 5');
    expect(policySource).toContain("url.protocol !== 'https:'");
    expect(policySource).toContain('resolvePublicAddress');
    expect(browserSource).toContain('sandbox: true');
    expect(browserSource).toContain('setPermissionRequestHandler');
    expect(browserSource).toContain("setWindowOpenHandler(() => ({ action: 'deny' }))");
    expect(browserSource).toContain("isolatedSession.on('will-download'");
    expect(browserSource).toContain('window.destroy()');
  });
});

describe('typed screen implementations', () => {
  it('uses fine-grained Dashboard Signals and semantic feedback components', () => {
    const dashboard = read('src/renderer/screens/dashboard/DashboardScreen.tsx');
    const store = read('src/renderer/screens/dashboard/dashboard-store.ts');
    const siteCard = read('src/renderer/screens/dashboard/components/SiteCard.tsx');
    expect(dashboard).toContain('visibleDashboardSiteIds.value');
    expect(store).toContain('siteSignals = new Map');
    expect(siteCard).toContain('role="progressbar"');
  });

  it('uses typed Site Editor, Statistics and Settings screens', () => {
    expect(read('src/renderer/screens/site-editor/SiteEditorScreen.tsx')).toContain(
      'registerNavigationGuard',
    );
    expect(read('src/renderer/screens/statistics/StatisticsScreen.tsx')).toContain(
      'role="tabpanel"',
    );
    const settings = read('src/renderer/screens/settings/SettingsScreen.tsx');
    expect(settings).toContain('setImageCleanerEnabled');
    expect(settings).toContain('imageCleaner.onCompleted');
    expect(settings).toContain('Windows Recycle Bin');
  });

  it('replaces Daily Tasks with typed accessible categories, sequential opening and native importer review', () => {
    const app = read('src/renderer/app/App.tsx');
    const tasks = read('src/renderer/screens/daily-tasks/DailyTasksScreen.tsx');
    const category = read('src/renderer/screens/daily-tasks/components/TaskCategoryCard.tsx');
    const importer = read('src/renderer/screens/daily-tasks/components/PartnerImportDialog.tsx');
    const schemas = read('src/shared/ipc/schemas.ts');

    expect(app).toContain("<DailyTasksScreen active={screen === 'tasks'} />");
    expect(tasks).toContain('await delay(260)');
    expect(tasks).toContain('tasks.setCompletions');
    expect(category).toContain('type="checkbox"');
    expect(category).toContain('aria-expanded={expanded}');
    expect(importer).toContain('window.reftrack.importer.onProgress');
    expect(importer).toContain('window.reftrack.importer.onCompleted');
    expect(importer).toContain('window.reftrack.importer.cancel');
    expect(importer).toContain('Nothing saved before your review');
    expect(schemas).toContain('url: OptionalCredentialFreeHttpsUrlSchema');
  });
});

describe('final release pipeline baseline', () => {
  it('includes packaged verification, smoke, accessibility, performance and release-manifest stages', () => {
    for (const script of [
      'scripts/verify-packaged-app.mjs',
      'scripts/run-packaged-smoke.mjs',
      'scripts/run-packaged-accessibility.mjs',
      'scripts/run-packaged-performance.mjs',
      'scripts/compare-performance.mjs',
      'scripts/create-release-manifest.mjs',
    ]) {
      expect(fs.existsSync(path.join(root, script))).toBe(true);
    }
    expect(packageJson.scripts['release:win']).toContain('verify:package');
    expect(packageJson.scripts['release:win']).toContain('test:smoke:packaged');
    expect(packageJson.scripts['release:win']).toContain('test:a11y:packaged');
    expect(packageJson.scripts['release:win']).toContain('perf:packaged');
    expect(packageJson.scripts['release:win']).toContain('release:manifest');
  });

  it('uses the typed dashboard selector in production performance probes', () => {
    const source = read('src/main/performance-baseline.ts');
    expect(source).toContain("document.querySelectorAll('.dashboard-site-card').length");
    expect(source).toContain('reportVersion: 2');
    expect(source).toContain("performance.getEntriesByType('longtask')");
  });

  it('uses an accurately named renderer snapshot adapter with no legacy source folder', () => {
    expect(fs.existsSync(path.join(root, 'src/main/view-model/renderer-snapshot-adapter.ts'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(root, 'src/main/legacy'))).toBe(false);
    expect(read('src/main/services/application-command-service.ts')).toContain(
      '../view-model/renderer-snapshot-adapter',
    );
  });
});

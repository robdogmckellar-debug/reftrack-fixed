import { spawn } from 'node:child_process';
import path from 'node:path';

import {
  ensureArtifactDirectory,
  requireWindowsHost,
  timestampForFilename,
  writeJson,
} from './lib/packaged-app.mjs';
import {
  expectedDocumentTitle,
  hasValidScreenResult,
  PRIMARY_SCREEN_NAMES,
} from './lib/packaged-smoke-contract.mjs';
import {
  getPlaywrightLaunchDiagnostics,
  launchPackagedAppForPlaywright,
} from './lib/playwright-packaged-runtime.mjs';

requireWindowsHost();
const consoleErrors = [];
const pageErrors = [];
const startedAt = Date.now();
let launched;
try {
  launched = await launchPackagedAppForPlaywright();
} catch (error) {
  const directory = await ensureArtifactDirectory('smoke');
  const reportPath = path.join(
    directory,
    `packaged-smoke-launch-failure-${timestampForFilename()}.json`,
  );
  await writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    status: 'launch-failed',
    diagnostics: getPlaywrightLaunchDiagnostics(error),
  });
  throw new Error(`Packaged smoke launch failed. See ${reportPath}`, { cause: error });
}

const { electronApp, runtime: automationRuntime, launchStderr } = launched;
const executablePath = automationRuntime.executablePath;

try {
  const page = await electronApp.firstWindow();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 15_000 });
  const title = await page.title();
  const preloadSurface = await page.evaluate(() => ({
    available: typeof window.reftrack === 'object',
    sections: Object.keys(window.reftrack ?? {}).sort(),
  }));

  const screenResults = [];
  for (const screen of PRIMARY_SCREEN_NAMES) {
    const tab = page.getByRole('tab', { name: screen });
    await tab.click();
    const selected = await tab.getAttribute('aria-selected');
    const panel = page.getByRole('tabpanel', { name: screen });
    await panel.waitFor({ state: 'visible' });
    const expectedTitle = expectedDocumentTitle(screen);
    await page.waitForFunction((nextTitle) => document.title === nextTitle, expectedTitle, {
      timeout: 3_000,
    });
    screenResults.push({
      screen,
      selected,
      visible: await panel.isVisible(),
      documentTitle: await page.title(),
    });
  }

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(900, 600);
  });
  await page.waitForTimeout(250);
  const layout = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow:
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));

  const appRuntime = await electronApp.evaluate(({ app, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const preferences = window?.webContents.getLastWebPreferences();
    return {
      isPackaged: app.isPackaged,
      version: app.getVersion(),
      windowCount: BrowserWindow.getAllWindows().length,
      webPreferences: preferences
        ? {
            nodeIntegration: preferences.nodeIntegration,
            contextIsolation: preferences.contextIsolation,
            sandbox: preferences.sandbox,
            webSecurity: preferences.webSecurity,
          }
        : null,
    };
  });

  // getLastWebPreferences() does not reliably expose the BrowserWindow
  // `devTools` constructor option. Probe the documented behaviour instead:
  // when devTools is false, openDevTools() cannot open a DevTools view.
  const devToolsProbe = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    if (!contents) {
      return { initiallyOpen: null, openedAfterRequest: null };
    }

    const initiallyOpen = contents.isDevToolsOpened();
    const openedAfterRequest = await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        contents.removeListener('devtools-opened', onOpened);
        resolve(value);
      };
      const onOpened = () => finish(true);

      contents.once('devtools-opened', onOpened);
      contents.openDevTools({
        mode: 'detach',
        activate: false,
        title: 'RefTrack packaged QA DevTools probe',
      });
      setTimeout(() => finish(contents.isDevToolsOpened()), 500);
    });

    if (openedAfterRequest) contents.closeDevTools();
    return { initiallyOpen, openedAfterRequest };
  });

  const secondLaunch = spawn(
    executablePath,
    [`--user-data-dir=${automationRuntime.userDataDirectory}`],
    { stdio: 'ignore', windowsHide: true },
  );
  const secondExit = await Promise.race([
    new Promise((resolve) => secondLaunch.once('exit', (code) => resolve({ exited: true, code }))),
    new Promise((resolve) => setTimeout(() => resolve({ exited: false, code: null }), 6_000)),
  ]);
  if (!secondExit.exited) secondLaunch.kill();
  await page.waitForTimeout(300);
  const windowCountAfterSecondLaunch = await electronApp.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
  );

  const failures = [];
  if (title !== expectedDocumentTitle('Dashboard')) {
    failures.push(`Unexpected initial document title: ${title}`);
  }
  if (!preloadSurface.available) failures.push('Preload API is unavailable.');
  if (!appRuntime.isPackaged) failures.push('Electron did not report a packaged application.');
  if (appRuntime.version !== '2.0.0')
    failures.push(`Unexpected application version: ${appRuntime.version}`);
  if (appRuntime.windowCount !== 1 || windowCountAfterSecondLaunch !== 1) {
    failures.push('Single-instance enforcement did not preserve one window.');
  }
  if (appRuntime.webPreferences?.nodeIntegration !== false)
    failures.push('nodeIntegration is enabled.');
  if (appRuntime.webPreferences?.contextIsolation !== true)
    failures.push('contextIsolation is disabled.');
  if (appRuntime.webPreferences?.sandbox !== true) failures.push('Renderer sandbox is disabled.');
  if (appRuntime.webPreferences?.webSecurity !== true) failures.push('webSecurity is disabled.');
  if (devToolsProbe.initiallyOpen !== false || devToolsProbe.openedAfterRequest !== false) {
    failures.push('Production DevTools could be opened.');
  }
  if (layout.horizontalOverflow) failures.push('The minimum window width has horizontal overflow.');
  if (screenResults.some((screen) => !hasValidScreenResult(screen))) {
    failures.push(
      'One or more primary screens did not become selected, visible, and correctly titled.',
    );
  }
  if (consoleErrors.length) failures.push(`Renderer console errors: ${consoleErrors.join(' | ')}`);
  if (pageErrors.length) failures.push(`Renderer page errors: ${pageErrors.join(' | ')}`);

  const report = {
    generatedAt: new Date().toISOString(),
    sourceExecutablePath: automationRuntime.sourceExecutablePath,
    automationExecutablePath: executablePath,
    automationUserDataDirectory: automationRuntime.userDataDirectory,
    productionInspectorEnabled: automationRuntime.sourceInspectorEnabled,
    automationInspectorEnabled: automationRuntime.automationInspectorEnabled,
    playwrightLaunchStderrCharacters: launchStderr.length,
    elapsedMs: Date.now() - startedAt,
    title,
    preloadSurface,
    runtime: appRuntime,
    devToolsProbe,
    screenResults,
    layout,
    secondExit,
    windowCountAfterSecondLaunch,
    consoleErrors,
    pageErrors,
    failures,
    status: failures.length ? 'failed' : 'passed',
  };
  const directory = await ensureArtifactDirectory('smoke');
  const reportPath = path.join(directory, `packaged-smoke-${timestampForFilename()}.json`);
  await writeJson(reportPath, report);
  if (failures.length) throw new Error(`Packaged smoke test failed. See ${reportPath}`);
  console.log(`Packaged smoke test passed: ${reportPath}`);
} finally {
  await electronApp.close().catch(() => undefined);
  await automationRuntime.cleanup();
}

import { spawn } from 'node:child_process';
import path from 'node:path';

import { _electron as electron } from '@playwright/test';

import {
  ensureArtifactDirectory,
  requireWindowsHost,
  resolvePackagedExecutable,
  timestampForFilename,
  writeJson,
} from './lib/packaged-app.mjs';

requireWindowsHost();
const executablePath = resolvePackagedExecutable();
const consoleErrors = [];
const pageErrors = [];
const startedAt = Date.now();
const electronApp = await electron.launch({ executablePath });

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
  for (const screen of ['Dashboard', 'Site Editor', 'Statistics', 'Settings', 'Daily Tasks']) {
    const tab = page.getByRole('tab', { name: screen });
    await tab.click();
    const selected = await tab.getAttribute('aria-selected');
    const panel = page.getByRole('tabpanel', { name: screen });
    await panel.waitFor({ state: 'visible' });
    screenResults.push({ screen, selected, visible: await panel.isVisible() });
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

  const runtime = await electronApp.evaluate(({ app, BrowserWindow }) => {
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
            devTools: preferences.devTools,
          }
        : null,
    };
  });

  const secondLaunch = spawn(executablePath, [], { stdio: 'ignore', windowsHide: true });
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
  if (title !== 'RefTrack') failures.push(`Unexpected document title: ${title}`);
  if (!preloadSurface.available) failures.push('Preload API is unavailable.');
  if (!runtime.isPackaged) failures.push('Electron did not report a packaged application.');
  if (runtime.version !== '2.0.0')
    failures.push(`Unexpected application version: ${runtime.version}`);
  if (runtime.windowCount !== 1 || windowCountAfterSecondLaunch !== 1) {
    failures.push('Single-instance enforcement did not preserve one window.');
  }
  if (runtime.webPreferences?.nodeIntegration !== false)
    failures.push('nodeIntegration is enabled.');
  if (runtime.webPreferences?.contextIsolation !== true)
    failures.push('contextIsolation is disabled.');
  if (runtime.webPreferences?.sandbox !== true) failures.push('Renderer sandbox is disabled.');
  if (runtime.webPreferences?.webSecurity !== true) failures.push('webSecurity is disabled.');
  if (runtime.webPreferences?.devTools !== false)
    failures.push('DevTools are enabled in production.');
  if (layout.horizontalOverflow) failures.push('The minimum window width has horizontal overflow.');
  if (screenResults.some((screen) => screen.selected !== 'true' || !screen.visible)) {
    failures.push('One or more primary screens did not become selected and visible.');
  }
  if (consoleErrors.length) failures.push(`Renderer console errors: ${consoleErrors.join(' | ')}`);
  if (pageErrors.length) failures.push(`Renderer page errors: ${pageErrors.join(' | ')}`);

  const report = {
    generatedAt: new Date().toISOString(),
    executablePath,
    elapsedMs: Date.now() - startedAt,
    title,
    preloadSurface,
    runtime,
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
  await electronApp.close();
}

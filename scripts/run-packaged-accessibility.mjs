import path from 'node:path';

import {
  ensureArtifactDirectory,
  requireWindowsHost,
  timestampForFilename,
  writeJson,
} from './lib/packaged-app.mjs';
import {
  getPlaywrightLaunchDiagnostics,
  launchPackagedAppForPlaywright,
} from './lib/playwright-packaged-runtime.mjs';

requireWindowsHost();
let launched;
try {
  launched = await launchPackagedAppForPlaywright();
} catch (error) {
  const directory = await ensureArtifactDirectory('accessibility');
  const reportPath = path.join(
    directory,
    `packaged-accessibility-launch-failure-${timestampForFilename()}.json`,
  );
  await writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    status: 'launch-failed',
    diagnostics: getPlaywrightLaunchDiagnostics(error),
  });
  throw new Error(`Packaged accessibility launch failed. See ${reportPath}`, { cause: error });
}

const { electronApp, runtime, launchStderr } = launched;
const executablePath = runtime.executablePath;
const { default: AxeBuilder } = await import('@axe-core/playwright');

async function analyse(page, name) {
  const result = await new AxeBuilder({ page })
    // Electron's Playwright context cannot create the auxiliary page used by
    // axe's default analysis mode, so use the compatible in-page mode.
    .setLegacyMode()
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return {
    name,
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary,
      })),
    })),
    passes: result.passes.length,
    incomplete: result.incomplete.length,
  };
}

try {
  const page = await electronApp.firstWindow();
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 15_000 });
  const audits = [];

  for (const screen of ['Dashboard', 'Site Editor', 'Statistics', 'Settings', 'Daily Tasks']) {
    await page.getByRole('tab', { name: screen }).click();
    await page.getByRole('tabpanel', { name: screen }).waitFor({ state: 'visible' });
    audits.push(await analyse(page, screen));
  }

  await page.getByRole('tab', { name: 'Daily Tasks' }).click();
  await page.getByRole('button', { name: 'New category' }).first().click();
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  audits.push(await analyse(page, 'New Daily Tasks category dialog'));
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Import partner page' }).first().click();
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  audits.push(await analyse(page, 'Partner importer dialog'));
  await page.keyboard.press('Escape');

  const violations = audits.flatMap((audit) =>
    audit.violations.map((violation) => ({ screen: audit.name, ...violation })),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    sourceExecutablePath: runtime.sourceExecutablePath,
    automationExecutablePath: executablePath,
    automationUserDataDirectory: runtime.userDataDirectory,
    productionInspectorEnabled: runtime.sourceInspectorEnabled,
    automationInspectorEnabled: runtime.automationInspectorEnabled,
    playwrightLaunchStderrCharacters: launchStderr.length,
    standard: 'WCAG 2.2 AA automated axe-core rules',
    audits,
    violationCount: violations.length,
    violations,
    status: violations.length ? 'failed' : 'passed',
    manualChecksStillRequired: [
      'Windows Narrator reading order and control names',
      'Keyboard-only completion of every workflow',
      '125%, 150%, and 200% Windows display scaling',
      'Windows forced-colour mode',
      'Reduced-motion mode',
    ],
  };
  const directory = await ensureArtifactDirectory('accessibility');
  const reportPath = path.join(directory, `packaged-accessibility-${timestampForFilename()}.json`);
  await writeJson(reportPath, report);
  if (violations.length)
    throw new Error(
      `Accessibility audit found ${violations.length} violation(s). See ${reportPath}`,
    );
  console.log(`Packaged accessibility audit passed: ${reportPath}`);
} finally {
  await electronApp.close().catch(() => undefined);
  await runtime.cleanup();
}

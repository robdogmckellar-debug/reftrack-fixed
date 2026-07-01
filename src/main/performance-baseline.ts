import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import type { App, BrowserWindow, ProcessMetric } from 'electron';

const DASHBOARD_TIMEOUT_MS = 10_000;
const SETTLE_DELAY_MS = 2_000;

interface PerformanceBaselineOptions {
  app: App;
}

interface DashboardProbe {
  ready: boolean;
  cards: number;
  rendererElapsedMs?: number;
  error?: string;
}

interface SanitisedProcessMetric {
  type: ProcessMetric['type'];
  pid: number;
  serviceName: string | null;
  name: string | null;
  cpu: ProcessMetric['cpu'];
  memory: ProcessMetric['memory'];
}

export interface PerformanceBaseline {
  enabled: boolean;
  mark(name: string): void;
  attachToWindow(window: BrowserWindow): void;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sanitiseProcessMetric(metric: ProcessMetric): SanitisedProcessMetric {
  return {
    type: metric.type,
    pid: metric.pid,
    serviceName: metric.serviceName || null,
    name: metric.name || null,
    cpu: metric.cpu,
    memory: metric.memory,
  };
}

export function createPerformanceBaseline({
  app,
}: PerformanceBaselineOptions): PerformanceBaseline {
  const enabled = process.env.REFTRACK_PERF === '1';
  const autoExit = process.env.REFTRACK_PERF_AUTO_EXIT === '1';
  const moduleStartedAt = performance.now();
  const milestones: Record<string, number> = {
    mainModuleLoadedMs: 0,
  };

  let attached = false;
  let finalised = false;

  function mark(name: string): void {
    if (!enabled || Object.hasOwn(milestones, name)) return;
    milestones[name] = round(performance.now() - moduleStartedAt);
  }

  async function waitForDashboard(window: BrowserWindow): Promise<DashboardProbe> {
    const result = (await window.webContents.executeJavaScript(
      `new Promise((resolve) => {
        const startedAt = performance.now();
        const check = () => {
          const cards = document.querySelectorAll('.dashboard-site-card').length;
          if (cards > 0) {
            resolve({ ready: true, cards, rendererElapsedMs: performance.now() });
            return;
          }
          if (performance.now() - startedAt >= ${DASHBOARD_TIMEOUT_MS}) {
            resolve({ ready: false, cards, rendererElapsedMs: performance.now() });
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      })`,
      true,
    )) as DashboardProbe;

    mark(result.ready ? 'dashboardUsableMs' : 'dashboardTimeoutMs');
    return result;
  }

  async function writeReport(window: BrowserWindow, dashboard: DashboardProbe): Promise<void> {
    if (!enabled || finalised) return;
    finalised = true;

    await new Promise<void>((resolve) => setTimeout(resolve, SETTLE_DELAY_MS));
    mark('settledSampleMs');

    const mainMemory = await process.getProcessMemoryInfo();
    const rendererMetrics = window.isDestroyed()
      ? null
      : await window.webContents.executeJavaScript(
          `({
          navigation: performance.getEntriesByType('navigation')[0] ? {
            domContentLoaded: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
            loadEventEnd: performance.getEntriesByType('navigation')[0].loadEventEnd
          } : null,
          paints: Object.fromEntries(performance.getEntriesByType('paint').map((entry) => [entry.name, entry.startTime])),
          longTasks: performance.getEntriesByType('longtask').map((entry) => ({ startTime: entry.startTime, duration: entry.duration }))
        })`,
          true,
        );

    const report = {
      reportVersion: 2,
      generatedAt: new Date().toISOString(),
      application: {
        name: app.getName(),
        version: app.getVersion(),
        packaged: app.isPackaged,
      },
      runtime: {
        platform: process.platform,
        architecture: process.arch,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        v8: process.versions.v8,
      },
      milestones,
      dashboard,
      rendererMetrics,
      processIds: {
        main: process.pid,
        renderer: window.isDestroyed() ? null : window.webContents.getOSProcessId(),
      },
      memory: {
        mainProcessKb: mainMemory,
        applicationProcesses: app.getAppMetrics().map(sanitiseProcessMetric),
      },
    };

    const requestedOutput = process.env.REFTRACK_PERF_OUTPUT;
    const outputPath = requestedOutput
      ? path.resolve(requestedOutput)
      : path.join(app.getPath('userData'), 'performance-baseline.json');

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(`[RefTrack performance] Baseline written to ${outputPath}`);

    if (autoExit) {
      setTimeout(() => app.quit(), 250);
    }
  }

  function attachToWindow(window: BrowserWindow): void {
    if (!enabled || attached) return;
    attached = true;
    mark('windowCreatedMs');

    window.webContents.once('dom-ready', () => mark('domReadyMs'));
    window.once('ready-to-show', () => mark('readyToShowMs'));

    window.webContents.once('did-finish-load', async () => {
      mark('didFinishLoadMs');

      let dashboard: DashboardProbe;
      try {
        dashboard = await waitForDashboard(window);
      } catch (error) {
        dashboard = {
          ready: false,
          cards: 0,
          error: error instanceof Error ? error.message : String(error),
        };
        mark('dashboardProbeFailedMs');
      }

      try {
        await writeReport(window, dashboard);
      } catch (error) {
        console.error('[RefTrack performance] Could not write baseline:', error);
        if (autoExit) app.quit();
      }
    });
  }

  return {
    enabled,
    mark,
    attachToWindow,
  };
}

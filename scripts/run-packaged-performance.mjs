import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  ensureArtifactDirectory,
  requireWindowsHost,
  resolvePackagedExecutable,
  timestampForFilename,
  writeJson,
} from './lib/packaged-app.mjs';

requireWindowsHost();
const executablePath = resolvePackagedExecutable();
const sampleCount = Number.parseInt(process.env.REFTRACK_PERF_SAMPLES ?? '3', 10);
if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 10) {
  throw new Error('REFTRACK_PERF_SAMPLES must be an integer from 1 to 10.');
}

const directory = await ensureArtifactDirectory('performance');
const runId = timestampForFilename();
const reports = [];

function runSample(index) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(directory, `packaged-${runId}-sample-${index}.json`);
    const child = spawn(executablePath, [], {
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        REFTRACK_PERF: '1',
        REFTRACK_PERF_AUTO_EXIT: '1',
        REFTRACK_PERF_OUTPUT: outputPath,
      },
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) return reject(new Error(`Performance sample ${index} ended after ${signal}.`));
      if (code !== 0)
        return reject(new Error(`Performance sample ${index} exited with code ${code}.`));
      if (!fs.existsSync(outputPath))
        return reject(new Error(`Performance sample ${index} produced no report.`));
      resolve(JSON.parse(fs.readFileSync(outputPath, 'utf8')));
    });
  });
}

for (let index = 1; index <= sampleCount; index += 1) {
  reports.push(await runSample(index));
}

function values(pathParts) {
  return reports
    .map((report) => pathParts.reduce((value, key) => value?.[key], report))
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
}

function summarise(numbers) {
  if (!numbers.length) return null;
  const ordered = [...numbers].sort((a, b) => a - b);
  const total = numbers.reduce((sum, value) => sum + value, 0);
  return {
    minimum: ordered[0],
    median: ordered[Math.floor(ordered.length / 2)],
    maximum: ordered.at(-1),
    average: Math.round((total / numbers.length) * 100) / 100,
  };
}

const summary = {
  generatedAt: new Date().toISOString(),
  executablePath,
  sampleCount,
  metrics: {
    dashboardUsableMs: summarise(values(['milestones', 'dashboardUsableMs'])),
    readyToShowMs: summarise(values(['milestones', 'readyToShowMs'])),
    didFinishLoadMs: summarise(values(['milestones', 'didFinishLoadMs'])),
    mainWorkingSetKb: summarise(values(['memory', 'mainProcessKb', 'workingSetSize'])),
    rendererWorkingSetKb: summarise(
      reports
        .flatMap((report) => report.memory?.applicationProcesses ?? [])
        .filter((metric) => metric.type === 'Tab')
        .map((metric) => metric.memory?.workingSetSize)
        .filter((value) => typeof value === 'number'),
    ),
  },
  reports,
};
const summaryPath = path.join(directory, `packaged-summary-${runId}.json`);
await writeJson(summaryPath, summary);
console.log(`Packaged performance summary: ${summaryPath}`);

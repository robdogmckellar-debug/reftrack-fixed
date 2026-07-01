import fs from 'node:fs';
import path from 'node:path';

import { artifactsDirectory, timestampForFilename, writeJson } from './lib/packaged-app.mjs';

const args = process.argv.slice(2);
function argument(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const performanceDirectory = path.join(artifactsDirectory, 'performance');
const files = fs.existsSync(performanceDirectory) ? fs.readdirSync(performanceDirectory) : [];
const beforePath = argument('--before')
  ? path.resolve(argument('--before'))
  : files
      .filter((name) => /^baseline-.*\.json$/i.test(name))
      .sort()
      .map((name) => path.join(performanceDirectory, name))[0];
const afterPath = argument('--after')
  ? path.resolve(argument('--after'))
  : files
      .filter((name) => /^packaged-summary-.*\.json$/i.test(name))
      .sort()
      .map((name) => path.join(performanceDirectory, name))
      .at(-1);

if (!beforePath || !afterPath || !fs.existsSync(beforePath) || !fs.existsSync(afterPath)) {
  throw new Error(
    'Provide --before and --after reports, or place baseline and packaged summary reports in artifacts/performance.',
  );
}

const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));

function baselineMetric(name) {
  if (name === 'dashboardUsableMs') return before.milestones?.dashboardUsableMs;
  if (name === 'readyToShowMs') return before.milestones?.readyToShowMs;
  if (name === 'didFinishLoadMs') return before.milestones?.didFinishLoadMs;
  if (name === 'mainWorkingSetKb') return before.memory?.mainProcessKb?.workingSetSize;
  if (name === 'rendererWorkingSetKb') {
    return (before.memory?.applicationProcesses ?? []).find((metric) => metric.type === 'Tab')
      ?.memory?.workingSetSize;
  }
  return null;
}

const thresholds = {
  dashboardUsableMs: 10,
  readyToShowMs: 10,
  didFinishLoadMs: 10,
  mainWorkingSetKb: 15 * 1024,
  rendererWorkingSetKb: 15 * 1024,
};

const comparisons = {};
for (const name of Object.keys(thresholds)) {
  const beforeValue = baselineMetric(name);
  const afterValue = after.metrics?.[name]?.median;
  if (typeof beforeValue !== 'number' || typeof afterValue !== 'number') {
    comparisons[name] = {
      before: beforeValue ?? null,
      after: afterValue ?? null,
      status: 'insufficient-data',
    };
    continue;
  }
  const difference = afterValue - beforeValue;
  const percent = beforeValue === 0 ? null : Math.round((difference / beforeValue) * 10_000) / 100;
  const threshold = thresholds[name];
  const passed = name.endsWith('Kb') ? difference <= threshold : percent <= threshold;
  comparisons[name] = {
    before: beforeValue,
    after: afterValue,
    difference,
    percent,
    threshold,
    status: passed ? 'passed' : 'review',
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  beforePath,
  afterPath,
  comparisons,
  status: Object.values(comparisons).some((item) => item.status === 'review') ? 'review' : 'passed',
};
const outputPath = path.join(performanceDirectory, `comparison-${timestampForFilename()}.json`);
await writeJson(outputPath, report);

const lines = [
  '# RefTrack performance comparison',
  '',
  `Before: \`${beforePath}\``,
  `After: \`${afterPath}\``,
  '',
  '| Metric | Before | After | Difference | Status |',
  '|---|---:|---:|---:|---|',
];
for (const [name, item] of Object.entries(comparisons)) {
  lines.push(
    `| ${name} | ${item.before ?? 'n/a'} | ${item.after ?? 'n/a'} | ${item.difference ?? 'n/a'} | ${item.status} |`,
  );
}
const markdownPath = outputPath.replace(/\.json$/, '.md');
fs.writeFileSync(markdownPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Performance comparison: ${outputPath}`);

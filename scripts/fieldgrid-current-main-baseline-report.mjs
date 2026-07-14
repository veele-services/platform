import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const reportDir = 'artifacts/current-main-baseline';
const reportPath = `${reportDir}/report.json`;
const run = (command, args) => {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim();
  } catch (error) {
    return error.stdout?.toString().trim() || error.message;
  }
};

const report = {
  generatedAt: new Date().toISOString(),
  head: run('git', ['rev-parse', 'HEAD']),
  branch: run('git', ['branch', '--show-current']),
  expectedCurrentMain: process.env.FIELDGRID_EXPECTED_CURRENT_MAIN_SHA || null,
  packageManager: JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile('package.json', 'utf8'))).packageManager,
  statusShort: run('git', ['status', '--short']),
};

await mkdir(reportDir, { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Fieldgrid current-main baseline report written to ${reportPath}`);

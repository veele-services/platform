import { readFile } from 'node:fs/promises';

const required = [
  { name: 'api-server', path: 'artifacts/api-server/package.json', scripts: ['build', 'start'], requiresPortBinding: false },
  { name: 'backoffice', path: 'artifacts/backoffice/package.json', scripts: ['dev', 'build', 'start'] },
  { name: 'personeel-pwa', path: 'artifacts/personeel-pwa/package.json', scripts: ['dev', 'build', 'start'] },
  { name: 'klant-pwa', path: 'artifacts/klant-pwa/package.json', scripts: ['dev', 'build', 'start'] },
];

const failures = [];
for (const entry of required) {
  let pkg;
  try {
    pkg = JSON.parse(await readFile(entry.path, 'utf8'));
  } catch (error) {
    failures.push(`${entry.name}: cannot read ${entry.path}: ${error.message}`);
    continue;
  }

  for (const script of entry.scripts) {
    const value = pkg.scripts?.[script];
    if (!value) {
      failures.push(`${entry.name}: missing scripts.${script}`);
      continue;
    }
    if (entry.requiresPortBinding !== false && (script === 'dev' || script === 'start') && !/\$PORT|process\.env\.PORT|--port|-p\b/.test(value)) {
      failures.push(`${entry.name}: scripts.${script} must bind to an explicit PORT; found ${JSON.stringify(value)}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Fieldgrid runtime entrypoint check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Fieldgrid runtime entrypoint check passed');

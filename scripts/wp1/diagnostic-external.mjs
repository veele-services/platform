import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { check, DiagnosticError } from './diagnostic-core.mjs';

const exec = promisify(execFile);
export const REQUIRED_UNITS = Object.freeze(['veele-staging.service', 'veele-staging-personeel.service', 'veele-staging-klant.service', 'veele-staging-api.service']);
const NON_WRITERS = new Set(['veele-staging-website.service', 'veele-staging-marketing.service']);
const BUCKETS = Object.freeze(['documents', 'assignment-photos', 'personnel-avatars']);
const sha = value => createHash('sha256').update(value).digest('hex');
const commandOptions = { timeout: 15000, maxBuffer: 65536, env: { PATH: process.env.PATH, LANG: 'C.UTF-8' } };

/** Only list permissions, never execute stop/start; every unit is independent. */
export async function inspectWriters(collector, configured, command = exec, parsers) {
  const { parseWriterUnits, parseUnitState } = parsers ?? await import('./services.mjs');
  let units = [...REQUIRED_UNITS];
  await collector.run('writers.configuration', async () => {
    units = parseWriterUnits(configured);
    return { counts: { units: units.length } };
  }, [], 'WRITER_CONFIGURATION_INVALID');
  for (const source of ['list-units', 'list-unit-files']) {
    await collector.run(`writers.${source}`, async () => {
      const result = await command('/usr/bin/systemctl', [source, '--no-legend', '--no-pager', 'veele-staging*'], commandOptions);
      const names = result.stdout.split('\n').map(line => line.trim().replace(/^●\s*/, '').split(/\s+/)[0]).filter(name => /\.(service|timer)$/.test(name));
      check(names.every(name => units.includes(name) || NON_WRITERS.has(name)), 'UNDECLARED_STAGING_WRITER');
      return { counts: { units: names.length } };
    }, [], 'WRITER_INVENTORY_FAILED');
  }
  for (const [index, unit] of units.entries()) {
    await collector.run(`writer.${index}.state`, async () => {
      const result = await command('/usr/bin/systemctl', ['show', unit, '--property=Id,LoadState,ActiveState,SubState,MainPID,FragmentPath'], commandOptions);
      const state = parseUnitState(result.stdout);
      return { counts: { active: state.active ? 1 : 0 } };
    }, [], 'WRITER_STATE_FAILED');
    for (const action of ['start', 'stop']) {
      await collector.run(`writer.${index}.${action}_permission`, async () => {
        await command('/usr/bin/sudo', ['-n', '-l', '/usr/bin/systemctl', action, unit], commandOptions);
      }, [], 'WRITER_PERMISSION_REQUIRED');
    }
  }
}

/** Capability facade: no deleteUser, upload, remove, update or invite methods. */
export function providerReader(admin) {
  return Object.freeze({
    listUsers: options => admin.auth.admin.listUsers(options),
    list: (bucket, prefix, options) => admin.storage.from(bucket).list(prefix, options),
    download: (bucket, path) => admin.storage.from(bucket).download(path),
  });
}
async function response(operation) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let result;
    try { result = await operation(); } catch { result = { error: { status: 503 } }; }
    if (result && !result.error) return result;
    const status = Number(result?.error?.status ?? result?.error?.statusCode);
    if (![429, 500, 502, 503, 504].includes(status) || attempt === 2) throw new DiagnosticError('PROVIDER_READ_FAILED');
    await new Promise(resolve => setTimeout(resolve, 100 * (2 ** attempt)));
  }
  throw new DiagnosticError('PROVIDER_READ_FAILED');
}
export async function inspectAuth(collector, reader, context) {
  const ids = await collector.run('auth.inventory', async () => {
    const all = new Set();
    for (let page = 1; page <= 100; page++) {
      const result = await response(() => reader.listUsers({ page, perPage: 100 }));
      check(Array.isArray(result.data?.users) && result.data.users.length <= 100, 'AUTH_RESPONSE');
      for (const row of result.data.users) {
        check(typeof row.id === 'string' && /^[a-f0-9-]{36}$/i.test(row.id) && !all.has(row.id), 'AUTH_IDENTITY');
        all.add(row.id);
      }
      if (result.data.users.length < 100) return { value: all, counts: { identities: all.size, retained_by_current_reset: all.size } };
    }
    throw new DiagnosticError('AUTH_LIMIT');
  }, ['provider.client'], 'AUTH_INVENTORY_FAILED');
  await collector.run('auth.manager_continuity', async () => {
    check(ids.has(context.adminId), 'ADMIN_AUTH_MISSING');
  }, ['auth.inventory', 'access.manager']);
}
function validPart(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 &&
    !/[\/\\\x00-\x1f\x7f]/.test(value) && value !== '.' && value !== '..';
}
export async function inspectStorage(collector, reader, directory) {
  let totalBytes = 0;
  for (const bucket of BUCKETS) {
    const items = await collector.run(`storage.${bucket}.inventory`, async () => {
      const objects = [], pending = [{ prefix: '', depth: 0 }], seen = new Set();
      let requests = 0;
      while (pending.length) {
        const { prefix, depth } = pending.shift();
        check(depth <= 16, 'STORAGE_DEPTH');
        for (let offset = 0; ; offset += 100) {
          check(++requests <= 2000, 'STORAGE_REQUEST_LIMIT');
          const result = await response(() => reader.list(bucket, prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }));
          check(Array.isArray(result.data) && result.data.length <= 100, 'STORAGE_RESPONSE');
          for (const item of result.data) {
            check(validPart(item?.name), 'STORAGE_NAME');
            const path = prefix ? `${prefix}/${item.name}` : item.name;
            check(path.length <= 1024 && !seen.has(path), 'STORAGE_PATH');
            seen.add(path);
            if (item.id === null) pending.push({ prefix: path, depth: depth + 1 });
            else {
              const size = Number(item.metadata?.size);
              check(Number.isSafeInteger(size) && size >= 0 && size <= 64 * 1024 * 1024, 'STORAGE_SIZE');
              check(objects.length < 5000, 'STORAGE_LIMIT');
              objects.push({ path, size });
            }
          }
          if (result.data.length < 100) break;
        }
      }
      return { value: objects, counts: { objects: objects.length } };
    }, ['provider.client'], 'STORAGE_INVENTORY_FAILED');
    if (!items) { collector.skip(`storage.${bucket}.backup`, [`storage.${bucket}.inventory`]); continue; }
    for (const [index, item] of items.entries()) {
      await collector.run(`storage.${bucket}.object_${index}`, async () => {
        check(directory !== undefined, 'PRIVATE_DIRECTORY_UNAVAILABLE');
        check(totalBytes + item.size <= 256 * 1024 * 1024, 'STORAGE_BACKUP_LIMIT');
        totalBytes += item.size;
        const result = await response(() => reader.download(bucket, item.path));
        check(typeof result.data?.arrayBuffer === 'function', 'STORAGE_DOWNLOAD');
        const bytes = Buffer.from(await result.data.arrayBuffer());
        check(bytes.length === item.size, 'STORAGE_DOWNLOAD_SIZE');
        const path = join(directory, sha(`${bucket}/${item.path}`));
        await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
        return { counts: { bytes: bytes.length } };
      }, ['private.storage_directory'], 'STORAGE_BACKUP_FAILED');
    }
    if (!items.length) collector.add(`storage.${bucket}.backup`, 'PASS', null, { objects: 0 });
  }
}

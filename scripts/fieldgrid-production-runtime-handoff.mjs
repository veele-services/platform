#!/usr/bin/env node
import { timingSafeEqual } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertProductionDispatch } from './fieldgrid-production-release-proof.mjs';

const project = 'ckdtiuemeygrnujjibnw';
const runtimeRole = 'fieldgrid_runtime_app';
const sharedEnvironment = '/var/www/veele/production/shared/.env';
const maximumBytes = 1024 * 1024;
const fail = () => { throw new Error('Production runtime handoff requires a valid active production environment and unchanged runtime credentials; password rotation needs a separate coordinated operation.'); };

export function activeDatabaseUrlFromDotenv(contents) {
  if (typeof contents !== 'string' || Buffer.byteLength(contents) > maximumBytes || contents.includes('\0')) fail();
  const lines = contents.split(/\r?\n/u).filter(line => /^\s*(?:export\s+)?DATABASE_URL\s*=/u.test(line));
  if (lines.length !== 1) fail();
  let value = lines[0].replace(/^\s*(?:export\s+)?DATABASE_URL\s*=\s*/u, '').trim();
  if (value.startsWith('"') || value.startsWith("'")) {
    const quote = value[0];
    const end = value.indexOf(quote, 1);
    if (end < 1 || !/^(?:\s*#.*)?$/u.test(value.slice(end + 1))) fail();
    value = value.slice(1, end);
  }
  // Parse data only: never source the file, expand variables or execute a shell.
  if (!value || /[\r\n\s]/u.test(value)) fail();
  return value;
}

function descriptor(value, candidate = false) {
  try {
    const url = new URL(value);
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const directProject = /^db\.([a-z0-9]{8,64})\.supabase\.co$/u.exec(url.hostname)?.[1];
    const pooler = /^aws-[0-9]+-[a-z]{2}(?:-[a-z]+)+-[0-9]+\.pooler\.supabase\.com$/u.test(url.hostname);
    const poolerIdentity = /^(postgres|supabase_admin|fieldgrid_runtime_app)\.([a-z0-9]{8,64})$/u.exec(username);
    const boundProject = directProject ?? (pooler ? poolerIdentity?.[2] : undefined);
    const role = directProject ? username : poolerIdentity?.[1];
    if (!boundProject || (candidate && boundProject !== project) || !['postgres:', 'postgresql:'].includes(url.protocol)
        || url.pathname !== '/postgres' || url.search || url.hash || !password || /[\r\n\0]/u.test(password)
        || !['postgres', 'supabase_admin', runtimeRole].includes(role)
        || (candidate ? url.port !== '5432' || role !== runtimeRole : !['5432', '6543'].includes(url.port))) fail();
    return { role, password, project: boundProject };
  } catch { fail(); }
}

function equal(left, right) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function assertRuntimeCredentialContinuity({ activeUrl, candidateUrl, candidatePassword }) {
  const active = descriptor(activeUrl);
  const candidate = descriptor(candidateUrl, true);
  if (!/^[a-f0-9]{64}$/u.test(candidatePassword ?? '') || !equal(candidate.password, candidatePassword)) fail();
  if (active.role === runtimeRole && active.project === candidate.project && !equal(active.password, candidate.password)) fail();
  return { status: 'pass', environment: 'production', transition: active.role !== runtimeRole
    ? 'legacy-administrator-to-runtime' : active.project === candidate.project ? 'unchanged-runtime' : 'independent-project-to-runtime' };
}

export function readActiveProductionEnvironment(file = sharedEnvironment) {
  let fd;
  try {
    if (!path.isAbsolute(file) || realpathSync(path.dirname(file)) !== path.dirname(file)) fail();
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fd);
    if (!before.isFile() || before.size === 0 || before.size > maximumBytes) fail();
    const bytes = Buffer.alloc(before.size + 1);
    const count = readSync(fd, bytes, 0, bytes.length, 0);
    const after = fstatSync(fd);
    if (count !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) fail();
    return activeDatabaseUrlFromDotenv(bytes.subarray(0, count).toString('utf8'));
  } catch { fail(); }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function verifyProductionRuntimeHandoff(env = process.env, { readActive = readActiveProductionEnvironment } = {}) {
  assertProductionDispatch(env);
  if (env.BASE_DIR !== '/var/www/veele/production' || env.DEPLOYMENT_MODE !== 'production' || env.TARGET !== 'production') fail();
  return assertRuntimeCredentialContinuity({ activeUrl: readActive(),
    candidateUrl: env.FIELDGRID_RUNTIME_DATABASE_URL, candidatePassword: env.FIELDGRID_RUNTIME_DATABASE_PASSWORD });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(verifyProductionRuntimeHandoff())); }
  catch { console.error('Production runtime credential handoff rejected; existing release credentials were not changed.'); process.exitCode = 1; }
}

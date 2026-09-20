#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const services = new Set(['backoffice', 'personnel', 'customer', 'api']);
const failure = () => new Error('Runtime response does not prove the expected environment, release and service');

export function verifyRuntimeHealthResponse(raw, { environment, sha, service, mode = 'health' }) {
  if (!['production', 'staging'].includes(environment) || !/^[a-f0-9]{40}$/.test(sha ?? '') ||
      !services.has(service) || !['health', 'api-auth-required'].includes(mode) ||
      typeof raw !== 'string' || Buffer.byteLength(raw) > 16 * 1024) throw failure();
  let rest = raw;
  let headers;
  let status;
  // Ignore only genuine interim HTTP responses, never follow a redirect or accept a prior 200.
  for (let blocks = 0; blocks < 4; blocks += 1) {
    const boundary = rest.indexOf('\r\n\r\n');
    if (boundary < 0) throw failure();
    const lines = rest.slice(0, boundary).split('\r\n');
    rest = rest.slice(boundary + 4);
    const match = /^HTTP\/(?:1\.[01]|2|3) ([0-9]{3})(?: [^\r\n]*)?$/.exec(lines.shift());
    if (!match) throw failure();
    status = Number(match[1]);
    headers = new Map();
    for (const line of lines) {
      const header = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*([^\r\n]*)$/.exec(line);
      if (!header) throw failure();
      const key = header[1].toLowerCase();
      if (key.startsWith('x-fieldgrid-') || key === 'cache-control' || key === 'content-type') {
        if (headers.has(key)) throw failure();
        headers.set(key, header[2].trim());
      }
    }
    if (status >= 200) break;
  }
  if (status !== (mode === 'api-auth-required' ? 401 : 200) ||
      headers?.get('x-fieldgrid-environment') !== environment ||
      headers?.get('x-fieldgrid-release') !== sha ||
      headers?.get('x-fieldgrid-service') !== service ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(headers?.get('cache-control') ?? '')) throw failure();
  if (mode === 'api-auth-required') {
    if (service !== 'api' || !/^application\/json(?:\s*;|$)/i.test(headers.get('content-type') ?? '')) throw failure();
    let body;
    try { body = JSON.parse(rest); } catch { throw failure(); }
    if (body?.error !== 'Authenticatie vereist' || Object.keys(body).length !== 1) throw failure();
  }
  return true;
}

export function proveRuntimeHealth({ url, environment, sha, service, mode = 'health', host = '', curl = 'curl', timeout = '5' }) {
  let target;
  try { target = new URL(url); } catch { throw failure(); }
  if (target.username || target.password || target.search || target.hash ||
      !['http:', 'https:'].includes(target.protocol) ||
      (target.protocol === 'http:' && target.hostname !== '127.0.0.1') ||
      !/^[1-9][0-9]?$/.test(timeout) || (host && !/^[a-z0-9.-]+$/.test(host))) throw failure();
  const arguments_ = ['--disable', '--silent', '--show-error', '--include', '--noproxy', '*', '--max-redirs', '0', '--max-time', timeout,
    '--max-filesize', '8192', '--header', 'Cache-Control: no-cache', '--header', 'Pragma: no-cache'];
  if (host) arguments_.push('--header', `Host: ${host}`);
  arguments_.push('--url', target.href);
  let raw;
  try {
    raw = execFileSync(curl, arguments_, { encoding: 'utf8', maxBuffer: 16 * 1024,
      timeout: (Number(timeout) + 1) * 1000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { throw failure(); }
  return verifyRuntimeHealthResponse(raw, { environment, sha, service, mode });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = {};
    const allowed = new Set(['url', 'environment', 'sha', 'service', 'mode', 'host', 'curl', 'timeout']);
    for (let i = 2; i < process.argv.length; i += 2) {
      const key = process.argv[i].slice(2);
      if (!process.argv[i].startsWith('--') || !allowed.has(key) || Object.hasOwn(options, key) || process.argv[i + 1] === undefined) throw failure();
      options[key] = process.argv[i + 1];
    }
    proveRuntimeHealth(options);
  } catch {
    // curl errors/headers/bodies may contain credentials; emit only a fixed diagnosis.
    process.stderr.write('Runtime identity or authenticated API-root proof failed\n');
    process.exitCode = 1;
  }
}

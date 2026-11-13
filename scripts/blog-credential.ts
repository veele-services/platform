import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { rootCertificates } from 'node:tls';
import { Client } from 'pg';
import { stagingDatabaseUrl } from '../lib/env/staging-database';
import { productionDatabaseUrl } from '../lib/env/production-database';

/** Deliberate operator command; stdin is never logged, persisted or echoed. */
async function main() {
  const [action, identifier] = process.argv.slice(2);
  if (!['register', 'revoke'].includes(action)) throw new Error('Gebruik register of revoke.');
  const target = process.env.DEPLOY_TARGET;
  const environment = target === 'local' ? 'development' : target;
  let connection: URL;
  if (target === 'staging') connection = stagingDatabaseUrl('MIGRATION_DATABASE_URL', process.env);
  else if (target === 'production') connection = productionDatabaseUrl('MIGRATION_DATABASE_URL', process.env);
  else {
    connection = new URL(process.env.MIGRATION_DATABASE_URL ?? '');
    if (target !== 'local' || process.env.FIELDGRID_BLOG_LOCAL_TEST !== '1' || !['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname) || !/^\/fieldgrid_blog_[a-z0-9_]+$/.test(connection.pathname) || connection.search || connection.hash || !['postgres:', 'postgresql:'].includes(connection.protocol)) throw new Error('Een expliciete geïsoleerde lokale testdatabase is vereist.');
  }
  connection.searchParams.delete('sslmode');
  const payload: Record<string, unknown> = { siteId: 'fieldgrid', environment, idempotencyKey: randomUUID() };
  if (action === 'register') {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of process.stdin) { length += chunk.length; if (length > 1024) throw new Error('Ongeldig credential.'); chunks.push(Buffer.from(chunk)); }
    const token = Buffer.concat(chunks).toString('utf8').trim();
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('Ongeldig credential.');
    const expiresAt = new Date(process.env.FIELDGRID_BLOG_TOKEN_EXPIRES_AT ?? '');
    if (!Number.isFinite(expiresAt.valueOf()) || expiresAt.valueOf() <= Date.now() || expiresAt.valueOf() > Date.now() + 366 * 86400_000) throw new Error('Kies een toekomstige vervaltijd binnen een jaar.');
    const label = identifier?.trim();
    if (!label || label.length > 160) throw new Error('Een label is vereist.');
    const scopes = (process.env.FIELDGRID_BLOG_TOKEN_SCOPES ?? 'read,media:write,draft:write,publish').split(',');
    if (!scopes.length || scopes.some(s => !['read', 'media:write', 'draft:write', 'publish'].includes(s))) throw new Error('Ongeldige scopes.');
    Object.assign(payload, { label, tokenHash: createHash('sha256').update(token).digest('hex'), scopes, expiresAt: expiresAt.toISOString() });
  } else {
    if (!/^[a-f0-9-]{36}$/.test(identifier ?? '')) throw new Error('Een credential-ID is vereist.');
    payload.credentialId = identifier;
  }
  const db = new Client({ connectionString: connection.href, options: '-c statement_timeout=15000', connectionTimeoutMillis: 10_000,
    ...(target !== 'local' ? { ssl: { rejectUnauthorized: true, ca: [...rootCertificates, await readFile(new URL('./certs/supabase-root-2021.crt', import.meta.url), 'utf8')] } } : {}) });
  await db.connect();
  try {
    const result = await db.query('select private.fieldgrid_blog_write($1,$2) as result', [`credential.${action === 'register' ? 'create' : 'revoke'}`, payload]);
    console.log(JSON.stringify({ id: result.rows[0].result.id, action, environment }));
  } finally { await db.end(); }
}
main().catch(() => { console.error('Credentialbewerking geweigerd of mislukt. Controleer doelguard, operatorrechten en invoer; geen credentialgegevens gelogd.'); process.exitCode = 1; });

/** Dedicated local acceptance target. Never loads .env or inherits PostgreSQL routing. */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

export const BLOG_TEST_DATABASE = 'fieldgrid_blog_isolated';
const targetError = () => new Error('FIELDGRID_BLOG_TEST_DATABASE_URL moet een expliciete geïsoleerde lokale blogtestverbinding bevatten; waarden worden niet gelogd.');

export function blogTestDatabaseName(name) {
  if (typeof name !== 'string' || name.length > 63 || !/^fieldgrid_blog_[a-z0-9_]+$/.test(name)) throw targetError();
  return name;
}

export function blogTestDatabaseConfig(env = process.env, database = BLOG_TEST_DATABASE) {
  blogTestDatabaseName(database);
  try {
    if (env.FIELDGRID_STAGING_SMOKE || (env.DEPLOY_TARGET && env.DEPLOY_TARGET !== 'local')) throw targetError();
    const value = env.FIELDGRID_BLOG_TEST_DATABASE_URL;
    if (typeof value !== 'string' || !value || value.trim() !== value || /[?#\u0000-\u0020\u007f]/.test(value)) throw targetError();
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '59423' || url.pathname !== `/${BLOG_TEST_DATABASE}` || url.search || url.hash) throw targetError();
    const user = decodeURIComponent(url.username), password = decodeURIComponent(url.password);
    if (!user || !password || /[\u0000-\u001f\u007f]/.test(user + password)) throw targetError();
    return {
      host: '127.0.0.1', port: 59423, database, user, password, ssl: false,
      options: '-c statement_timeout=15000', statement_timeout: 15000, connectionTimeoutMillis: 10000,
    };
  } catch { throw targetError(); }
}

/** Check the actual database before any fixture, role or upgrade mutation. */
export async function assertBlogTestDatabase(db, expected = BLOG_TEST_DATABASE) {
  blogTestDatabaseName(expected);
  try {
    const result = await db.query('select current_database() as database');
    if (result.rows[0]?.database !== expected) throw targetError();
  } catch { throw targetError(); }
}

/** A fresh credential for the task-owned container; plaintext never enters SQL or diagnostics. */
export async function configureBlogTestAuthenticator(db, host) {
  await assertBlogTestDatabase(db);
  const parts = typeof host === 'string' ? host.split('.').map(Number) : [];
  if (typeof host !== 'string' || isIP(host) !== 4 || parts.length !== 4 || !parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255) || parts[0] !== 172 || parts[1] < 16 || parts[1] > 31) throw targetError();
  const password = randomBytes(36).toString('base64url'), salt = randomBytes(16), iterations = 4096;
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest('base64');
  const serverKey = createHmac('sha256', salted).update('Server Key').digest('base64');
  const verifier = `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey}:${serverKey}`;
  // A SCRAM verifier contains no SQL quotes. The generated plaintext exists only
  // in the private PostgREST env file; role changes cannot bind a password as $1.
  try { await db.query(`alter role authenticator with password '${verifier}'`); }
  catch { throw new Error('Tijdelijk PostgREST-credential kon niet worden ingesteld; verbindingsgegevens worden niet gelogd.'); }
  const url = new URL('postgresql://127.0.0.1/');
  url.hostname = host; url.port = '5432'; url.pathname = `/${BLOG_TEST_DATABASE}`;
  url.username = 'authenticator'; url.password = password;
  return url.href;
}

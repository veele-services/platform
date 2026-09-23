/** Disposable staging only. This module never opens a connection. */
export const PROJECT = 'olyfmekyqozxrbrwwszu';
export const REPOSITORY = 'veele-services/platform';
export const WORKFLOW = '.github/workflows/fieldgrid-disposable-staging-rebuild.yml';
export const VALIDATION_WORKFLOW = '.github/workflows/fieldgrid-disposable-staging-rebuild-validation.yml';
export const CONTRACT = 'fieldgrid-disposable-staging-rebuild-v1';
export const APP_SCHEMAS = Object.freeze(['public', 'app_private', 'drizzle']);
export const TENANT_ID = '00000000-0000-0000-0000-000000000010';
export const DOMAIN = 'veele.staging.fieldgrid.nl';
export const SHA = /^[a-f0-9]{40}$/;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CODE = /^[A-Z][A-Z0-9_]{0,95}$/;
export class RebuildError extends Error {
  constructor(code) {
    super(CODE.test(code) ? code : 'REBUILD_FAILED');
    this.code = this.message;
  }
}
export function requireThat(condition, code) { if (!condition) throw new RebuildError(code); }
export function safeCode(error, fallback = 'REBUILD_FAILED') {
  return error instanceof RebuildError ? error.code : fallback;
}
export function confirmation(sha) {
  requireThat(SHA.test(sha ?? ''), 'SHA_INVALID');
  return `REBUILD:${PROJECT}:${sha}:DISCARD_DATA`;
}
function databaseUrl(value, principal) {
  let url;
  try { url = new URL(value); } catch { throw new RebuildError('DATABASE_ENDPOINT_INVALID'); }
  const direct = url.hostname === `db.${PROJECT}.supabase.co`;
  const pooler = /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
  const username = decodeURIComponent(url.username);
  const expected = direct ? principal : `${principal}.${PROJECT}`;
  requireThat(['postgres:', 'postgresql:'].includes(url.protocol) &&
    (direct || pooler) && url.port === '5432' && url.pathname === '/postgres' &&
    username === expected && url.password.length > 0 && !url.search && !url.hash,
  'DATABASE_ENDPOINT_INVALID');
  return url;
}
export function assertHealthUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new RebuildError('HEALTH_URL_INVALID'); }
  requireThat(url.protocol === 'https:' && !url.port && !url.username && !url.password &&
    !url.search && !url.hash &&
    (['staging.fieldgrid.nl', 'platform-staging.fieldgrid.nl'].includes(url.hostname) ||
      /^[a-z0-9][a-z0-9-]*\.staging\.fieldgrid\.nl$/.test(url.hostname)) &&
    /^\/(?:api\/)?healthz?(?:\/(?:live|ready))?$/.test(url.pathname), 'HEALTH_URL_INVALID');
  return url.href;
}
export function validateConfig(env) {
  requireThat(env.APP_ENV === 'staging' && env.TARGET_ENVIRONMENT === 'staging' &&
    env.EXPECTED_SUPABASE_PROJECT_REF === PROJECT, 'STAGING_IDENTITY_REQUIRED');
  requireThat(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
    env.GITHUB_REPOSITORY === REPOSITORY && env.GITHUB_REF === 'refs/heads/main' &&
    env.GITHUB_WORKFLOW_REF === `${REPOSITORY}/${WORKFLOW}@refs/heads/main`, 'REVIEWED_DISPATCH_REQUIRED');
  requireThat(SHA.test(env.EXPECTED_MAIN_SHA ?? '') && env.GITHUB_SHA === env.EXPECTED_MAIN_SHA,
    'EXACT_SHA_REQUIRED');
  requireThat(['plan', 'apply'].includes(env.REBUILD_MODE), 'MODE_INVALID');
  requireThat([undefined,'false','true'].includes(env.REBUILD_RECOVERY), 'RECOVERY_MODE_INVALID');
  requireThat(/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID ?? '') &&
    /^[1-9][0-9]{0,4}$/.test(env.GITHUB_RUN_ATTEMPT ?? ''), 'RUN_ID_INVALID');
  if (env.REBUILD_MODE === 'apply') {
    requireThat(env.GITHUB_RUN_ATTEMPT === '1', 'APPLY_REQUIRES_NEW_DISPATCH');
    requireThat(env.REBUILD_CONFIRMATION === confirmation(env.EXPECTED_MAIN_SHA), 'DATA_LOSS_CONFIRMATION_REQUIRED');
    requireThat(env.REBUILD_MAINTENANCE_CONFIRMED === 'true', 'EXTERNAL_INGRESS_MAINTENANCE_REQUIRED');
  }
  requireThat(env.NEXT_PUBLIC_SUPABASE_URL === `https://${PROJECT}.supabase.co`, 'SUPABASE_ORIGIN_INVALID');
  requireThat(env.FIELDGRID_DATABASE_CONNECTION_PURPOSE === 'migration' && env.DB_SSL === 'true' &&
    env.DB_SSL_REJECT_UNAUTHORIZED === 'true' && env.PGSSLMODE === 'verify-full', 'VERIFIED_TLS_REQUIRED');
  requireThat(!env.FIELDGRID_SQL_MIGRATION_MAX_NAME && !env.NODE_OPTIONS && !env.PGOPTIONS &&
    !env.NODE_TLS_REJECT_UNAUTHORIZED && !env.PGSERVICE && !env.PGSERVICEFILE,
  'EXECUTION_OVERRIDE_FORBIDDEN');
  const migration = databaseUrl(env.FIELDGRID_MIGRATION_DATABASE_URL, 'postgres');
  const runtime = databaseUrl(env.DATABASE_URL, 'fieldgrid_runtime_app');
  requireThat(migration.hostname === runtime.hostname &&
    decodeURIComponent(migration.password) !== decodeURIComponent(runtime.password), 'PRINCIPAL_SEPARATION_REQUIRED');
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'GITHUB_TOKEN']) {
    requireThat(typeof env[name] === 'string' && env[name].length >= 20, `${name}_REQUIRED`);
  }
  const users = ['PLATFORM', 'TENANT'].map(surface => {
    const email = env[`FIELDGRID_REBUILD_${surface}_EMAIL`]?.trim().toLowerCase();
    const password = env[`FIELDGRID_REBUILD_${surface}_PASSWORD`];
    requireThat(typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), `${surface}_EMAIL_REQUIRED`);
    requireThat(typeof password === 'string' && password.length >= 20 && password.length <= 128,
      `${surface}_PASSWORD_REQUIRED`);
    return { surface: surface.toLowerCase(), email, password };
  });
  requireThat(users[0].email !== users[1].email && users[0].password !== users[1].password,
    'SEPARATE_OWNER_IDENTITIES_REQUIRED');
  const health = ['BACKOFFICE', 'PERSONEEL', 'KLANT', 'API'].map(surface => ({
    surface: surface.toLowerCase(), url: assertHealthUrl(env[`${surface}_PUBLIC_HEALTH_URL`]),
  }));
  return Object.freeze({ mode: env.REBUILD_MODE, sha: env.EXPECTED_MAIN_SHA, runId: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT, recovery: env.REBUILD_RECOVERY === 'true', origin: env.NEXT_PUBLIC_SUPABASE_URL,
    migration: migration.href, runtime: runtime.href, users, health });
}

/** All subprocesses receive only the reviewed staging configuration, never the whole runner environment. */
export function migrationEnv(config, env) {
  return {
    PATH: env.PATH, HOME: env.HOME, LANG: 'C.UTF-8', CI: 'true',
    APP_ENV: 'staging', TARGET_ENVIRONMENT: 'staging', EXPECTED_SUPABASE_PROJECT_REF: PROJECT,
    FIELDGRID_DATABASE_CONNECTION_PURPOSE: 'migration', DATABASE_URL: config.runtime,
    FIELDGRID_MIGRATION_DATABASE_URL: config.migration, NEXT_PUBLIC_SUPABASE_URL: config.origin,
    FIELDGRID_STAGING_DATABASE_POOLER_HOST: new URL(config.migration).hostname,
    DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'true', PGSSLMODE: 'verify-full',
    FIELDGRID_DATABASE_SSL_ROOT_CERT: env.FIELDGRID_DATABASE_SSL_ROOT_CERT,
    FIELDGRID_RUNTIME_ENV_FILE_MODE: 'disabled',
  };
}

/** An auditable state machine: plan has no write path; failure after destruction never resumes writers. */
export async function runRebuild(config, adapter, report) {
  const stage = async (id, operation) => {
    report.phase = id;
    await adapter.persist(report);
    try {
      const result = await operation();
      report.checks.push(result?.notApplicable === true
        ? { id, status: 'NOT_APPLICABLE', code: result.code }
        : { id, status: 'PASS' });
    } catch (error) {
      report.checks.push({ id, status: 'FAIL', code: safeCode(error, 'STAGE_FAILED') });
      throw error;
    }
    await adapter.persist(report);
  };
  let stopped = false;
  let destructionStarted = false;
  let previous;
  try {
    await stage('preflight.source', () => adapter.source());
    await stage('preflight.database', () => adapter.inspectDatabase());
    await stage('preflight.providers', () => adapter.inspectProviders());
    await stage('preflight.writers', async () => { previous = await adapter.inventoryWriters(); });
    await stage('preflight.bootstrap', () => adapter.checkBootstrap());
    await stage('preflight.application_health', () => adapter.preflightHealth());
    if (config.mode === 'plan') {
      report.status = 'planned';
      report.destructiveChangesStarted = false;
      return report;
    }
    await stage('writers.stop', async () => { await adapter.stopWriters(previous); stopped = true; });
    await stage('preflight.recheck', async () => { await adapter.source(); await adapter.assertStopped(); });
    // Persist this marker BEFORE the first provider write. An uncertain outcome is destructive, not "safe to resume".
    destructionStarted = true;
    report.destructiveChangesStarted = true;
    report.writersHeld = true;
    await adapter.persist(report);
    await stage('storage.clear', () => adapter.clearStorage());
    await stage('schema.clear', () => adapter.clearSchema());
    await stage('auth.clear', () => adapter.clearAuth());
    await stage('schema.migrate', () => adapter.migrate());
    await stage('schema.journal', () => adapter.verifyJournal());
    await stage('bootstrap.catalogs', () => adapter.seedCatalogs());
    await stage('bootstrap.owners', () => adapter.seedOwners());
    await stage('verification.database', () => adapter.verifyDatabase());
    await stage('verification.auth_storage', () => adapter.verifyProviders());
    await stage('writers.start', () => adapter.startWriters(previous));
    stopped = false;
    await stage('verification.application_health', () => adapter.verifyHealth());
    report.writersHeld = false;
    report.status = 'rebuilt';
    report.databaseRebuilt = true;
    report.applicationHealthVerified = true;
    return report;
  } catch (error) {
    report.status = destructionStarted ? 'rebuild_failed_writers_held' : 'preflight_failed';
    report.errorCode = safeCode(error);
    if (destructionStarted) {
      // Includes partial starts and health failures. Never expose a half-verified rebuild.
      try { await adapter.holdWriters(previous); report.writersHeld = true; }
      catch { report.writersHeld = null; report.errorCode = 'WRITER_HOLD_UNCONFIRMED'; }
    } else if (stopped) {
      try { await adapter.startWriters(previous); report.writersHeld = false; }
      catch { report.writersHeld = null; report.errorCode = 'WRITER_RECOVERY_REQUIRED'; }
    }
    return report;
  } finally {
    report.completedAt = new Date().toISOString();
    await adapter.persist(report);
  }
}
export function newReport(config) {
  return { contract: CONTRACT, project: PROJECT, environment: 'staging', sha: config.sha,
    runId: config.runId, attempt: config.attempt, recovery: config.recovery, mode: config.mode, status: 'running',
    destructiveChangesStarted: false, databaseRebuilt: false, applicationHealthVerified: false,
    oldDataRecoveryRequired: false, checks: [] };
}

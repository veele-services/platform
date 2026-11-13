import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Node-only fixture tools intentionally remain JavaScript.
import { assertBlogTestDatabase, blogTestDatabaseConfig, blogTestDatabaseName, configureBlogTestAuthenticator } from '../../scripts/blog-test-database.mjs';

function fixtureUrl() {
  const url = new URL('postgresql://127.0.0.1:59423/fieldgrid_blog_isolated');
  url.username = 'fixture_admin'; url.password = randomBytes(32).toString('base64url');
  return url;
}
function fixtureEnv(url = fixtureUrl()) { return { DEPLOY_TARGET: 'local', FIELDGRID_BLOG_TEST_DATABASE_URL: url.href }; }

describe('explicit local blog fixture target', () => {
  it('requires credentials from the explicit environment and fixes every driver routing field', () => {
    const url = fixtureUrl(), config = blogTestDatabaseConfig(fixtureEnv(url));
    const client = new Client(config);
    expect(config).toMatchObject({ host: '127.0.0.1', port: 59423, database: 'fieldgrid_blog_isolated', user: url.username, password: url.password, ssl: false, options: '-c statement_timeout=15000' });
    expect(client.host).toBe('127.0.0.1'); expect(client.port).toBe(59423);
    expect(client.database).toBe('fieldgrid_blog_isolated');
    expect(() => blogTestDatabaseConfig({})).toThrow('FIELDGRID_BLOG_TEST_DATABASE_URL');
  });
  it.each(['localhost', '127.0.0.2', '127.1', '169.254.169.254', 'database.invalid'])('rejects every other host: %s', host => {
    const url = fixtureUrl(); url.hostname = host;
    expect(() => blogTestDatabaseConfig(fixtureEnv(url))).toThrow();
  });
  it('rejects routing overrides, wrong databases, missing credentials and hosted execution without leaking values', () => {
    const url = fixtureUrl(), value = url.href;
    const bad = [value + '?host=database.invalid', value + '?sslmode=require', value + '?', value + '#fragment', value + '#', value.replace(':59423/', ':59322/'), value.replace('/fieldgrid_blog_isolated', '/postgres'), value.replace('/fieldgrid_blog_isolated', '/fieldgrid_blog_upgrade'), value.replace('postgresql:', 'https:')];
    const noUser = fixtureUrl(); noUser.username = ''; noUser.password = ''; bad.push(noUser.href);
    const noPassword = fixtureUrl(); noPassword.password = ''; bad.push(noPassword.href);
    for (const candidate of bad) {
      try { blogTestDatabaseConfig({ FIELDGRID_BLOG_TEST_DATABASE_URL: candidate }); throw new Error('not rejected'); }
      catch (error) { expect(String(error)).toContain('FIELDGRID_BLOG_TEST_DATABASE_URL'); expect(String(error)).not.toContain(url.password); expect(String(error)).not.toContain(candidate); }
    }
    for (const env of [{ ...fixtureEnv(), DEPLOY_TARGET: 'staging' }, { ...fixtureEnv(), DEPLOY_TARGET: 'production' }, { ...fixtureEnv(), FIELDGRID_STAGING_SMOKE: '1' }]) expect(() => blogTestDatabaseConfig(env)).toThrow();
  });
  it('lets upgrades select only task-owned database names without changing the guarded connection authority', () => {
    const env = fixtureEnv(), base = blogTestDatabaseConfig(env), upgrade = blogTestDatabaseConfig(env, 'fieldgrid_blog_upgrade_acceptance');
    expect(upgrade).toEqual({ ...base, database: 'fieldgrid_blog_upgrade_acceptance' });
    for (const name of ['postgres', 'template0', 'fieldgrid_blog_', 'fieldgrid_blog_x;drop database postgres', 'fieldgrid_blog_' + 'x'.repeat(64)]) expect(() => blogTestDatabaseName(name)).toThrow();
  });
  it('refuses an actual database mismatch before changing the authenticator role', async () => {
    const queries: string[] = [];
    const db = { query: async (sql: string) => { queries.push(sql); return { rows: [{ database: 'postgres' }] }; } };
    await expect(assertBlogTestDatabase(db)).rejects.toThrow();
    await expect(configureBlogTestAuthenticator(db, '172.17.0.2')).rejects.toThrow();
    expect(queries.every(sql => sql.startsWith('select current_database()'))).toBe(true);
  });
  it('creates unique temporary credentials and sends only SCRAM verifiers to the scoped database', async () => {
    const queries: string[] = [];
    const db = { query: async (sql: string) => { queries.push(sql); return { rows: [{ database: 'fieldgrid_blog_isolated' }] }; } };
    const first = new URL(await configureBlogTestAuthenticator(db, '172.17.0.2'));
    const second = new URL(await configureBlogTestAuthenticator(db, '172.17.0.2'));
    expect(first.password).not.toBe(second.password);
    expect(first).toMatchObject({ hostname: '172.17.0.2', port: '5432', pathname: '/fieldgrid_blog_isolated', username: 'authenticator' });
    expect(queries.filter(sql => sql.startsWith('alter role'))).toHaveLength(2);
    for (const sql of queries.filter(sql => sql.startsWith('alter role'))) { expect(sql).toContain('SCRAM-SHA-256$4096:'); expect(sql).not.toContain(first.password); expect(sql).not.toContain(second.password); }
    await expect(configureBlogTestAuthenticator(db, 'database.invalid')).rejects.toThrow();
    const failed = { query: async (sql: string) => { if (sql.startsWith('select')) return { rows: [{ database: 'fieldgrid_blog_isolated' }] }; throw new Error(first.href); } };
    await expect(configureBlogTestAuthenticator(failed, '172.17.0.2')).rejects.toThrow('verbindingsgegevens worden niet gelogd');
  });
});

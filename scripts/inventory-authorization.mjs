/** Read-only inventory. Never reads .env or remote database configuration.
 * Output is schema/code metadata, not tenant records or credentials.
 * Run: node scripts/inventory-authorization.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

if (process.env.FIELDGRID_STAGING_SMOKE) throw new Error('Authorization inventory is local-only');
const paths = execFileSync('rg', ['--files', 'app', 'lib', 'components', 'supabase/migrations'], { encoding: 'utf8' }).trim().split('\n');
const codeChecks = [], migrations = new Map();
for (const path of paths) {
  if (path === 'lib/database.types.ts' || /\.(test|spec)\./.test(path)) continue;
  const source = readFileSync(path, 'utf8');
  source.split('\n').forEach((line, index) => {
    if (path.startsWith('supabase/migrations/')) {
      const match = /create\s+(?:or\s+replace\s+)?function\s+((?:public|private)\.\w+)/i.exec(line);
      if (match) { const entries = migrations.get(match[1]) ?? []; entries.push(`${path}:${index + 1}`); migrations.set(match[1], entries); }
    } else if (/hasAnyRole|requireRole|\.roles\b|isPlatformAdmin|isAdmin|isManager|user_metadata|ticket_has_cap|notification_cap/.test(line)) {
      codeChecks.push({ path, line: index + 1, code: line.trim(), customRoleCutover: 'pending' });
    }
  });
}
const db = await workOrderTestDatabase();
try {
  const principals = (await db.query("select rolname,rolsuper,rolbypassrls from pg_roles where rolname in ('authenticated','anon','service_role','postgres') order by rolname")).rows;
  const functions = (await db.query("select n.nspname||'.'||p.proname name,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef security_definer,pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosrc ~ 'has_role|member_roles|\\.roles' order by 1,2")).rows.map(f => ({ ...f, origins: migrations.get(f.name) ?? [], customRoleCutover: 'pending' }));
  const policies = (await db.query("select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') and (coalesce(qual,'')||coalesce(with_check,'')) ~ 'has_role|is_member' order by schemaname,tablename,policyname")).rows;
  const catalog = (await db.query('select * from public.permission_catalog order by domain,module,key')).rows;
  process.stdout.write(JSON.stringify({ schemaVersion: 2, source: 'non-activated custom-role cutover inventory from local schema and current working tree; release authorization review is tracked separately and this is not staging validation', principals, functions, policies, codeChecks, catalog }, null, 2) + '\n');
} finally { await db.end(); }

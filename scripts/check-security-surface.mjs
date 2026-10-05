/** Structural change detector, not an authorization audit or a release approval.
 * --capture prints code/schema metadata only. Review before updating the snapshot.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

const baseOperationalPaths = [
  ".env.example",
  ".github/workflows/_verify.yml",
  ".github/workflows/bootstrap-staging-admin.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-staging.yml",
  "deploy/Caddyfile.example",
  "deploy/clamav-daemon.socket.d/fieldgrid.conf.example",
  "deploy/clamd-ticket.conf.example",
  "deploy/fieldgrid-install-staging-release",
  "deploy/fieldgrid-worker@.service",
  "deploy/fieldgrid-worker@.timer",
  "deploy/fieldgrid@.service",
  "lib/env/staging-database.ts",
  "lib/env/staging-migration-command.ts",
  "lib/env/staging-migration-config.ts",
  "lib/env/staging-migration-diagnostic.ts",
  "lib/operations/auth-mail-diagnostic.ts",
  "lib/operations/auth-mail-context-diagnostic.ts",
  "next.config.ts",
  "package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "public/sw.js",
  "scripts/backup-database.sh",
  "scripts/backup-database.ts",
  "scripts/bootstrap-platform-admin.ts",
  "scripts/check-authorization-review.mjs",
  "scripts/check-clamav-socket.mjs",
  "scripts/check-release-secrets.mjs",
  "scripts/check-routing-provider.ts",
  "scripts/check-security-surface.mjs",
  "scripts/check-source-secrets.mjs",
  "scripts/check-staging-root-contract.sh",
  "scripts/check-staging-runner-contract.sh",
  "scripts/check-ticket-scanner.ts",
  "scripts/check-worker-timer.sh",
  "scripts/deploy-local.sh",
  "scripts/diagnose-auth-mail.ts",
  "scripts/diagnose-auth-mail-context.ts",
  "scripts/encrypt-staging-handoff.sh",
  "scripts/migrate-staging.ts",
  "scripts/migration-manifest.json",
  "scripts/migration-manifest.ts",
  "scripts/package-release.sh",
  "scripts/preflight.ts",
  "scripts/run-worker.mjs",
  "scripts/test-release-artifact.mjs",
  "scripts/test-staging-contract-linux.sh",
  "scripts/verify-healthcheck.mjs",
  "scripts/verify-local-migration-manifest.ts",
  "scripts/verify-migration-target.ts",
  "scripts/verify-public-auth-redirect.mjs",
  "scripts/write-runtime-env.sh",
  "supabase/config.toml",
  "vitest.config.mts",
];

export function operationalPaths() {
  const discovered = filesUnder([".github/workflows", "deploy", "patches"]);
  return [...new Set([...baseOperationalPaths, ...discovered])].sort();
}

export function filesUnder(roots) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  for (const root of roots) visit(root);
  return files.sort((a, b) => a.localeCompare(b, "en"));
}

export function operationSurface(path, source) {
  return { id: `operation:${path}`, classification: "operation", source_sha256: createHash("sha256").update(source).digest("hex") };
}

export function codeSurfaces(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const isAction = file.statements.some(s => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === "use server");
  const isRoute = path.startsWith("app/") && /\/(route|page|layout)\.[jt]sx?$/.test(path);
  const resources = new Set(), controls = new Set();
  const controlNames = /^(getAuthContext|require[A-Z]\w*|hasAnyRole|hasService|resolve[A-Z]\w*|createAdminClient|createClient|readPrivate[A-Z]\w*|readScannedFile|publishScannedFile|uploadScannedFile|scanFileBytes|verify[A-Z]\w*|authorize[A-Z]\w*)$/;
  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression) && ["rpc", "from"].includes(node.expression.name.text) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) resources.add(`${node.expression.name.text}:${node.arguments[0].text}`);
      if (ts.isIdentifier(node.expression) && controlNames.test(node.expression.text)) controls.add(node.expression.text);
      if (ts.isPropertyAccessExpression(node.expression) && ["getUser", "getClaims", "verifyOtp"].includes(node.expression.name.text)) controls.add(`auth.${node.expression.name.text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  // Server components and shared helpers can be the actual authorization or
  // browser-data boundary even when the importing page contains no direct
  // query. Keep every module with an observed data/control dependency in the
  // review inventory instead of treating only admin-client helpers as a
  // surface.
  if (!isAction && !isRoute && !resources.size && !controls.size) return [];
  const exports = new Set();
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const e of statement.exportClause.elements) exports.add(e.name.text);
      continue;
    }
    if (ts.isExportAssignment(statement)) { exports.add("default"); continue; }
    if (!statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (statement.modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) exports.add("default");
    else if (ts.isFunctionDeclaration(statement) && statement.name) exports.add(statement.name.text);
    else if (ts.isVariableStatement(statement)) {
      for (const d of statement.declarationList.declarations) if (ts.isIdentifier(d.name)) exports.add(d.name.text);
    }
  }
  // Include module-level queries, side effects and anonymous exports as well.
  if (!exports.size) exports.add("module");
  return [{
    id: `code:${path}`, exports: [...exports].sort(),
    classification: isAction ? "server-action" : isRoute ? "route-or-rsc" : "data-access-module",
    observedControls: [...controls].sort(), resources: [...resources].sort(),
    source_sha256: createHash("sha256").update(source).digest("hex"),
  }];
}

export async function inventory() {
  if (process.env.FIELDGRID_STAGING_SMOKE) throw new Error("Surface inventory is local-only");
  const paths = [...filesUnder(["app", "components", "lib"]), "proxy.ts"].filter(p => /\.[jt]sx?$/.test(p) && !/\.(test|spec)\./.test(p) && p !== "lib/database.types.ts").sort();
  const code = paths.flatMap(path => codeSurfaces(path, readFileSync(path,"utf8")));
  const operations = operationalPaths().map(path => operationSurface(path, readFileSync(path,"utf8")));
  const db = await workOrderTestDatabase();
  try {
    const tableRows = (await db.query(`select 'db:'||n.nspname||'.'||c.relname id,
      case c.relkind when 'v' then 'view' when 'm' then 'materialized-view' else 'table' end classification,
      c.relrowsecurity rls,c.relforcerowsecurity force_rls,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anonymous,
      has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated,
      has_table_privilege('anon',c.oid,'SELECT') anonymous_select,
      has_table_privilege('anon',c.oid,'INSERT') anonymous_insert,
      has_table_privilege('anon',c.oid,'UPDATE') anonymous_update,
      has_table_privilege('anon',c.oid,'DELETE') anonymous_delete,
      has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select,
      has_table_privilege('authenticated',c.oid,'INSERT') authenticated_insert,
      has_table_privilege('authenticated',c.oid,'UPDATE') authenticated_update,
      has_table_privilege('authenticated',c.oid,'DELETE') authenticated_delete,
      coalesce(c.relacl::text,'') acl,
      coalesce((select jsonb_agg(jsonb_build_object('name',p.policyname,'permissive',p.permissive,'roles',p.roles,'command',p.cmd,'using',p.qual,'check',p.with_check) order by p.policyname)
        from pg_policies p where p.schemaname=n.nspname and p.tablename=c.relname),'[]'::jsonb) policies,
      coalesce((select jsonb_agg(jsonb_build_object('grantee',cp.grantee,'column',cp.column_name,'privilege',cp.privilege_type) order by cp.grantee,cp.column_name,cp.privilege_type)
        from information_schema.column_privileges cp where cp.table_schema=n.nspname and cp.table_name=c.relname
        and cp.grantee in ('anon','authenticated','service_role','PUBLIC')),'[]'::jsonb) column_privileges,
      coalesce((select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid,true)) order by t.tgname)
        from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),'[]'::jsonb) triggers
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p','v','m') order by 1`)).rows;
    const tables = tableRows.map(({policies,column_privileges,triggers,acl,...row}) => ({...row,authorization_sha256:createHash("sha256").update(JSON.stringify({acl,policies,column_privileges,triggers})).digest("hex")}));
    const functionRows = (await db.query(`select 'rpc:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' id,
      case when p.prorettype in ('trigger'::regtype,'event_trigger'::regtype) then 'trigger-function'
        when n.nspname='private' then 'private-function' else 'public-rpc' end classification,
      p.prosecdef security_definer,has_function_privilege('anon',p.oid,'EXECUTE') anonymous,
      has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service,
      pg_get_functiondef(p.oid) definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
      and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') order by 1`)).rows;
    const functions = functionRows.map(({definition,...row}) => ({...row,definition_sha256:createHash("sha256").update(definition).digest("hex")}));
    return { version:1, meaning:"Observed entrypoints, data dependencies, operational release paths, policy/function fingerprints and grants; review status is enforced separately by authorization-review.json.", surfaces:[...code,...operations,...tables,...functions].sort((a,b)=>a.id.localeCompare(b.id,"en")) };
  } finally { await db.end(); }
}

async function main() {
  const current = await inventory();
  if (process.argv.includes("--capture")) { process.stdout.write(JSON.stringify(current,null,2)+"\n"); return; }
  const baseline = JSON.parse(readFileSync(new URL("../docs/security/authorization-surfaces.json",import.meta.url),"utf8"));
  const expected = new Map(baseline.surfaces.map(s => [s.id,JSON.stringify(s)]));
  const changed = current.surfaces.filter(s => expected.get(s.id) !== JSON.stringify(s)).map(s => s.id);
  const ids = new Set(current.surfaces.map(s=>s.id));
  const removed = baseline.surfaces.filter(s=>!ids.has(s.id)).map(s=>s.id);
  if (changed.length || removed.length) {
    for (const id of changed) console.error(`Authorization classification needs review: ${id}`);
    for (const id of removed) console.error(`Authorization surface removed/renamed: ${id}`);
    throw new Error("Review changed entrypoints, grants and resources, add authorization tests, then update the metadata snapshot. Capturing a snapshot alone is not approval.");
  }
  console.log(`${current.surfaces.length} entrypoint/resource classifications unchanged. Full review status remains in docs/security/release-security-inventory.md.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode=1; });

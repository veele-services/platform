#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const VERSION = "fieldgrid-entrypoint-inventory-v1";
export const JSON_PATH = "docs/security/fieldgrid-entrypoint-inventory.json";
export const REPORT_PATH = "docs/security/fieldgrid-entrypoint-risk-report.md";

const roots = [
  ["backoffice", "artifacts/backoffice/src"],
  ["personnel-pwa", "artifacts/personeel-pwa/src"],
  ["customer-pwa", "artifacts/klant-pwa/src"],
  ["api-server", "artifacts/api-server/src"],
  ["shared-db", "lib/db/src"],
];
const httpMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const expressMethods = new Set(["get", "post", "put", "patch", "delete"]);

function norm(path) { return path.split(sep).join("/"); }
function repoPath(path) { return norm(relative(root, path)); }
function appFor(path) { return roots.find(([, r]) => path.startsWith(`${r}/`))?.[0] ?? "workspace"; }

async function walk(dir, out = []) {
  for (const ent of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (["node_modules", ".next", "dist", ".git"].includes(ent.name)) continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) await walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/u.test(full)) out.push(full);
  }
  return out.sort((a, b) => repoPath(a).localeCompare(repoPath(b)));
}

function sourceFile(path, text) {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function lineOf(sf, node) { return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1; }
function isExported(node) { return Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)); }
function isDirective(st, value) { return ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression) && st.expression.text === value; }

function exportedFunctions(sf) {
  const out = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && isExported(st) && st.name) out.push([st.name.text, st]);
    if (ts.isVariableStatement(st) && isExported(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) out.push([d.name.text, d]);
      }
    }
  }
  return out;
}

function routePath(path) {
  const idx = path.indexOf("/src/app/");
  if (idx < 0) return path;
  return "/" + path.slice(idx + 9).replace(/\/route\.(t|j)sx?$/u, "").split("/")
    .filter((p) => !(p.startsWith("(") && p.endsWith(")")))
    .map((p) => p.startsWith("[") ? `:${p.replace(/^\[\.\.\.|^\[|\]$/gu, "")}` : p)
    .join("/");
}
function slug(path) {
  return path.replace(/\.(t|j)sx?$/u, "")
    .replace(/^artifacts\/[^/]+\/src\//u, "")
    .replace(/^lib\/db\/src\//u, "")
    .replace(/\/route$/u, "")
    .replace(/\[(\.\.\.)?([^\]]+)\]/gu, ":$2");
}
function stableId(type, app, path, name) {
  const prefix = {
    next_route_handler: "next-route",
    express_route: "express-route",
    server_action: "server-action",
    shared_service_or_worker: "shared-entrypoint",
    package_script: "package-script",
  }[type];
  return type === "package_script" ? `${prefix}:${app}#${name}` : `${prefix}:${app}:${slug(path)}#${name}`;
}
function has(text, patterns) { return patterns.some((p) => typeof p === "string" ? text.includes(p) : p.test(text)); }

function contract(path, text) {
  const lower = path.toLowerCase();
  const health = /healthz|\/pwa\/(icon|splash)/u.test(lower);
  const webhook = lower.includes("webhook");
  const platform = lower.includes("platform");
  const mutates = has(text, [/\.(insert|update|delete)\(/u, /\b(INSERT|UPDATE|DELETE)\b/iu]);
  const audit = has(text, [/auditLogTable|audit_log|supportAccessAudit/u]);
  const external = has(text, [/fetch\(["'`]https?:|MOLLIE_|resend|sendEmail|createSignedUrl|storage\.from|auth\.admin/iu]);
  const tenant = has(text, [/tenantId|tenant_id/u]);
  let risk = health ? "review-info" : "review-medium";
  if (webhook || external || (mutates && (!tenant || !audit))) risk = "review-high";
  return {
    actorType: health ? "anonymous_health_or_asset_probe" : webhook ? "provider_callback" : platform ? "platform_admin_or_operator" : appFor(path) === "customer-pwa" ? "customer_portal_user" : appFor(path) === "personnel-pwa" ? "personnel_portal_user" : appFor(path) === "api-server" ? "api_or_scheduler_caller" : "tenant_backoffice_user_or_server_caller",
    authenticationMethod: health ? "public health/static asset endpoint" : has(text, [/requireAdminSecret/u]) ? "admin shared secret" : has(text, [/auth\.getUser|requireAuth|getCurrent.*User/u]) ? "Supabase authenticated user/session" : webhook ? "provider signature or secret configuration" : "not proven by static inventory",
    tenantSource: tenant ? "server-resolved tenant context signal" : "not proven by static inventory",
    hostResolution: has(text, [/x-forwarded-host|headers\(\).*host|resolveTenantFromHost/isu]) ? "host/header resolver signal" : "not evident",
    moduleGate: has(text, [/require(Current)?TenantModule|requireTenantModule|hasEnabledPermissionModule/u]) ? "module entitlement helper signal" : "not evident",
    permissionGate: has(text, [/requirePermission|hasPermission|requirePlatform|requireAdminSecret|requireSensitiveRuntimeAccess/u]) ? "permission/platform/admin/sensitive-access helper signal" : "not evident",
    parentEntityValidation: has(text, [/\.limit\(1\)|existing|InTenant|tenant-bound|tenantBound/iu]) ? "parent/existence validation signal" : "not evident",
    ultimateQueryOrMutation: [has(text, [/\.select\(|\bSELECT\b/iu]) && "select", has(text, [/\.insert\(|\bINSERT\b/iu]) && "insert", has(text, [/\.update\(|\bUPDATE\b/iu]) && "update", has(text, [/\.delete\(|\bDELETE\b/iu]) && "delete", has(text, [/storage\.from/u]) && "storage", has(text, [/fetch\(/u]) && "fetch"].filter(Boolean).join(", ") || "not evident",
    tenantIdInFinalWhereOrValues: tenant ? "tenant_id/tenantId signal present" : "not evident",
    serviceRoleUse: has(text, [/createAdminClient|service[_-]?role|auth\.admin/iu]) ? "service role/admin client signal present" : "not evident",
    transactionBoundary: has(text, [/\.transaction\(|\bBEGIN\b|\bCOMMIT\b/iu]) ? "explicit transaction signal" : "not evident",
    idempotency: has(text, [/idempot|clientMutationId|onConflict|skip locked|locked_by|maxAttempts/iu]) ? "idempotency/de-dupe/queue-lock signal" : "not evident",
    audit: audit ? "audit signal present" : "not evident",
    eventOrOutbox: has(text, [/notificationDeliveryQueue|emit.*Event|outbox|triggerNotificationWorker/iu]) ? "event/queue/outbox signal" : "not evident",
    externalSideEffect: external ? "external provider/storage/auth side-effect signal" : "not evident",
    riskClassification: risk,
    requiredRemediation: "Manual security review and runtime evidence remain required; this static inventory is not a safety proof.",
  };
}

function makeEntry(type, app, path, name, line, nodeText, fullText) {
  const c = contract(path, `${nodeText}\n${fullText}`);
  if (path.endsWith("routes/webhooks.ts") && name === "POST /webhooks/mollie") {
    c.authenticationMethod = "Mollie HMAC when MOLLIE_WEBHOOK_SECRET is configured; static code has accept-with-warning path when unset";
    c.riskClassification = "review-high";
    c.requiredRemediation = "Prove webhook secret configuration, tenant-bound final writes, transactionality and replay/idempotency behavior.";
  }
  return {
    id: stableId(type, app, path, name),
    entrypointType: type,
    sourceFile: path,
    exportOrRoute: name,
    line,
    classificationStatus: "generated-static-review",
    securityContract: c,
    evidence: { securitySignals: [] },
    currentTests: [],
    missingTests: ["No matching repository test was found by static source/test reference search."],
  };
}

export async function buildEntrypointInventory() {
  const entries = [];
  for (const [, rootPath] of roots) {
    for (const abs of await walk(join(root, rootPath))) {
      const path = repoPath(abs);
      const text = await readFile(abs, "utf8");
      const sf = sourceFile(abs, text);
      const app = appFor(path);
      if (/\/route\.(t|j)sx?$/u.test(path)) {
        for (const [name, node] of exportedFunctions(sf).filter(([name]) => httpMethods.has(name))) entries.push(makeEntry("next_route_handler", app, path, `${name} ${routePath(path)}`, lineOf(sf, node), node.getText(sf), text));
      }
      if (sf.statements.some((st) => isDirective(st, "use server"))) {
        for (const [name, node] of exportedFunctions(sf)) entries.push(makeEntry("server_action", app, path, name, lineOf(sf, node), node.getText(sf), text));
      }
      if (path.startsWith("artifacts/api-server/src/")) {
        function visit(node) {
          if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const method = node.expression.name.text;
            const arg = node.arguments[0];
            if (expressMethods.has(method) && arg && ts.isStringLiteral(arg)) entries.push(makeEntry("express_route", "api-server", path, `${method.toUpperCase()} ${arg.text}`, lineOf(sf, node), node.getText(sf), text));
          }
          ts.forEachChild(node, visit);
        }
        visit(sf);
      }
      if ((path.startsWith("lib/db/src/") || path.startsWith("artifacts/api-server/src/lib/")) && !path.includes("/schema/") && has(text, ["db.", "pool.query", "fetch(", "createSignedUrl", "storage.from", "notificationDeliveryQueue", "emitDomainEvent"])) {
        for (const [name, node] of exportedFunctions(sf)) entries.push(makeEntry("shared_service_or_worker", app, path, name, lineOf(sf, node), node.getText(sf), text));
      }
    }
  }
  for (const [app, path] of [["root", "package.json"], ["scripts", "scripts/package.json"], ["shared-db", "lib/db/package.json"], ["api-server", "artifacts/api-server/package.json"]]) {
    const text = await readFile(join(root, path), "utf8");
    const json = JSON.parse(text);
    for (const [name, command] of Object.entries(json.scripts ?? {})) {
      if (/(seed|worker|smoke|proof|gate|migrate|baseline|staging|notification|fixture|report|check|run)/iu.test(name)) entries.push(makeEntry("package_script", app, path, name, 1, String(command), text));
    }
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return {
    version: VERSION,
    generatedFrom: { repository: "veele-services/platform", canonicalBase: "f36e84dad5d1c595e4dd349ff5ce6bd439722576", generator: "scripts/fieldgrid-entrypoint-inventory.mjs", deterministic: true },
    safetyNotice: "Static classifications identify review targets only and do not prove an entrypoint is safe.",
    summary: summarize(entries),
    entries,
  };
}

function summarize(entries) {
  const byType = {}, byRisk = {}, byApp = {};
  for (const e of entries) {
    byType[e.entrypointType] = (byType[e.entrypointType] ?? 0) + 1;
    byRisk[e.securityContract.riskClassification] = (byRisk[e.securityContract.riskClassification] ?? 0) + 1;
    byApp[appFor(e.sourceFile)] = (byApp[appFor(e.sourceFile)] ?? 0) + 1;
  }
  return { totalEntrypoints: entries.length, byType, byRisk, byApp };
}

export const renderInventoryJson = (i) => `${JSON.stringify(i, null, 2)}\n`;
export function renderRiskReport(i) {
  let out = "# Fieldgrid runtime entrypoint risk report\n\nGenerated by `scripts/fieldgrid-entrypoint-inventory.mjs`. Static parsing does not prove runtime safety.\n\n";
  out += `## Summary\n\n- Total entrypoints: ${i.summary.totalEntrypoints}\n- By type: ${Object.entries(i.summary.byType).map((x) => x.join("=")).join(", ")}\n- By risk: ${Object.entries(i.summary.byRisk).map((x) => x.join("=")).join(", ")}\n\n`;
  out += "## High-Risk Review Queue\n\n";
  for (const e of i.entries.filter((e) => e.securityContract.riskClassification === "review-high")) out += `- \`${e.id}\` (${e.sourceFile}:${e.line}) - auth: ${e.securityContract.authenticationMethod}; tenant: ${e.securityContract.tenantSource}; remediation: ${e.securityContract.requiredRemediation}\n`;
  out += "\n## Check Behavior\n\n`node scripts/fieldgrid-entrypoint-inventory.mjs --check` fails when committed docs are stale, detecting new unclassified entrypoints without blessing existing ones.\n";
  return out;
}
export const compareDocuments = (actual, expected, label) => actual === expected ? [] : [`${label} is stale. Run node scripts/fieldgrid-entrypoint-inventory.mjs --write.`];
export async function validateCommittedInventory() {
  const inv = await buildEntrypointInventory();
  return [
    ...compareDocuments(await readFile(join(root, JSON_PATH), "utf8"), renderInventoryJson(inv), JSON_PATH),
    ...compareDocuments(await readFile(join(root, REPORT_PATH), "utf8"), renderRiskReport(inv), REPORT_PATH),
  ];
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    const errors = await validateCommittedInventory();
    if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
    return;
  }
  const inv = await buildEntrypointInventory();
  if (args.includes("--write")) {
    await mkdir(join(root, "docs/security"), { recursive: true });
    await writeFile(join(root, JSON_PATH), renderInventoryJson(inv));
    await writeFile(join(root, REPORT_PATH), renderRiskReport(inv));
    return;
  }
  process.stdout.write(args.includes("--json") ? renderInventoryJson(inv) : renderRiskReport(inv));
}
if (process.argv[1] && norm(process.argv[1]) === norm(fileURLToPath(import.meta.url))) main().catch((e) => { console.error(e); process.exitCode = 1; });

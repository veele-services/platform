#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const DEFAULT_ROOT = process.cwd();
const DEFAULT_RUNTIME_ROOTS = [
  'artifacts/backoffice/src',
  'artifacts/personeel-pwa/src',
  'artifacts/klant-pwa/src',
  'artifacts/api-server/src',
  'lib/db/src',
];
const EXCLUDED_SEGMENTS = new Set([
  'node_modules', '.next', 'dist', 'build', 'coverage', 'out', 'out-tsc',
  'tests', 'test', '__tests__', 'docs', 'fixtures', 'e2e', 'playwright-report',
  'migrations', 'generated', '.generated', 'scripts', 'native', 'www',
]);
const REQUIRED_KINDS = [
  'server-action', 'route-handler', 'middleware', 'webhook-handler',
  'worker-entrypoint', 'scheduled-entrypoint', 'internal-privileged-command',
  'database-callsite', 'rpc-callsite', 'raw-sql-callsite', 'provider-boundary',
  'storage-signed-url-issuance',
];
const EXTERNAL_ENTRYPOINT_KINDS = new Set([
  'server-action', 'route-handler', 'middleware', 'webhook-handler',
]);
const INTERNAL_DBCALL_KINDS = new Set(['database-callsite', 'rpc-callsite', 'raw-sql-callsite']);
const RISK_DIMENSIONS = [
  'tenantSource', 'authSource', 'hostBinding', 'permissionCheck', 'moduleGate',
  'parentRowBinding', 'audit', 'idempotency', 'providerBoundary', 'evidenceLayer',
  'providerAuthentication', 'visibilityBinding', 'mutationIntent',
];
const CONTROL_REQUIREMENTS = {
  'server-action': ['tenantSource', 'authSource', 'permissionCheck'],
  'route-handler': ['authSource'],
  middleware: ['hostBinding', 'authSource'],
  'webhook-handler': ['providerBoundary', 'providerAuthentication', 'idempotency'],
  'worker-entrypoint': ['idempotency', 'audit'],
  'scheduled-entrypoint': ['idempotency', 'audit'],
  'internal-privileged-command': ['authSource', 'permissionCheck', 'audit'],
  'database-callsite': ['tenantSource'],
  'rpc-callsite': ['tenantSource'],
  'raw-sql-callsite': ['tenantSource'],
  'provider-boundary': ['providerBoundary'],
  'storage-signed-url-issuance': ['tenantSource', 'parentRowBinding', 'visibilityBinding'],
};

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(args.root ?? DEFAULT_ROOT);
const artifactPath = args.artifactPath ?? 'artifacts/runtime-entrypoints/fieldgrid-runtime-entrypoint-inventory.full.json';
const manifestPath = args.manifestPath ?? 'docs/runtime-entrypoints/manifest.json';
const summaryPath = args.summaryPath ?? 'docs/runtime-entrypoints/risk-summary.md';
const runtimeRoots = (args.runtimeRoots ?? DEFAULT_RUNTIME_ROOTS.join(','))
  .split(',')
  .map((root) => normalizePath(root.trim()))
  .filter(Boolean);

const inventory = buildInventory(repoRoot, runtimeRoots);
const fullJson = `${JSON.stringify(inventory, null, 2)}\n`;
const manifest = buildManifest(inventory, fullJson, artifactPath, runtimeRoots);
const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
const summary = buildSummary(manifest);

if (args.fullJson) {
  process.stdout.write(fullJson);
} else if (args.write || args.check) {
  writeFile(repoRoot, artifactPath, fullJson);
  if (args.check) {
    assertSame(readMaybe(repoRoot, manifestPath), manifestJson, 'compact manifest');
    assertSame(readMaybe(repoRoot, summaryPath), summary, 'risk summary');
  } else {
    writeFile(repoRoot, manifestPath, manifestJson);
    writeFile(repoRoot, summaryPath, summary);
  }
} else {
  process.stdout.write(manifestJson);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--write') parsed.write = true;
    else if (value === '--check') parsed.check = true;
    else if (value === '--full-json') parsed.fullJson = true;
    else if (value.startsWith('--root=')) parsed.root = value.slice('--root='.length);
    else if (value === '--root') parsed.root = values[++index];
    else if (value.startsWith('--runtime-roots=')) parsed.runtimeRoots = value.slice('--runtime-roots='.length);
    else if (value === '--runtime-roots') parsed.runtimeRoots = values[++index];
    else if (value.startsWith('--artifact-path=')) parsed.artifactPath = value.slice('--artifact-path='.length);
    else if (value.startsWith('--manifest-path=')) parsed.manifestPath = value.slice('--manifest-path='.length);
    else if (value.startsWith('--summary-path=')) parsed.summaryPath = value.slice('--summary-path='.length);
  }
  return parsed;
}

function buildInventory(root, roots) {
  const entries = [];
  const files = roots.flatMap((runtimeRoot) => collectSourceFiles(path.join(root, runtimeRoot), root));
  for (const file of files.sort()) scanSourceFile(root, file, entries);
  entries.sort((left, right) => `${left.file}:${left.kind}:${left.name}:${left.location.line}`.localeCompare(`${right.file}:${right.kind}:${right.name}:${right.location.line}`));
  return {
    schemaVersion: 2,
    generatedAt: 'stable-manifest',
    sourceRoot: 'veele-services/platform',
    runtimeRoots: roots,
    excludedRoots: [...EXCLUDED_SEGMENTS].sort(),
    requiredKinds: REQUIRED_KINDS,
    riskDimensions: RISK_DIMENSIONS,
    controlRequirements: CONTROL_REQUIREMENTS,
    counts: countEntries(entries),
    entries,
  };
}

function collectSourceFiles(directory, root) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const dirent of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, dirent.name);
    const relative = normalizePath(path.relative(root, absolute));
    if (isExcluded(relative)) continue;
    if (dirent.isDirectory()) files.push(...collectSourceFiles(absolute, root));
    else if (/\.[cm]?[jt]sx?$/.test(dirent.name)) files.push(relative);
  }
  return files;
}

function isExcluded(relative) {
  return relative.split('/').some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function scanSourceFile(root, file, entries) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const identifiers = collectClientIdentifiers(sourceFile);
  const fileKind = classifyFileAsEntrypoint(file, text);
  if (fileKind) addEntry(entries, sourceFile, fileKind.kind, fileKind.name, sourceFile, text, fileKind.detail);

  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && isNextRouteHandler(file, node.name.text)) {
      const kind = /webhook/i.test(file) ? 'webhook-handler' : 'route-handler';
      addEntry(entries, sourceFile, kind, node.name.text, node, node.getText(sourceFile), 'Next route handler export');
    }
    if (ts.isExportAssignment(node) && /middleware\.[jt]s$/.test(file)) {
      addEntry(entries, sourceFile, 'middleware', 'default', node, node.getText(sourceFile), 'Middleware default export');
    }
    if (ts.isCallExpression(node)) scanCallExpression(node, sourceFile, file, identifiers, entries);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function collectClientIdentifiers(sourceFile) {
  const supabase = new Set(['supabase']);
  const sql = new Set(['sql']);
  const db = new Set(['db']);
  function remember(name, bucket) { if (name) bucket.add(name); }
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.importClause) {
      const spec = node.moduleSpecifier.getText(sourceFile).replaceAll(/["']/g, '');
      const named = node.importClause.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const element of named.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          const local = element.name.text;
          if (/supabase|client/i.test(imported) && /supabase/i.test(spec)) remember(local, supabase);
          if (imported === 'sql' || /drizzle|postgres/i.test(spec)) remember(local, sql);
          if (/db|database/i.test(imported)) remember(local, db);
        }
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer.getText(sourceFile);
      if (/create.*Supabase|supabase|serviceRole/i.test(init)) remember(node.name.text, supabase);
      if (/drizzle|database|dbClient|getDb/i.test(init)) remember(node.name.text, db);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { supabase, sql, db };
}

function scanCallExpression(node, sourceFile, file, identifiers, entries) {
  const expression = node.expression;
  const text = node.getText(sourceFile);
  const property = propertyName(expression);
  const receiver = receiverName(expression);
  if ((property === 'from' || property === 'rpc') && identifiers.supabase.has(receiver)) {
    const name = firstStringArg(node) ?? `${receiver}.${property}`;
    addEntry(entries, sourceFile, property === 'rpc' ? 'rpc-callsite' : 'database-callsite', name, node, text, `Supabase ${property} call`);
  }
  if (['execute', 'query'].includes(property) && identifiers.db.has(receiver)) {
    addEntry(entries, sourceFile, 'raw-sql-callsite', `${receiver}.${property}`, node, text, 'Drizzle/database SQL execution');
  }
  if (/createSignedUrls?/.test(property ?? '') || /signedUrl/i.test(property ?? '')) {
    addEntry(entries, sourceFile, 'storage-signed-url-issuance', property, node, text, 'Storage signed URL issuance');
  }
  if (/stripe|mollie|firebase|google|resend|twilio/i.test(text)) {
    addEntry(entries, sourceFile, 'provider-boundary', property ?? 'provider-call', node, text, 'Provider SDK/API boundary');
  }
  if (/sql`/.test(text) || (ts.isTaggedTemplateExpression(node.parent) && identifiers.sql.has(node.parent.tag.getText(sourceFile)))) {
    addEntry(entries, sourceFile, 'raw-sql-callsite', 'sql', node, text, 'SQL tagged template');
  }
}

function classifyFileAsEntrypoint(file, text) {
  if (/src\/middleware\.[cm]?[jt]s$/.test(file)) return { kind: 'middleware', name: path.basename(file), detail: 'Framework middleware file' };
  if (/src\/actions\//.test(file) && /['"]use server['"]/.test(text)) return { kind: 'server-action', name: path.basename(file), detail: 'Server action module' };
  if (/src\/routes\//.test(file)) {
    if (/webhook/i.test(file)) return { kind: 'webhook-handler', name: path.basename(file), detail: 'API provider webhook route' };
    return { kind: 'route-handler', name: path.basename(file), detail: 'API server route module' };
  }
  if (/webhook/i.test(file) && /POST|post|handler|route/i.test(text)) return { kind: 'webhook-handler', name: path.basename(file), detail: 'Provider webhook module' };
  if (/(worker|queue|job)/i.test(file) && /export|process|handler|start/i.test(text)) return { kind: 'worker-entrypoint', name: path.basename(file), detail: 'Worker runtime module' };
  if (/(cron|scheduled|scheduler)/i.test(file) && /export|schedule|handler|cron/i.test(text)) return { kind: 'scheduled-entrypoint', name: path.basename(file), detail: 'Scheduled runtime module' };
  return null;
}

function addEntry(entries, sourceFile, kind, name, node, evidence, detail) {
  const controls = inferControls(evidence, kind);
  const severity = inferSeverity(kind, controls);
  entries.push({
    id: hash(`${kind}:${sourceFile.fileName}:${name}:${locationOf(sourceFile, node).line}`).slice(0, 16),
    concept: conceptForKind(kind),
    kind,
    name,
    file: sourceFile.fileName,
    location: locationOf(sourceFile, node),
    detail,
    risk: { severity, requiredControls: CONTROL_REQUIREMENTS[kind] ?? [], ...controls },
  });
}

function inferControls(text, kind) {
  return {
    tenantSource: /tenant(Id|Slug|_id)|tenant\b|organization|workspace/i.test(text),
    authSource: /auth|session|userId|requireUser|jwt|cookie|currentUser/i.test(text),
    hostBinding: /host|hostname|domain|subdomain|headers\(/i.test(text),
    permissionCheck: /permission|requirePermission|hasPermission|role|rbac|authorize/i.test(text),
    moduleGate: /module|feature flag|enabledModules|requireModule/i.test(text),
    parentRowBinding: /assignmentId|customerId|objectId|invoiceId|quoteId|parent|where\(/i.test(text),
    audit: /audit|log.*event|event.*log|activity|track/i.test(text),
    idempotency: /idempot|dedupe|unique|upsert|conflict|already|once/i.test(text),
    providerBoundary: /stripe|mollie|webhook|firebase|google|resend|twilio|provider/i.test(text) || kind === 'webhook-handler',
    evidenceLayer: /evidence|artifact|receipt|signature|trace|metadata/i.test(text),
    providerAuthentication: /signature|verify|secret|token|hmac|webhook.*auth/i.test(text),
    visibilityBinding: /visibility|public|private|signed|download|owner/i.test(text),
    mutationIntent: /insert|update|delete|upsert|create|archive|mutate|POST|PUT|PATCH|DELETE/i.test(text),
  };
}

function inferSeverity(kind, controls) {
  if (kind === 'provider-boundary') return 'informational';
  const required = CONTROL_REQUIREMENTS[kind] ?? [];
  const missing = required.filter((control) => !controls[control]);
  if (missing.length === 0) return controls.mutationIntent ? 'medium' : 'low';
  if (['webhook-handler', 'storage-signed-url-issuance', 'internal-privileged-command'].includes(kind)) return 'review-required';
  if (missing.length >= 2 && EXTERNAL_ENTRYPOINT_KINDS.has(kind)) return 'high';
  if (missing.length >= 2) return 'medium';
  return 'low';
}

function countEntries(entries) {
  const counts = {
    total: entries.length,
    externalEntrypoints: entries.filter((entry) => EXTERNAL_ENTRYPOINT_KINDS.has(entry.kind)).length,
    internalDbCallsites: entries.filter((entry) => INTERNAL_DBCALL_KINDS.has(entry.kind)).length,
    byKind: Object.fromEntries(REQUIRED_KINDS.map((kind) => [kind, 0])),
    bySeverity: { 'review-required': 0, high: 0, medium: 0, low: 0, informational: 0 },
  };
  for (const entry of entries) {
    counts.byKind[entry.kind] = (counts.byKind[entry.kind] ?? 0) + 1;
    counts.bySeverity[entry.risk.severity] = (counts.bySeverity[entry.risk.severity] ?? 0) + 1;
  }
  return counts;
}

function buildManifest(inventory, fullJson, artifact, roots) {
  return {
    schemaVersion: inventory.schemaVersion,
    artifactName: 'fieldgrid-runtime-entrypoint-inventory-full',
    artifactPath: artifact,
    inventoryHash: `sha256:${hash(fullJson)}`,
    runtimeRoots: roots,
    excludedRoots: inventory.excludedRoots,
    counts: inventory.counts,
    kindHashes: Object.fromEntries(REQUIRED_KINDS.map((kind) => [kind, `sha256:${hash(JSON.stringify(inventory.entries.filter((entry) => entry.kind === kind).map(stableEntry)))}`])),
    riskDimensions: RISK_DIMENSIONS,
    controlRequirements: CONTROL_REQUIREMENTS,
    requiredKinds: REQUIRED_KINDS,
  };
}

function stableEntry(entry) { return { kind: entry.kind, name: entry.name, file: entry.file, line: entry.location.line, severity: entry.risk.severity }; }
function buildSummary(manifest) {
  return [
    '# Fieldgrid runtime entrypoint risk summary', '',
    `Full inventory is uploaded as CI artifact \`${manifest.artifactName}\`.`, '',
    `- Runtime entrypoints and callsites: ${manifest.counts.total}`,
    `- External entrypoints: ${manifest.counts.externalEntrypoints}`,
    `- Internal DB callsites: ${manifest.counts.internalDbCallsites}`,
    `- Review required: ${manifest.counts.bySeverity['review-required']}`,
    `- High: ${manifest.counts.bySeverity.high}`,
    `- Medium: ${manifest.counts.bySeverity.medium}`,
    `- Low: ${manifest.counts.bySeverity.low}`,
    `- Informational: ${manifest.counts.bySeverity.informational}`,
    '', '## Runtime roots', ...manifest.runtimeRoots.map((root) => `- ${root}`),
    '', '## Excluded roots', ...manifest.excludedRoots.map((root) => `- ${root}`),
    '', '## Counts by kind', ...Object.entries(manifest.counts.byKind).map(([kind, count]) => `- ${kind}: ${count}`),
    '', '## Risk dimensions', ...RISK_DIMENSIONS.map((dimension) => `- ${dimension}`), '',
  ].join('\n');
}

function conceptForKind(kind) {
  if (EXTERNAL_ENTRYPOINT_KINDS.has(kind)) return 'externally invokable entrypoint';
  if (kind === 'internal-privileged-command') return 'internal privileged command';
  if (INTERNAL_DBCALL_KINDS.has(kind)) return 'database callsite';
  if (kind === 'provider-boundary') return 'provider boundary';
  if (kind === 'storage-signed-url-issuance') return 'storage URL issuance';
  return 'worker/scheduled entrypoint';
}
function propertyName(expression) { return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined; }
function receiverName(expression) { return ts.isPropertyAccessExpression(expression) ? expression.expression.getText() : undefined; }
function firstStringArg(node) { const arg = node.arguments[0]; return arg && ts.isStringLiteralLike(arg) ? arg.text : undefined; }
function isNextRouteHandler(file, name) { return /route\.[cm]?[jt]s$/.test(file) && /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(name); }
function scriptKind(file) { return file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TS; }
function locationOf(sourceFile, node) { const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)); return { line: pos.line + 1, column: pos.character + 1 }; }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function normalizePath(value) { return value.replaceAll('\\', '/').replace(/^\.\//, ''); }
function writeFile(root, relative, content) { const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
function readMaybe(root, relative) { const target = path.join(root, relative); return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''; }
function assertSame(actual, expected, label) { if (actual !== expected) { console.error(`Runtime entrypoint ${label} is stale. Run pnpm fieldgrid:runtime-entrypoints:write.`); process.exit(1); } }

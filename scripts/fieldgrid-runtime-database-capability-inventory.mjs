#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const repoRoot = process.cwd();
const runtimeRoots = [
  "artifacts/backoffice/src",
  "artifacts/personeel-pwa/src",
  "artifacts/klant-pwa/src",
  "artifacts/website-runtime/src",
  "artifacts/marketing-website",
  "artifacts/api-server/src",
  "lib/db/src",
];
const excludedSegments = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "out",
  "tests",
  "test",
  "__tests__",
  "fixtures",
  "e2e",
  "migrations",
  "generated",
  "scripts",
  "seed",
  "native",
  "www",
  "schema",
]);
const operationOrder = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const migrationPath = path.join(
  repoRoot,
  "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
);
const args = new Set(process.argv.slice(2));

const schemaTables = loadSchemaTables();
const knownRelations = loadKnownRelations(schemaTables);
const sourceCapabilities = scanRuntimeSources(schemaTables);
const sourceFunctions = scanRuntimeFunctions();

if (args.has("--check")) {
  checkMigrationManifest();
  process.stdout.write(`${JSON.stringify({
    status: "passed",
    directRelations: sourceCapabilities.size,
    directFunctions: sourceFunctions.size,
    catalogRelations: knownRelations.size,
  })}\n`);
  process.exit(0);
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  runtimeRoots,
  relations: [...sourceCapabilities.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relation, detail]) => ({
      relation: `public.${relation}`,
      privileges: operationOrder.filter((operation) => detail.operations.has(operation)),
      evidence: [...detail.evidence].sort(),
    })),
  functions: [...sourceFunctions].sort(),
}, null, 2)}\n`);

function checkMigrationManifest() {
  const migration = fs.readFileSync(migrationPath, "utf8");
  const manifest = loadSourceAwareManifest();
  const relationManifest = new Map(
    [...manifest.relations]
      .filter(([, capability]) => capability.schema === "public")
      .map(([identity, capability]) => [identity.slice("public.".length), capability]),
  );

  assertSetEqual(
    new Set(relationManifest.keys()),
    knownRelations,
    "relation manifest/catalog",
  );
  for (const [relation, capability] of sourceCapabilities) {
    const manifested = relationManifest.get(relation);
    assert(manifested?.mode === "direct", `Runtime relation must be direct: public.${relation}`);
    assertSetEqual(
      new Set(manifested.privileges),
      capability.operations,
      `runtime privileges for public.${relation}`,
    );
  }

  const nonDirectModes = new Map([
    ["assignment_code_sequences", "indirect"],
    ["code_sequences", "indirect"],
    ["assignment_personnel_lifecycle_history", "function_only"],
    ["offline_operation_receipts", "function_only"],
    ["portal_realtime_events", "function_only"],
    ["customer_regions", "unused"],
    ["release_ticket_links", "unused"],
    ["roadmap_item_ticket_links", "unused"],
  ]);
  for (const [relation, mode] of nonDirectModes) {
    assert(relationManifest.get(relation)?.mode === mode,
      `Expected public.${relation} to use ${mode} mode`);
  }

  const functionManifest = new Map(
    [...manifest.functions.values()].map((capability) => [
      `${capability.schema}.${capability.name}`,
      capability.mode,
    ]),
  );
  const expectedDirect = new Set(sourceFunctions);
  assertSetEqual(
    new Set([...functionManifest].filter(([, mode]) => mode === "direct").map(([name]) => name)),
    expectedDirect,
    "direct function manifest/source",
  );
  assert(functionManifest.get("public.fieldgrid_generate_personnel_login_code") === "default_expression",
    "Personnel login-code default function must stay manifested");
  assertSetEqual(
    new Set([...functionManifest].filter(([, mode]) => mode === "trigger_dependency").map(([name]) => name)),
    new Set([
      "public.assignment_sector_prefix",
      "public.fieldgrid_assert_staffing_eligibility",
      "public.next_assignment_code",
      "public.next_entity_code",
      "public.resolve_assignment_sector_prefix",
      "public.website_assert_route_integrity",
    ]),
    "trigger function dependency manifest",
  );

  assert(!/\b(?:GRANT|REVOKE)\s+[^;]*\bON\s+ALL\s+(?:TABLES|SEQUENCES|FUNCTIONS)\b/iu.test(migration),
    "Broad schema grants/revokes are forbidden");
  assert(
    /ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+current_user\s+REVOKE\s+EXECUTE\s+ON\s+FUNCTIONS\s+FROM\s+PUBLIC/iu.test(migration),
    "Migration-admin function defaults must globally deny PUBLIC EXECUTE",
  );
  assert(
    !/ALTER\s+DEFAULT\s+PRIVILEGES[^;]*IN\s+SCHEMA[^;]*REVOKE\s+EXECUTE\s+ON\s+FUNCTIONS\s+FROM\s+PUBLIC/iu.test(migration),
    "A schema-scoped REVOKE cannot override PostgreSQL's global PUBLIC function default",
  );
  const manifestDeletes = [...migration.matchAll(
    /DELETE\s+FROM\s+app_private\.fieldgrid_runtime_(?:relation|function|sequence)_capabilities([\s\S]*?);/giu,
  )];
  assert(manifestDeletes.length === 3, "All three capability registries need replay cleanup");
  assert(manifestDeletes.every((match) =>
    /WHERE\s+source_migration\s*=\s*'20260909120000_runtime_least_privilege_principals\.sql'/iu.test(match[0])),
  "Capability replay cleanup must preserve later forward-migration declarations");
  assert(!/\bOWNER\s+TO\s+fieldgrid_runtime_/iu.test(migration),
    "Runtime roles may not own database objects");
}

function loadSourceAwareManifest() {
  const manifests = {
    relations: new Map(),
    functions: new Map(),
    sequences: new Map(),
  };
  const specifications = [
    {
      table: "fieldgrid_runtime_relation_capabilities",
      target: manifests.relations,
      tuple: /\(\s*'((?:public|app_private))',\s*'([a-z][a-z0-9_]*)',\s*'(direct|indirect|function_only|unused)',\s*ARRAY\[([^\]]*)\]::text\[\](?:,\s*'([^']+)')?\s*\)/gu,
      convert: (match, migration) => [
        `${match[1]}.${match[2]}`,
        {
          schema: match[1], name: match[2], mode: match[3],
          privileges: [...match[4].matchAll(/'([A-Z]+)'/gu)].map((entry) => entry[1]),
          sourceMigration: match[5] ?? migration,
          explicitSource: Boolean(match[5]),
        },
      ],
    },
    {
      table: "fieldgrid_runtime_function_capabilities",
      target: manifests.functions,
      tuple: /\(\s*'((?:public|app_private))',\s*'([a-z][a-z0-9_]*)',\s*'([^']*)',\s*'(direct|default_expression|trigger_dependency)'(?:,\s*'([^']+)')?\s*\)/gu,
      convert: (match, migration) => [
        `${match[1]}.${match[2]}(${match[3]})`,
        {
          schema: match[1], name: match[2], argumentTypes: match[3], mode: match[4],
          sourceMigration: match[5] ?? migration,
          explicitSource: Boolean(match[5]),
        },
      ],
    },
    {
      table: "fieldgrid_runtime_sequence_capabilities",
      target: manifests.sequences,
      tuple: /\(\s*'((?:public|app_private))',\s*'([a-z][a-z0-9_]*)',\s*'(trigger_dependency|function_only)',\s*ARRAY\[([^\]]*)\]::text\[\](?:,\s*'([^']+)')?\s*\)/gu,
      convert: (match, migration) => [
        `${match[1]}.${match[2]}`,
        {
          schema: match[1], name: match[2], mode: match[3],
          privileges: [...match[4].matchAll(/'([A-Z]+)'/gu)].map((entry) => entry[1]),
          sourceMigration: match[5] ?? migration,
          explicitSource: Boolean(match[5]),
        },
      ],
    },
  ];
  const migrationNames = fs.readdirSync(path.join(repoRoot, "lib/db/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrationNames) {
    const sql = fs.readFileSync(path.join(repoRoot, "lib/db/migrations", migration), "utf8");
    for (const specification of specifications) {
      const insertion = new RegExp(
        `INSERT\\s+INTO\\s+app_private\\.${specification.table}`
          + `\\s*\\([^;]*?\\)\\s*VALUES\\s*[\\s\\S]*?;`,
        "giu",
      );
      for (const statement of sql.matchAll(insertion)) {
        for (const tuple of statement[0].matchAll(specification.tuple)) {
          const [identity, capability] = specification.convert(tuple, migration);
          assert(
            capability.sourceMigration === migration,
            `Capability ${identity} declares the wrong source migration`,
          );
          assert(
            migration === path.basename(migrationPath) || capability.explicitSource,
            `Forward capability ${identity} must declare source_migration explicitly`,
          );
          specification.target.set(identity, capability);
        }
      }
    }
  }
  return manifests;
}

function scanRuntimeFunctions() {
  const knownFunctions = new Set();
  const migrationsRoot = path.join(repoRoot, "lib/db/migrations");
  for (const file of collectFiles(migrationsRoot, (name) => name.endsWith(".sql"))) {
    const sql = fs.readFileSync(file, "utf8");
    for (const match of sql.matchAll(
      /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:(public|app_private)\.)?([a-z][a-z0-9_]*)\s*\(/gi,
    )) {
      knownFunctions.add(`${(match[1] ?? "public").toLowerCase()}.${match[2]}`);
    }
  }

  const direct = new Set();
  for (const runtimeRoot of runtimeRoots) {
    for (const file of collectSourceFiles(path.join(repoRoot, runtimeRoot), { exclude: true })) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/\b(public|app_private)\.([a-z][a-z0-9_]*)\s*\(/gi)) {
        const identity = `${match[1].toLowerCase()}.${match[2]}`;
        if (knownFunctions.has(identity)) direct.add(identity);
      }
    }
  }
  return direct;
}

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `Missing manifest section: ${startMarker}`);
  return source.slice(start, end);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSetEqual(actual, expected, label) {
  const missing = [...expected].filter((value) => !actual.has(value)).sort();
  const unexpected = [...actual].filter((value) => !expected.has(value)).sort();
  assert(missing.length === 0 && unexpected.length === 0,
    `${label} mismatch; missing=[${missing.join(", ")}], unexpected=[${unexpected.join(", ")}]`);
}

function loadSchemaTables() {
  const schemaRoot = path.join(repoRoot, "lib/db/src/schema");
  const tables = new Map();
  for (const file of collectSourceFiles(schemaRoot, { exclude: false })) {
    const source = parseSource(file);
    walk(source, (node) => {
      if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
      const call = unwrapCall(node.initializer);
      if (!call || !isPgTableCall(call.expression)) return;
      const relation = stringValue(call.arguments[0]);
      if (relation) tables.set(node.name.text, relation);
    });
  }
  return tables;
}

function loadKnownRelations(tables) {
  const relations = new Set(tables.values());
  const migrationsRoot = path.join(repoRoot, "lib/db/migrations");
  for (const file of collectFiles(migrationsRoot, (name) => name.endsWith(".sql"))) {
    const sql = fs.readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/^\s*--.*$/gmu, "");
    for (const match of sql.matchAll(/\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:([a-z][a-z0-9_]*)\.)?([a-z][a-z0-9_]*)\b/gi)) {
      if (!match[1] || match[1].toLowerCase() === "public") relations.add(match[2]);
    }
  }
  return relations;
}

function scanRuntimeSources(tables) {
  const result = new Map();
  for (const runtimeRoot of runtimeRoots) {
    const absoluteRoot = path.join(repoRoot, runtimeRoot);
    for (const file of collectSourceFiles(absoluteRoot, { exclude: true })) {
      const source = parseSource(file);
      const aliases = collectTableAliases(source, tables);
      const relative = normalize(path.relative(repoRoot, file));
      walk(source, (node) => {
        if (ts.isCallExpression(node)) {
          scanDrizzleCall(node, source, aliases, relative, result);
          scanQueryCall(node, source, aliases, relative, result);
        }
        if (ts.isTaggedTemplateExpression(node)) {
          scanSqlTemplate(node.template, source, aliases, relative, result);
        }
      });
    }
  }
  return result;
}

function collectTableAliases(source, tables) {
  const aliases = new Map(tables);
  walk(source, (node) => {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const element of node.importClause.namedBindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        const relation = tables.get(imported);
        if (relation) aliases.set(element.name.text, relation);
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isIdentifier(node.initializer)) {
      const relation = aliases.get(node.initializer.text);
      if (relation) aliases.set(node.name.text, relation);
    }
  });
  return aliases;
}

function scanDrizzleCall(node, source, aliases, relative, result) {
  if (!ts.isPropertyAccessExpression(node.expression)) return;
  const method = node.expression.name.text;
  const relation = relationFromExpression(node.arguments[0], aliases);
  if (!relation) return;

  if (["from", "innerJoin", "leftJoin", "rightJoin", "fullJoin", "crossJoin"].includes(method)) {
    addCapability(result, relation, "SELECT", relative, source, node);
  } else if (method === "insert") {
    addCapability(result, relation, "INSERT", relative, source, node);
    const chain = fluentStatementText(node, source);
    if (/\.onConflictDoUpdate\s*\(/.test(chain)) {
      addCapability(result, relation, "UPDATE", relative, source, node);
      addCapability(result, relation, "SELECT", relative, source, node);
    }
    if (/\.returning\s*\(/.test(chain)) {
      addCapability(result, relation, "SELECT", relative, source, node);
    }
  } else if (method === "update") {
    addCapability(result, relation, "UPDATE", relative, source, node);
    addCapability(result, relation, "SELECT", relative, source, node);
  } else if (method === "delete") {
    addCapability(result, relation, "DELETE", relative, source, node);
    addCapability(result, relation, "SELECT", relative, source, node);
  }
}

function scanQueryCall(node, source, aliases, relative, result) {
  if (!ts.isPropertyAccessExpression(node.expression)) return;
  if (!["query", "execute"].includes(node.expression.name.text)) return;
  for (const argument of node.arguments) {
    if (ts.isTaggedTemplateExpression(argument)) {
      scanSqlTemplate(argument.template, source, aliases, relative, result);
    } else if (ts.isNoSubstitutionTemplateLiteral(argument) || ts.isStringLiteralLike(argument)) {
      scanSqlText(argument.text, relative, source, argument, result);
    }
  }
}

function scanSqlTemplate(template, source, aliases, relative, result) {
  const text = template.getText(source);
  scanSqlText(text, relative, source, template, result);

  if (!ts.isTemplateExpression(template)) return;
  for (const span of template.templateSpans) {
    const relation = relationFromExpression(span.expression, aliases);
    if (!relation) continue;
    const prefix = text.slice(0, Math.max(0, span.expression.getStart(source) - template.getStart(source)));
    const operation = operationBefore(prefix);
    if (operation) addCapability(result, relation, operation, relative, source, span.expression);
    if (["UPDATE", "DELETE"].includes(operation)) {
      addCapability(result, relation, "SELECT", relative, source, span.expression);
    }
  }
}

function scanSqlText(text, relative, source, node, result) {
  const normalizedText = text.replaceAll(/["'`]/g, " ");
  const patterns = [
    ["SELECT", /\b(?:from|join)\s+(?:([a-z][a-z0-9_]*)\.)?([a-z][a-z0-9_]*)\b/gi],
    ["INSERT", /\binsert\s+into\s+(?:([a-z][a-z0-9_]*)\.)?([a-z][a-z0-9_]*)\b/gi],
    ["UPDATE", /\bupdate\s+(?:([a-z][a-z0-9_]*)\.)?([a-z][a-z0-9_]*)\b/gi],
    ["DELETE", /\bdelete\s+from\s+(?:([a-z][a-z0-9_]*)\.)?([a-z][a-z0-9_]*)\b/gi],
  ];
  for (const [operation, pattern] of patterns) {
    for (const match of normalizedText.matchAll(pattern)) {
      if (match[1] && match[1].toLowerCase() !== "public") continue;
      const relation = match[2];
      if (!knownRelations.has(relation)) continue;
      addCapability(result, relation, operation, relative, source, node);
      if (["UPDATE", "DELETE"].includes(operation)) {
        addCapability(result, relation, "SELECT", relative, source, node);
      }
      if (operation === "INSERT" && /\bon\s+conflict\b[\s\S]*?\bdo\s+update\b/i.test(normalizedText)) {
        addCapability(result, relation, "UPDATE", relative, source, node);
        addCapability(result, relation, "SELECT", relative, source, node);
      }
      if (operation === "INSERT" && /\breturning\b/i.test(normalizedText)) {
        addCapability(result, relation, "SELECT", relative, source, node);
      }
    }
  }
}

function fluentStatementText(node, source) {
  let current = node;
  while (current.parent && ![
    ts.SyntaxKind.ExpressionStatement,
    ts.SyntaxKind.VariableDeclaration,
    ts.SyntaxKind.ReturnStatement,
  ].includes(current.parent.kind)) {
    current = current.parent;
  }
  return current.parent?.getText(source) ?? current.getText(source);
}

function operationBefore(text) {
  const tokens = [...text.matchAll(/\b(select|from|join|insert\s+into|update|delete\s+from)\b/gi)];
  const token = tokens.at(-1)?.[1]?.toLowerCase();
  if (token === "insert into") return "INSERT";
  if (token === "update") return "UPDATE";
  if (token === "delete from") return "DELETE";
  if (["select", "from", "join"].includes(token)) return "SELECT";
  return null;
}

function addCapability(result, relation, operation, relative, source, node) {
  const detail = result.get(relation) ?? { operations: new Set(), evidence: new Set() };
  detail.operations.add(operation);
  const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  detail.evidence.add(`${relative}:${line}`);
  result.set(relation, detail);
}

function relationFromExpression(expression, aliases) {
  if (!expression) return null;
  if (ts.isIdentifier(expression)) return aliases.get(expression.text) ?? null;
  if (ts.isPropertyAccessExpression(expression)) return aliases.get(expression.name.text) ?? null;
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "alias") {
    return relationFromExpression(expression.arguments[0], aliases);
  }
  return null;
}

function collectSourceFiles(directory, { exclude }) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!exclude || !excludedSegments.has(entry.name)) files.push(...collectSourceFiles(absolute, { exclude }));
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}

function collectFiles(directory, accept) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(absolute, accept));
    else if (accept(entry.name)) files.push(absolute);
  }
  return files;
}

function parseSource(file) {
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function walk(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => walk(child, callback));
}

function unwrapCall(expression) {
  if (ts.isCallExpression(expression)) return expression;
  if ("expression" in expression && expression.expression && ts.isCallExpression(expression.expression)) {
    return expression.expression;
  }
  return null;
}

function isPgTableCall(expression) {
  return (ts.isIdentifier(expression) && expression.text === "pgTable")
    || (ts.isPropertyAccessExpression(expression) && expression.name.text === "pgTable");
}

function stringValue(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function normalize(value) {
  return value.split(path.sep).join("/");
}

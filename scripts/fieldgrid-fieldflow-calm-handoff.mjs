#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_ROOT = resolve(ROOT, "docs/uiux/fieldflow-calm-handoff");
const PROTOTYPE_COMMIT = "098d3ce41da66851675fe467eb9747ebff5bd4ae";
const PLATFORM_BASE_COMMIT = "ba81cc18aaf8aa2d93d292c0def49d5c997307dc";
const OBSERVED_MAIN_COMMIT = "f2483186c1e49b4ecda341dc56931e6dc1194247";
const REFERENCE_NORMALIZATION_SHA256 =
  "1c2b732877b821616826dcb5a2720a5a0e318cdcbfc30912c0d6db3e6a7feb9d";
const CANONICAL_THEME_STYLESHEET_SHA256 =
  "0888d74c18068753d8ecced2caf2af3b8e97b97d615bed1eb27f2af2e5f8c2d4";
const CANONICAL_THEME_SEMANTIC_SHA256 =
  "5ef0276d8b38db6a1d7e47404f8b37562ad06e410d54f345f0819c43a6493b84";
const CANONICAL_THEME_RESOLUTION_SHA256 =
  "9254176dabd3bdbcca404f3927cd69339713c40ed2e31de4e2476ee5f6dab729";
const CANONICAL_THEME_FIXTURE_SHA256 =
  "9ca02c8def0805d87b21681edc909c2fc209793224e4c2568e75cf3a1e4d48e1";
const SURFACES_CONTENT_SHA256 =
  "676b491d8762735e581c1d0702be048b378cf1282ad858ee91ebd0d9e5ac5eea";
const ROUTES_CONTENT_SHA256 =
  "62eadb17543d516e285a035359b683260103dbddf4ae7d900a3c2b0fc0d7df6c";
const PRODUCTION_INVENTORY_CONTENT_SHA256 =
  "84f152e580936c2c9aa28845997d2acf7ac53faa01693266aad8223a2906a850";
const ACCEPTANCE_CONTRACT_SHA256 =
  "291457e3ca89f254e90fab74043dc90e04f157a8cb16f8231b87b2c1fc859feb";
const RISKS_CONTRACT_SHA256 =
  "5a4c7bfa104129ad4f2c41f057417a94142a005da58077aac0e5bd7312a2d356";
const TOKENS_CONTENT_SHA256 =
  "7c8c1f0519d997eae1887eca4d67bd9ad58c4a4604d663a11a580f5ceeadd392";
const COMPONENT_STATES_CONTENT_SHA256 =
  "93cdd99069cb058ccc69cd058a38993798702c53b5f61ab01256be8696fd1b90";
const THEME_DERIVATION_CONTENT_SHA256 =
  "c2ffa66d80fcf6fc3f561a525cc4ce361c3b1ad217eb40518e32fb3f6e69e32e";
const NORMATIVE_DOCS_DIGEST_SHA256 =
  "ae974b53ec8eaecc40546ec5e6bb473b92b01878b5b635761153d8a2ad5e27bf";
const CONTRACT_ROOT_PATH =
  "docs/uiux/fieldflow-calm-handoff/manifests/contract-root.json";
const CONTRACT_ROOT_WORKFLOW_PATH =
  ".github/workflows/fieldflow-calm-contract-root.yml";
const CONTRACT_ROOT_TEST_PATH =
  "tests/fieldgrid-fieldflow-calm-handoff.test.mjs";
const CONTRACT_ROOT_ORACLE_TEST_PATH =
  "tests/fieldgrid-fieldflow-calm-contract-root.test.mjs";
const CONTRACT_ROOT_VALIDATOR_PATH =
  "scripts/fieldgrid-fieldflow-calm-handoff.mjs";
const CONTRACT_ROOT_PACKAGE_SCRIPT = "fieldgrid:fieldflow-calm-handoff:check";
const CONTRACT_ROOT_TRUST_POLICY = {
  repository: "veele-services/platform",
  protectedBaseBranch: "codex/fieldgrid-uiux-master",
  requiredStatusCheck: "Fieldflow Calm contract root",
  protectedEnvironment: "fieldflow-calm-contract",
  protectedVariable: "FIELDFLOW_CALM_TRUSTED_ROOT_SHA256",
  trustedWorkflow: CONTRACT_ROOT_WORKFLOW_PATH,
  bootstrapRule:
    "After this package is independently approved and merged, a repository administrator records rootSha256 in the protected environment and makes the pull_request_target status check required before any lifecycle state may advance.",
  rotationRule:
    "A root change is a dedicated contract-change PR with product-design, functional-security and visual-a11y approval; the protected value changes only after that review and never from PR code.",
};
const NORMATIVE_DOC_FILES = [
  "00-BRON-EN-BESLUITEN.md",
  "01-DESIGNSYSTEEM-EN-COMPONENTEN.md",
  "02-THEMING-EN-WHITELABEL.md",
  "03-PAGINAS-FEATURES-EN-ACTIES.md",
  "04-PLANBORD.md",
  "05-RESPONSIVE-EN-TOEGANKELIJKHEID.md",
  "06-IMPLEMENTATIERUNBOOK.md",
  "07-ACCEPTATIE-RELEASE-EN-ROLLBACK.md",
  "08-CODEX-MASTERPROMPT.md",
  "09-PR-TEMPLATE.md",
  "10-RISICOREGISTER.md",
  "README.md",
];
const PRODUCTION_SOURCE_DIGEST_SHA256 =
  "1776750679e7cc921359ba67797e5c64fa7226137c52f0b4a132529870900090";
const EXPECTED_PRODUCTION_SOURCE_PATH_COUNT = 231;
const PRODUCTION_SOURCE_DIGEST_SERIALIZATION =
  'Deduplicate all source paths from globalCapabilities[].sources, globalActions[].sources, routes[].sources, routes[].existingProduction.capabilities[].sources, routes[].existingProduction.actions[].sources, sourceCoverage.inventoried[].source and sourceCoverage.excluded[].source; resolve each at platformBaseCommit to path:blobSha, sort with JavaScript Array.prototype.sort(), and serialize with lines.join("\\n") without a trailing newline.';
const EXPECTED_REQUIREMENT_COUNTS = {
  total: 145,
  p0: 122,
  p1: 23,
};
const EXPECTED_PRODUCTION_COUNTS = {
  routes: 79,
  routeCapabilities: 277,
  globalCapabilities: 5,
  routeActions: 409,
  globalActions: 19,
  mutations: 257,
  sourceCoverageInventoried: 204,
  sourceCoverageExcluded: 33,
  sourceCoverageTotal: 237,
};
const REQUIRED_DIRECT_NAVIGATION_CONTROLS = [
  {
    actionId: "tenant-help-beheer.open-help",
    label: "Help bekijken",
    target: "/help",
    sourceHrefNeedle: 'href="/help"',
  },
  {
    actionId: "tenant-materials.open-dashboard",
    label: "Dashboard",
    target: "/materials/dashboard",
    sourceHrefNeedle: 'href="/materials/dashboard"',
  },
  {
    actionId: "tenant-inventory.open-dashboard",
    label: "Dashboard",
    target: "/inventory/dashboard",
    sourceHrefNeedle: 'href="/inventory/dashboard"',
  },
  ...[
    "tenant-website-pages",
    "tenant-website-forms",
    "tenant-website-navigation",
    "tenant-website-redirects",
    "tenant-website-settings",
  ].map((prefix) => ({
    actionId: `${prefix}.open-overview`,
    label: "Naar website-overzicht",
    target: "/website",
    sourceHrefNeedle: 'href="/website"',
  })),
  {
    actionId: "tenant-website-submissions-id.open-customer",
    label: "Open gekoppelde klant",
    target: "/customers/[customerId]",
    sourceHrefNeedle: "href={`/customers/${submission.customerId}`}",
  },
];
const REQUIRED_GLOBAL_ACTION_IDS = [
  "global.command-search",
  "global.switch-tenant",
  "global.open-release-notification",
  "global.dismiss-release-notification",
  "global.open-profile",
  "global.open-help",
  "global.stop-support-mode",
  "global.open-mobile-navigation",
  "global.toggle-sidebar-density",
  "global.open-context-help",
  "global.open-profile-menu",
  "global.open-settings",
  "global.open-whats-new",
  "global.command-scoped-search",
  "global.command-open-planning-today",
  "global.command-create-assignment",
  "global.command-open-recent",
  "global.command-open-page",
  "global.logout",
];
const ACCEPTANCE_STATES = [
  "CONTRACTED",
  "IMPLEMENTED",
  "VERIFIED_LOCAL",
  "VERIFIED_STAGING",
  "RELEASED",
];
const REQUIRED_WORK_PACKAGES = Array.from(
  { length: 15 },
  (_, index) => `W${String(index).padStart(2, "0")}`,
);
const REQUIRED_SEMANTIC_ROLES = [
  "success",
  "warning",
  "danger",
  "info",
  "violet",
  "locked",
  "live",
  "conflict",
  "priorityLow",
  "priorityNormal",
  "priorityHigh",
  "priorityUrgent",
];
const KNOWN_AUTHORIZATION_MODULES = new Set([
  "customers",
  "objects",
  "personnel",
  "assignments",
  "planning",
  "reporting",
  "documents",
  "finance",
  "customer_portal",
  "personnel_portal",
  "notifications",
  "knowledgebase",
  "roadmap",
  "releases",
  "smart_planning",
  "materials",
  "inventory",
  "quality",
  "website",
]);
const MANDATORY_VIEWPORTS = [320, 390, 430, 768, 1024, 1280, 1440, 1920];

const platformBaseSourceReaderCache = new Map();

function createPlatformBaseSourceReader(root) {
  const cached = platformBaseSourceReaderCache.get(root);
  if (cached) return cached;
  const paths = new Set(
    execFileSync(
      "git",
      ["ls-tree", "-r", "--full-tree", "--name-only", PLATFORM_BASE_COMMIT],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      },
    )
      .split("\n")
      .filter(Boolean),
  );
  const sources = new Map();
  const reader = {
    paths,
    has(sourcePath) {
      return paths.has(sourcePath);
    },
    read(sourcePath) {
      if (!paths.has(sourcePath)) {
        throw new Error(
          `${sourcePath} bestaat niet op platformBaseCommit ${PLATFORM_BASE_COMMIT}.`,
        );
      }
      if (!sources.has(sourcePath)) {
        sources.set(
          sourcePath,
          execFileSync(
            "git",
            ["show", `${PLATFORM_BASE_COMMIT}:${sourcePath}`],
            {
              cwd: root,
              encoding: "utf8",
              maxBuffer: 32 * 1024 * 1024,
            },
          ),
        );
      }
      return sources.get(sourcePath);
    },
  };
  platformBaseSourceReaderCache.set(root, reader);
  return reader;
}

export function readPlatformBaseSource(root, sourcePath) {
  return createPlatformBaseSourceReader(root).read(sourcePath);
}
const REQUIRED_DOCS = [
  "README.md",
  "00-BRON-EN-BESLUITEN.md",
  "01-DESIGNSYSTEEM-EN-COMPONENTEN.md",
  "02-THEMING-EN-WHITELABEL.md",
  "03-PAGINAS-FEATURES-EN-ACTIES.md",
  "04-PLANBORD.md",
  "05-RESPONSIVE-EN-TOEGANKELIJKHEID.md",
  "06-IMPLEMENTATIERUNBOOK.md",
  "07-ACCEPTATIE-RELEASE-EN-ROLLBACK.md",
  "08-CODEX-MASTERPROMPT.md",
  "09-PR-TEMPLATE.md",
  "10-RISICOREGISTER.md",
  "manifests/fieldflow-tokens.json",
  "manifests/theme-derivation.json",
  "manifests/component-states.json",
  "manifests/component-source-coverage.json",
  "manifests/routes.json",
  "manifests/production-inventory.json",
  "manifests/mismatch-traceability.json",
  "manifests/navigation-contract.json",
  "manifests/component-api-contract.json",
  "manifests/planboard-actions.json",
  "manifests/verification-matrix.json",
  "manifests/acceptance.json",
  "manifests/surfaces.json",
  "manifests/risks.json",
  "manifests/contract-root.json",
  "evidence/visual/manifest.json",
  "evidence/visual/capture-contract.json",
  "evidence/visual/canonical-theme.css",
  "evidence/visual/reference-normalization.css",
  "evidence/prototype/source-manifest.json",
  "reference/theme-derivation.mjs",
  "reference/theme-derivation.test.mjs",
  "reference/verification-matrix.schema.json",
];
const REQUIRED_ACCEPTANCE_CATEGORIES = [
  "source",
  "design-system",
  "branding",
  "shell",
  "route-parity",
  "planboard",
  "responsive",
  "accessibility",
  "security",
  "release",
];
const REQUIRED_ACCEPTANCE_IDS = [
  "FFC-BRAND-020",
  "FFC-PB-023",
  "FFC-SEC-004",
  "FFC-SEC-009",
  "FFC-SEC-010",
  "FFC-SEC-011",
  "FFC-SEC-012",
  "FFC-SEC-013",
  "FFC-REL-009",
];
const REQUIRED_ROUTE_STATES = [
  "loading",
  "empty",
  "error",
  "permission-denied",
];
const PROTOTYPE_PATTERNS = new Set([
  "dashboard",
  "list",
  "dossier",
  "planboard",
  "settings",
  "form",
]);

function toPosix(path) {
  return path.split(sep).join("/");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function walkPageFiles(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      walkPageFiles(path, output);
    } else if (entry.isFile() && entry.name === "page.tsx") {
      output.push(path);
    }
  }
  return output;
}

function walkTypeScriptFiles(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      walkTypeScriptFiles(path, output);
    } else if (entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name)) {
      output.push(path);
    }
  }
  return output;
}

const COMPONENT_SOURCE_ROOTS = [
  "artifacts/backoffice/src/components/ui",
  "artifacts/backoffice/src/components/tenant-ui",
];

function componentDeclarationKind(statement) {
  if (ts.isInterfaceDeclaration(statement)) return "interface";
  if (ts.isTypeAliasDeclaration(statement)) return "type-alias";
  if (ts.isFunctionDeclaration(statement)) return "function";
  if (ts.isClassDeclaration(statement)) return "class";
  if (ts.isEnumDeclaration(statement)) return "enum";
  if (ts.isVariableStatement(statement)) return "variable";
  return null;
}

function componentSourceExports(sourcePath, source) {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const localDeclarations = new Map();
  for (const statement of sourceFile.statements) {
    const declarationKind = componentDeclarationKind(statement);
    if (!declarationKind) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          localDeclarations.set(declaration.name.text, declarationKind);
        }
      }
    } else if (statement.name && ts.isIdentifier(statement.name)) {
      localDeclarations.set(statement.name.text, declarationKind);
    }
  }

  const records = [];
  for (const statement of sourceFile.statements) {
    const exported = (ts.getModifiers(statement) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (exported) {
      const declarationKind = componentDeclarationKind(statement);
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          records.push({
            exportName: declaration.name.text,
            exportKind: "value",
            declarationKind,
            via: "declaration",
          });
        }
      } else if (statement.name && ts.isIdentifier(statement.name)) {
        records.push({
          exportName: statement.name.text,
          exportKind: ["interface", "type-alias"].includes(declarationKind)
            ? "type"
            : "value",
          declarationKind,
          via: "declaration",
        });
      }
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const specifier of statement.exportClause.elements) {
        const localName = specifier.propertyName?.text ?? specifier.name.text;
        const declarationKind = statement.moduleSpecifier
          ? "external-reexport"
          : (localDeclarations.get(localName) ?? "external-reexport");
        const exportKind =
          statement.isTypeOnly ||
          specifier.isTypeOnly ||
          ["interface", "type-alias"].includes(declarationKind)
            ? "type"
            : "value";
        records.push({
          exportName: specifier.name.text,
          exportKind,
          declarationKind,
          via: statement.moduleSpecifier ? "module-reexport" : "named-export",
        });
      }
    }
  }
  return records;
}

export function discoverComponentNamedExports(root = ROOT) {
  return COMPONENT_SOURCE_ROOTS.flatMap((sourceRoot) => {
    const absoluteRoot = resolve(root, sourceRoot);
    return walkTypeScriptFiles(absoluteRoot).flatMap((path) => {
      const sourcePath = toPosix(relative(root, path));
      return componentSourceExports(sourcePath, readFileSync(path, "utf8")).map(
        (record) => ({ sourcePath, ...record }),
      );
    });
  }).sort((first, second) =>
    `${first.sourcePath}\0${first.exportName}`.localeCompare(
      `${second.sourcePath}\0${second.exportName}`,
    ),
  );
}

export function discoverPageSources(root = ROOT) {
  const dashboardRoot = resolve(
    root,
    "artifacts/backoffice/src/app/(dashboard)",
  );
  const authRoot = resolve(root, "artifacts/backoffice/src/app/(auth)");
  return [...walkPageFiles(dashboardRoot), ...walkPageFiles(authRoot)]
    .map((path) => toPosix(relative(root, path)))
    .sort();
}

export function compareRouteSources(declaredSources, discoveredSources) {
  const declared = new Set(declaredSources);
  const discovered = new Set(discoveredSources);
  return {
    missingFromManifest: [...discovered]
      .filter((source) => !declared.has(source))
      .sort(),
    staleManifestSources: [...declared]
      .filter((source) => !discovered.has(source))
      .sort(),
  };
}

export function routeFromSource(source) {
  const dashboardPrefix = "artifacts/backoffice/src/app/(dashboard)/";
  const authPrefix = "artifacts/backoffice/src/app/(auth)/";
  let relativeSource;
  if (source.startsWith(dashboardPrefix)) {
    relativeSource = source.slice(dashboardPrefix.length);
  } else if (source.startsWith(authPrefix)) {
    relativeSource = source.slice(authPrefix.length);
  } else {
    return null;
  }
  if (!relativeSource.endsWith("/page.tsx") && relativeSource !== "page.tsx") {
    return null;
  }
  const directory =
    relativeSource === "page.tsx"
      ? ""
      : relativeSource.slice(0, -"/page.tsx".length);
  return directory ? `/${directory}` : "/";
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function lifecycleIndependentContract(manifest, collectionField) {
  return {
    ...manifest,
    [collectionField]: (manifest[collectionField] ?? []).map(
      ({ state: _state, evidence: _evidence, ...contract }) => contract,
    ),
  };
}

function lifecycleIndependentCaptureContract(contract) {
  const projection = structuredClone(contract);
  delete projection.state;
  if (projection.environment?.runtimeImageDigest) {
    projection.environment.runtimeImageDigest.value = null;
  }
  if (projection.environment?.fonts) {
    projection.environment.fonts.resolvedFiles = null;
  }
  if (projection.evidenceContract) {
    projection.evidenceContract.scenarioEvidence = null;
  }
  return projection;
}

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground, background) {
  if (
    !/^#[0-9a-f]{6}$/iu.test(foreground) ||
    !/^#[0-9a-f]{6}$/iu.test(background)
  ) {
    throw new Error("Contrastkleuren moeten #RRGGBB zijn.");
  }
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeRelativePath(path, root) {
  if (!isNonEmptyString(path) || path.includes("\\")) return false;
  const absolute = resolve(root, path);
  const fromRoot = relative(root, absolute);
  return (
    fromRoot !== "" &&
    !fromRoot.startsWith(`..${sep}`) &&
    fromRoot !== ".." &&
    !fromRoot.startsWith(sep)
  );
}

function parseHashedArtifactReference(reference) {
  if (!isNonEmptyString(reference)) return null;
  const match = /^([^#]+)#sha256=([0-9a-f]{64})$/u.exec(reference.trim());
  return match ? { path: match[1], sha256: match[2] } : null;
}

function validSetupLocator(locator, allowedKinds) {
  if (!locator || typeof locator !== "object" || Array.isArray(locator)) {
    return false;
  }
  if (!allowedKinds.has(locator.by)) return false;
  if (
    locator.by === "role"
      ? !isNonEmptyString(locator.role)
      : !isNonEmptyString(locator.value)
  ) {
    return false;
  }
  if (Object.hasOwn(locator, "exact") && typeof locator.exact !== "boolean") {
    return false;
  }
  if (
    Object.hasOwn(locator, "level") &&
    (!Number.isInteger(locator.level) || locator.level < 1 || locator.level > 6)
  ) {
    return false;
  }
  if (
    Object.hasOwn(locator, "match") &&
    !["regex", "contains"].includes(locator.match)
  ) {
    return false;
  }
  if (Object.hasOwn(locator, "within")) {
    return validSetupLocator(locator.within, allowedKinds);
  }
  return true;
}

function validSetupOperation(step, allowedKinds) {
  if (!step || typeof step !== "object" || Array.isArray(step)) return false;
  if (["assert", "click", "focus", "waitFor"].includes(step.op)) {
    return (
      validSetupLocator(step.locator, allowedKinds) &&
      (step.op !== "assert" ||
        !Object.hasOwn(step, "condition") ||
        ["present", "absent"].includes(step.condition))
    );
  }
  if (step.op === "navigate") {
    return (
      isNonEmptyString(step.label) &&
      ["current", "mobile"].includes(step.formFactor)
    );
  }
  if (step.op === "press") {
    return (
      isNonEmptyString(step.key) &&
      Number.isInteger(step.times) &&
      step.times > 0
    );
  }
  return false;
}

function gitCommitExists(root, commit) {
  try {
    execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const EVIDENCE_ARTIFACT_PREFIXES = [
  "outputs/fieldflow-calm/",
  "docs/uiux/fieldflow-calm-handoff/evidence/implementation/",
];
const EVIDENCE_REPOSITORY = "veele-services/platform";
const EVIDENCE_REVIEW_ROLES = new Set([
  "functional-security",
  "visual-a11y",
  "product-design",
]);
const EVIDENCE_ERROR_CHANNELS = [
  "console",
  "page",
  "request",
  "server",
  "hydration",
];
const EVIDENCE_ATTACHMENT_TYPES = new Set([
  "axe",
  "dom",
  "geometry",
  "junit",
  "log",
  "screenshot",
  "trace",
  "video",
]);
const EVIDENCE_COMMANDS = Object.freeze({
  "fieldflow-runtime": "pnpm fieldgrid:fieldflow-calm:check",
  "fieldflow-browser": "pnpm fieldgrid:playwright:evidence",
  "fieldflow-visual": "pnpm fieldgrid:fieldflow-calm:visual --run --strict",
  "fieldflow-staging": "pnpm fieldgrid:fieldflow-calm:staging --strict",
  "fieldflow-release": "pnpm fieldgrid:fieldflow-calm:release --verify",
});
const BROWSER_VERIFICATION_TOKENS = new Set([
  "axe",
  "browser",
  "clock-e2e",
  "e2e",
  "keyboard-e2e",
  "mobile-e2e",
  "performance",
  "permission-e2e",
  "pointer",
  "pointer-e2e",
  "screenreader-e2e",
  "search",
  "touch-e2e",
  "two-session-e2e",
  "two-tenant-e2e",
]);
const VISUAL_VERIFICATION_TOKENS = new Set([
  "computed-style",
  "geometry",
  "visual",
  "visual-diff",
  "visual-e2e",
  "visual-review",
]);

function isSafeEvidencePath(path, root) {
  return (
    isSafeRelativePath(path, root) &&
    /^[A-Za-z0-9._/-]+$/u.test(path) &&
    EVIDENCE_ARTIFACT_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function readGitFile(root, commit, path) {
  try {
    const type = execFileSync("git", ["cat-file", "-t", `${commit}:${path}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (type !== "blob") return null;
    return execFileSync("git", ["show", `${commit}:${path}`], {
      cwd: root,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function gitCommitIsAncestor(root, ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function hasExactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

function sortedUnique(values) {
  return [...new Set(Array.isArray(values) ? values : [])].sort(
    (first, second) =>
      typeof first === "number" && typeof second === "number"
        ? first - second
        : String(first).localeCompare(String(second)),
  );
}

function evidenceVerification(item) {
  return isNonEmptyString(item.verification)
    ? item.verification
    : /^R-\d{3}$/u.test(item.id ?? "")
      ? "risk-mitigation"
      : null;
}

export function requiredEvidenceCommandIds(item) {
  const state = item.state;
  const ids = ["fieldflow-runtime"];
  const tokens = new Set((evidenceVerification(item) ?? "").split("+"));
  if (
    [...tokens].some(
      (token) =>
        BROWSER_VERIFICATION_TOKENS.has(token) ||
        token === "e2e" ||
        token.endsWith("-e2e"),
    )
  ) {
    ids.push("fieldflow-browser");
  }
  if ([...tokens].some((token) => VISUAL_VERIFICATION_TOKENS.has(token))) {
    ids.push("fieldflow-visual");
  }
  if (["VERIFIED_STAGING", "RELEASED", "CLOSED"].includes(state)) {
    ids.push("fieldflow-staging");
  }
  if (state === "RELEASED") ids.push("fieldflow-release");
  return ids;
}

function evidenceReportKindForCommand(commandId) {
  return ["fieldflow-staging", "fieldflow-release"].includes(commandId)
    ? "staging"
    : "runtime";
}

function expectedEvidenceRoutes(item, root) {
  const references = item.routes ?? [];
  if (!references.some((reference) => reference.includes("*"))) {
    return sortedUnique(references);
  }
  try {
    const routes = JSON.parse(
      readFileSync(
        resolve(root, "docs/uiux/fieldflow-calm-handoff/manifests/routes.json"),
        "utf8",
      ),
    ).routes.map((route) => route.route);
    return sortedUnique(
      routes.filter((route) =>
        references.some((reference) => referenceMatchesRoute(reference, route)),
      ),
    );
  } catch {
    return null;
  }
}

function expectedEvidenceCoverage(item, root) {
  return {
    routes: expectedEvidenceRoutes(item, root),
    themes: sortedUnique(item.themes ?? []),
    viewports: sortedUnique(item.viewports ?? []),
    densities: sortedUnique(item.densities ?? []),
  };
}

function expectedEvidenceCommand(commandId, item, reportPath) {
  return `${EVIDENCE_COMMANDS[commandId]} -- --evidence-subject ${item.id} --report ${reportPath}`;
}

const GITHUB_API_CACHE = new Map();
const GITHUB_API_PAGINATED_CACHE = new Map();

function githubApiJson(endpoint) {
  if (GITHUB_API_CACHE.has(endpoint)) return GITHUB_API_CACHE.get(endpoint);
  try {
    const result = JSON.parse(
      execFileSync("gh", ["api", endpoint], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    GITHUB_API_CACHE.set(endpoint, result);
    return result;
  } catch {
    GITHUB_API_CACHE.set(endpoint, null);
    return null;
  }
}

function githubApiPaginatedJson(endpoint) {
  if (GITHUB_API_PAGINATED_CACHE.has(endpoint)) {
    return GITHUB_API_PAGINATED_CACHE.get(endpoint);
  }
  try {
    const pages = JSON.parse(
      execFileSync("gh", ["api", endpoint, "--paginate", "--slurp"], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    const result = Array.isArray(pages) ? pages.flat() : null;
    GITHUB_API_PAGINATED_CACHE.set(endpoint, result);
    return result;
  } catch {
    GITHUB_API_PAGINATED_CACHE.set(endpoint, null);
    return null;
  }
}

export function attestationOutputMatches(records, expected) {
  if (!Array.isArray(records) || records.length === 0) return false;
  const serialized = JSON.stringify(records);
  return (
    serialized.includes(expected.sha256) &&
    serialized.includes(expected.provenance.headCommit) &&
    serialized.includes(String(expected.provenance.runId)) &&
    serialized.includes(expected.provenance.workflowPath)
  );
}

function githubArtifactAttestationVerifies(path, expected) {
  try {
    const output = execFileSync(
      "gh",
      [
        "attestation",
        "verify",
        path,
        "--repo",
        EVIDENCE_REPOSITORY,
        "--signer-workflow",
        `${EVIDENCE_REPOSITORY}/.github/workflows/fieldflow-calm-evidence.yml`,
        "--deny-self-hosted-runners",
        "--format",
        "json",
      ],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const records = JSON.parse(output);
    return attestationOutputMatches(records, expected);
  } catch {
    return false;
  }
}

function validateEvidenceProvenance(
  errors,
  item,
  authorId,
  codePaths,
  provenance,
  root,
  verifyFiles,
) {
  const fields = [
    "provider",
    "repository",
    "headCommit",
    "baseCommit",
    "pullRequestNumber",
    "workflowPath",
    "workflowBlobSha256",
    "runId",
    "runAttempt",
    "jobId",
    "jobName",
    "eventName",
    "attestationProvider",
  ];
  const structurallyValid =
    hasExactKeys(provenance, fields) &&
    provenance.provider === "github-actions" &&
    provenance.repository === EVIDENCE_REPOSITORY &&
    provenance.headCommit === item.evidence?.commit &&
    /^[0-9a-f]{40}$/u.test(provenance.baseCommit ?? "") &&
    provenance.baseCommit !== provenance.headCommit &&
    Number.isInteger(provenance.pullRequestNumber) &&
    provenance.pullRequestNumber > 0 &&
    provenance.workflowPath ===
      ".github/workflows/fieldflow-calm-evidence.yml" &&
    /^[0-9a-f]{64}$/u.test(provenance.workflowBlobSha256 ?? "") &&
    Number.isInteger(provenance.runId) &&
    provenance.runId > 0 &&
    Number.isInteger(provenance.runAttempt) &&
    provenance.runAttempt > 0 &&
    Number.isInteger(provenance.jobId) &&
    provenance.jobId > 0 &&
    isNonEmptyString(provenance.jobName) &&
    provenance.eventName === "pull_request" &&
    provenance.attestationProvider === "github-artifact-attestations";
  if (!structurallyValid) {
    errors.push(
      `${item.id}: CI-provenance mist exact getypeerde GitHub Actions/PR/HEAD-velden.`,
    );
    return false;
  }
  if (!verifyFiles) {
    errors.push(
      `${item.id}: geverifieerd bewijs vereist bestands-, Git- en live GitHub-validatie.`,
    );
    return false;
  }
  if (
    !gitCommitExists(root, provenance.baseCommit) ||
    !gitCommitIsAncestor(root, provenance.baseCommit, provenance.headCommit)
  ) {
    errors.push(
      `${item.id}: evidence-base bestaat niet of is geen ancestor van exact HEAD.`,
    );
  }
  const changedFiles = githubApiPaginatedJson(
    `repos/${EVIDENCE_REPOSITORY}/pulls/${provenance.pullRequestNumber}/files?per_page=100`,
  );
  const changedPaths = new Set(
    (changedFiles ?? []).map((record) => record.filename),
  );
  if (
    !changedFiles ||
    !Array.isArray(codePaths) ||
    codePaths.some((record) => !changedPaths.has(record.path))
  ) {
    errors.push(
      `${item.id}: ieder evidence-codepad moet een werkelijk gewijzigd bestand in exact deze PR zijn.`,
    );
  }
  const workflowBlob = readGitFile(
    root,
    provenance.headCommit,
    provenance.workflowPath,
  );
  const baseWorkflowBlob = readGitFile(
    root,
    provenance.baseCommit,
    provenance.workflowPath,
  );
  if (
    !workflowBlob ||
    !baseWorkflowBlob ||
    createHash("sha256").update(workflowBlob).digest("hex") !==
      provenance.workflowBlobSha256 ||
    createHash("sha256").update(baseWorkflowBlob).digest("hex") !==
      provenance.workflowBlobSha256
  ) {
    errors.push(
      `${item.id}: trusted workflowblob moet identiek bestaan op PR-base en evidence-HEAD.`,
    );
  }

  const pullRequest = githubApiJson(
    `repos/${EVIDENCE_REPOSITORY}/pulls/${provenance.pullRequestNumber}`,
  );
  if (
    !pullRequest ||
    pullRequest.head?.sha !== provenance.headCommit ||
    pullRequest.base?.sha !== provenance.baseCommit ||
    pullRequest.user?.login !== authorId ||
    pullRequest.draft === true
  ) {
    errors.push(
      `${item.id}: live GitHub-PR bindt author/base/head niet exact aan de index.`,
    );
  }
  const run = githubApiJson(
    `repos/${EVIDENCE_REPOSITORY}/actions/runs/${provenance.runId}`,
  );
  if (
    !run ||
    run.head_sha !== provenance.headCommit ||
    run.run_attempt !== provenance.runAttempt ||
    run.event !== provenance.eventName ||
    run.path !== provenance.workflowPath ||
    run.repository?.full_name !== EVIDENCE_REPOSITORY ||
    run.conclusion !== "success" ||
    !Array.isArray(run.pull_requests) ||
    !run.pull_requests.some(
      (pull) => pull.number === provenance.pullRequestNumber,
    )
  ) {
    errors.push(
      `${item.id}: live GitHub Actions-run is niet succesvol of niet exact aan PR/HEAD gebonden.`,
    );
  }
  const jobs = githubApiJson(
    `repos/${EVIDENCE_REPOSITORY}/actions/runs/${provenance.runId}/jobs?filter=all`,
  );
  const job = jobs?.jobs?.find(
    (candidate) => candidate.id === provenance.jobId,
  );
  if (
    !job ||
    job.name !== provenance.jobName ||
    job.run_attempt !== provenance.runAttempt ||
    job.head_sha !== provenance.headCommit ||
    job.conclusion !== "success"
  ) {
    errors.push(
      `${item.id}: live GitHub Actions-job is niet succesvol of wijkt af van de attestatie.`,
    );
  }
  return true;
}

function validateReviewerRecords(
  errors,
  item,
  authorId,
  reviewers,
  provenance,
  verifyFiles,
) {
  const reviewerFields = [
    "id",
    "role",
    "independent",
    "selfReview",
    "decision",
    "subjectId",
    "headCommit",
    "pullRequestNumber",
    "reviewId",
    "submittedAt",
  ];
  const structurallyValid =
    Array.isArray(reviewers) &&
    reviewers.every(
      (reviewer) =>
        hasExactKeys(reviewer, reviewerFields) &&
        /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u.test(reviewer.id ?? "") &&
        reviewer.id !== authorId &&
        EVIDENCE_REVIEW_ROLES.has(reviewer.role) &&
        reviewer.independent === true &&
        reviewer.selfReview === false &&
        reviewer.decision === "APPROVED" &&
        reviewer.subjectId === item.id &&
        reviewer.headCommit === item.evidence?.commit &&
        reviewer.pullRequestNumber === provenance?.pullRequestNumber &&
        Number.isInteger(reviewer.reviewId) &&
        reviewer.reviewId > 0 &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(
          reviewer.submittedAt ?? "",
        ),
    ) &&
    new Set(reviewers.map((reviewer) => reviewer.id)).size === reviewers.length;
  if (!structurallyValid) {
    errors.push(
      `${item.id}: reviewers missen een unieke, onafhankelijke, exact-HEAD GitHub APPROVED-attestatie.`,
    );
    return false;
  }
  if (!verifyFiles) return true;
  for (const reviewer of reviewers) {
    const permission = githubApiJson(
      `repos/${EVIDENCE_REPOSITORY}/collaborators/${reviewer.id}/permission`,
    );
    const reviews = githubApiPaginatedJson(
      `repos/${EVIDENCE_REPOSITORY}/pulls/${reviewer.pullRequestNumber}/reviews?per_page=100`,
    );
    const matchingReviews = (reviews ?? [])
      .filter(
        (candidate) =>
          candidate.user?.login === reviewer.id &&
          candidate.commit_id === reviewer.headCommit,
      )
      .sort((first, second) => first.id - second.id);
    const review = matchingReviews.at(-1);
    const marker = `FIELDFLOW-EVIDENCE: subject=${item.id}; head=${item.evidence.commit}; role=${reviewer.role}`;
    if (
      !review ||
      !["admin", "maintain", "write"].includes(permission?.permission) ||
      review.id !== reviewer.reviewId ||
      review.user?.login !== reviewer.id ||
      review.state !== "APPROVED" ||
      review.commit_id !== reviewer.headCommit ||
      review.submitted_at !== reviewer.submittedAt ||
      !String(review.body ?? "").includes(marker)
    ) {
      errors.push(
        `${item.id}: live GitHub-review ${reviewer.reviewId} mist collaboratorpermission, APPROVED, exact HEAD of rolattestatie.`,
      );
    }
  }
  return true;
}

function validateEvidenceAttachment(
  errors,
  item,
  attachment,
  root,
  verifyFiles,
) {
  if (
    !hasExactKeys(attachment, ["type", "path", "sha256"]) ||
    !EVIDENCE_ATTACHMENT_TYPES.has(attachment.type) ||
    !isSafeEvidencePath(attachment.path, root) ||
    !/^[0-9a-f]{64}$/u.test(attachment.sha256 ?? "")
  ) {
    errors.push(`${item.id}: reportattachment is niet veilig en getypeerd.`);
    return;
  }
  if (!verifyFiles) return;
  const path = resolve(root, attachment.path);
  if (!existsSync(path) || !statSync(path).isFile()) {
    errors.push(
      `${item.id}: reportattachment bestaat niet: ${attachment.path}.`,
    );
  } else if (hashFile(path) !== attachment.sha256) {
    errors.push(
      `${item.id}: reportattachmenthash wijkt af: ${attachment.path}.`,
    );
  }
}

function loadVerificationMatrixForEvidence(root) {
  const path = resolve(
    root,
    "docs/uiux/fieldflow-calm-handoff/manifests/verification-matrix.json",
  );
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  try {
    return { path, manifest: readJson(path) };
  } catch {
    return null;
  }
}

function validateVerificationEvidenceShards(
  errors,
  item,
  coverage,
  expected,
  { matrixKind, matrixId, root, verifyFiles },
) {
  const shardFields = [
    "ordinalStartInclusive",
    "ordinalEndExclusive",
    "tupleCount",
    "tupleIdStreamSha256",
    "tuplePayloadStreamSha256",
    "assertionReportPath",
    "assertionReportSha256",
  ];
  const overallIdHash = createHash("sha256");
  const overallPayloadHash = createHash("sha256");
  const seenTupleIds = new Set();
  let nextOrdinal = 0;
  let verifiedAssertionCount = 0;
  if (!Array.isArray(coverage.shards) || coverage.shards.length === 0) {
    errors.push(
      `${item.id}: verificatiematrix ${matrixId} mist evidence-shards.`,
    );
    return;
  }
  for (const shard of coverage.shards) {
    const rangeValid =
      hasExactKeys(shard, shardFields) &&
      Number.isInteger(shard.ordinalStartInclusive) &&
      Number.isInteger(shard.ordinalEndExclusive) &&
      shard.ordinalStartInclusive === nextOrdinal &&
      shard.ordinalEndExclusive > shard.ordinalStartInclusive &&
      shard.ordinalEndExclusive <= expected.tupleCount &&
      shard.tupleCount ===
        shard.ordinalEndExclusive - shard.ordinalStartInclusive &&
      /^[0-9a-f]{64}$/u.test(shard.tupleIdStreamSha256 ?? "") &&
      /^[0-9a-f]{64}$/u.test(shard.tuplePayloadStreamSha256 ?? "") &&
      isSafeEvidencePath(shard.assertionReportPath, root) &&
      /^[0-9a-f]{64}$/u.test(shard.assertionReportSha256 ?? "");
    if (!rangeValid) {
      errors.push(
        `${item.id}: verificatiematrix ${matrixId} heeft een ongeldige of niet-aaneengesloten shard.`,
      );
      continue;
    }
    nextOrdinal = shard.ordinalEndExclusive;
    if (!verifyFiles) continue;
    const reportPath = resolve(root, shard.assertionReportPath);
    if (
      !existsSync(reportPath) ||
      !statSync(reportPath).isFile() ||
      hashFile(reportPath) !== shard.assertionReportSha256
    ) {
      errors.push(
        `${item.id}: assertionrapport ontbreekt of hash wijkt af voor ${matrixId}.`,
      );
      continue;
    }
    let report;
    try {
      report = readJson(reportPath);
    } catch {
      errors.push(
        `${item.id}: assertionrapport voor ${matrixId} is geen geldige JSON.`,
      );
      continue;
    }
    if (
      !hasExactKeys(report, [
        "schemaVersion",
        "subjectId",
        "matrixKind",
        "matrixId",
        "headCommit",
        "ordinalStartInclusive",
        "ordinalEndExclusive",
        "assertions",
        "attachments",
      ]) ||
      report.schemaVersion !== 1 ||
      report.subjectId !== item.id ||
      report.matrixKind !== matrixKind ||
      report.matrixId !== matrixId ||
      report.headCommit !== item.evidence?.commit ||
      report.ordinalStartInclusive !== shard.ordinalStartInclusive ||
      report.ordinalEndExclusive !== shard.ordinalEndExclusive ||
      !Array.isArray(report.assertions) ||
      report.assertions.length !== shard.tupleCount ||
      !Array.isArray(report.attachments) ||
      report.attachments.length === 0
    ) {
      errors.push(
        `${item.id}: assertionrapport voor ${matrixId} mist subject/HEAD/range/assertionbinding.`,
      );
      continue;
    }
    const attachmentIds = new Set();
    for (const attachment of report.attachments) {
      if (
        !hasExactKeys(attachment, ["id", "type", "path", "sha256"]) ||
        !isNonEmptyString(attachment.id) ||
        attachmentIds.has(attachment.id) ||
        !EVIDENCE_ATTACHMENT_TYPES.has(attachment.type) ||
        !isSafeEvidencePath(attachment.path, root) ||
        !/^[0-9a-f]{64}$/u.test(attachment.sha256 ?? "")
      ) {
        errors.push(
          `${item.id}: assertionrapport ${matrixId} bevat een ongeldige attachment.`,
        );
        continue;
      }
      attachmentIds.add(attachment.id);
      const attachmentPath = resolve(root, attachment.path);
      if (
        !existsSync(attachmentPath) ||
        !statSync(attachmentPath).isFile() ||
        hashFile(attachmentPath) !== attachment.sha256
      ) {
        errors.push(
          `${item.id}: assertionattachment ${attachment.id} ontbreekt of heeft drift.`,
        );
      }
    }
    const shardIdHash = createHash("sha256");
    const shardPayloadHash = createHash("sha256");
    for (const assertion of report.assertions) {
      const tuple = assertion?.canonicalTuple;
      const payload = JSON.stringify(tuple);
      const tupleId = `FFVT-${sha256Text(payload)}`;
      if (
        !hasExactKeys(assertion, [
          "testId",
          "tupleId",
          "canonicalTuple",
          "status",
          "assertionIds",
          "attachmentIds",
        ]) ||
        !hasExactKeys(tuple, VERIFICATION_TUPLE_FIELDS) ||
        assertion.tupleId !== tupleId ||
        assertion.testId !== `ffvm::${matrixId}::${tupleId}` ||
        assertion.status !== "passed" ||
        seenTupleIds.has(tupleId) ||
        (matrixKind === "requirement" &&
          (tuple.requirementId !== matrixId || tuple.matrixId !== null)) ||
        (matrixKind === "shared" &&
          (tuple.matrixId !== matrixId || tuple.requirementId !== null)) ||
        !Array.isArray(assertion.assertionIds) ||
        assertion.assertionIds.length === 0 ||
        JSON.stringify(assertion.assertionIds) !==
          JSON.stringify(sortedUnique(assertion.assertionIds)) ||
        !Array.isArray(assertion.attachmentIds) ||
        assertion.attachmentIds.length === 0 ||
        JSON.stringify(assertion.attachmentIds) !==
          JSON.stringify(sortedUnique(assertion.attachmentIds)) ||
        assertion.attachmentIds.some((id) => !attachmentIds.has(id))
      ) {
        errors.push(
          `${item.id}: assertion voor ${matrixId} is onbekend, dubbel of niet exact passed.`,
        );
        continue;
      }
      seenTupleIds.add(tupleId);
      verifiedAssertionCount += 1;
      shardIdHash.update(`${tupleId}\n`);
      shardPayloadHash.update(`${payload}\n`);
      overallIdHash.update(`${tupleId}\n`);
      overallPayloadHash.update(`${payload}\n`);
    }
    if (
      shardIdHash.digest("hex") !== shard.tupleIdStreamSha256 ||
      shardPayloadHash.digest("hex") !== shard.tuplePayloadStreamSha256
    ) {
      errors.push(
        `${item.id}: assertionstreamhash van shard ${matrixId} wijkt af.`,
      );
    }
  }
  if (nextOrdinal !== expected.tupleCount) {
    errors.push(
      `${item.id}: shards voor ${matrixId} eindigen niet exact op tupleCount.`,
    );
  }
  if (
    verifyFiles &&
    (verifiedAssertionCount !== expected.tupleCount ||
      overallIdHash.digest("hex") !== expected.tupleIdStreamSha256 ||
      overallPayloadHash.digest("hex") !== expected.tuplePayloadStreamSha256)
  ) {
    errors.push(
      `${item.id}: assertionrapporten reproduceren de root-bound tuplecount/ID-/payloadstream voor ${matrixId} niet.`,
    );
  }
}

export function validateVerificationMatrixEvidence(
  item,
  evidence,
  { root = ROOT, verifyFiles = false, matrixBundle = null } = {},
) {
  const errors = [];
  const loaded = matrixBundle ?? loadVerificationMatrixForEvidence(root);
  const matrix = loaded?.manifest;
  const matrixPath = loaded?.path;
  const binding = (matrix?.requirementBindings ?? []).find(
    (candidate) => candidate.requirementId === item.id,
  );
  if (!binding || !matrixPath) {
    errors.push(
      `${item.id}: root-bound requirementbinding ontbreekt in verificatiematrix.`,
    );
    return errors;
  }
  const requirementFields = [
    "requirementId",
    "tupleCount",
    "tupleIdStreamSha256",
    "tuplePayloadStreamSha256",
    "executedTupleCount",
    "passedTupleCount",
    "failedTupleCount",
    "skippedTupleCount",
    "notRunTupleCount",
    "shards",
  ];
  const sharedFields = [
    "matrixId",
    "requirementIds",
    "tupleCount",
    "tupleIdStreamSha256",
    "tuplePayloadStreamSha256",
    "executedTupleCount",
    "passedTupleCount",
    "failedTupleCount",
    "skippedTupleCount",
    "notRunTupleCount",
    "shards",
  ];
  if (
    !hasExactKeys(evidence, [
      "manifestPath",
      "manifestSha256",
      "verificationPlanRootSha256",
      "requirement",
      "sharedMatrices",
    ]) ||
    evidence.manifestPath !==
      "docs/uiux/fieldflow-calm-handoff/manifests/verification-matrix.json" ||
    evidence.manifestSha256 !== hashFile(matrixPath) ||
    evidence.verificationPlanRootSha256 !== matrix.verificationPlanRootSha256
  ) {
    errors.push(
      `${item.id}: evidence is niet aan exact verificatiematrixbestand en plan-root gebonden.`,
    );
    return errors;
  }
  const requirement = evidence.requirement;
  if (
    !hasExactKeys(requirement, requirementFields) ||
    requirement.requirementId !== item.id ||
    requirement.tupleCount !== binding.tupleCount ||
    requirement.tupleIdStreamSha256 !== binding.tupleIdStreamSha256 ||
    requirement.tuplePayloadStreamSha256 !== binding.tuplePayloadStreamSha256 ||
    requirement.executedTupleCount !== binding.tupleCount ||
    requirement.passedTupleCount !== binding.tupleCount ||
    requirement.failedTupleCount !== 0 ||
    requirement.skippedTupleCount !== 0 ||
    requirement.notRunTupleCount !== 0
  ) {
    errors.push(
      `${item.id}: requirementtuples zijn niet exact eenmaal uitgevoerd en passed.`,
    );
  } else {
    validateVerificationEvidenceShards(errors, item, requirement, binding, {
      matrixKind: "requirement",
      matrixId: item.id,
      root,
      verifyFiles,
    });
  }
  const expectedShared = (binding.sharedMatrixIds ?? []).map((id) =>
    (matrix.sharedFullCartesianMatrices ?? []).find(
      (candidate) => candidate.id === id,
    ),
  );
  if (
    !Array.isArray(evidence.sharedMatrices) ||
    JSON.stringify(evidence.sharedMatrices.map((record) => record.matrixId)) !==
      JSON.stringify(binding.sharedMatrixIds)
  ) {
    errors.push(
      `${item.id}: gekoppelde volledige whitelabelmatrices ontbreken of zijn herordend.`,
    );
    return errors;
  }
  for (let index = 0; index < expectedShared.length; index += 1) {
    const expected = expectedShared[index];
    const record = evidence.sharedMatrices[index];
    if (
      !expected ||
      !hasExactKeys(record, sharedFields) ||
      JSON.stringify(record.requirementIds) !==
        JSON.stringify(expected.requirementIds) ||
      record.tupleCount !== expected.tupleCount ||
      record.tupleIdStreamSha256 !== expected.tupleIdStreamSha256 ||
      record.tuplePayloadStreamSha256 !== expected.tuplePayloadStreamSha256 ||
      record.executedTupleCount !== expected.tupleCount ||
      record.passedTupleCount !== expected.tupleCount ||
      record.failedTupleCount !== 0 ||
      record.skippedTupleCount !== 0 ||
      record.notRunTupleCount !== 0
    ) {
      errors.push(
        `${item.id}: whitelabelmatrix ${record?.matrixId} is niet volledig passed.`,
      );
      continue;
    }
    validateVerificationEvidenceShards(errors, item, record, expected, {
      matrixKind: "shared",
      matrixId: expected.id,
      root,
      verifyFiles,
    });
  }
  return errors;
}

export function validateMachineEvidenceReport(
  item,
  report,
  { kind, commandIds, provenance, root = ROOT, verifyFiles = false } = {},
) {
  const errors = [];
  const expectedCoverage = expectedEvidenceCoverage(item, root);
  const verificationMatrixBundle = loadVerificationMatrixForEvidence(root);
  const hasRequirementMatrix = Boolean(
    verificationMatrixBundle?.manifest?.requirementBindings?.some(
      (binding) => binding.requirementId === item.id,
    ),
  );
  const reportFields = [
    "schemaVersion",
    "kind",
    "subjectId",
    "headCommit",
    "verification",
    "provenance",
    "coverage",
    ...(hasRequirementMatrix ? ["verificationMatrix"] : []),
    "assertions",
    "summary",
    "errors",
    "attachments",
  ];
  if (
    !hasExactKeys(report, reportFields) ||
    report.schemaVersion !== 1 ||
    report.kind !== kind ||
    report.subjectId !== item.id ||
    report.headCommit !== item.evidence?.commit ||
    report.verification !== evidenceVerification(item) ||
    hashJson(report.provenance) !== hashJson(provenance)
  ) {
    errors.push(
      `${item.id}: ${kind}-rapport mist schema/subject/HEAD/verification/provenancebinding.`,
    );
    return errors;
  }
  const coverageFields = [
    "routes",
    "themes",
    "viewports",
    "densities",
    "commandIds",
    "testIds",
  ];
  const coverage = report.coverage;
  if (
    !hasExactKeys(coverage, coverageFields) ||
    expectedCoverage.routes === null ||
    JSON.stringify(coverage?.routes) !==
      JSON.stringify(expectedCoverage.routes) ||
    JSON.stringify(coverage?.themes) !==
      JSON.stringify(expectedCoverage.themes) ||
    JSON.stringify(coverage?.viewports) !==
      JSON.stringify(expectedCoverage.viewports) ||
    JSON.stringify(coverage?.densities) !==
      JSON.stringify(expectedCoverage.densities) ||
    JSON.stringify(coverage?.commandIds) !==
      JSON.stringify(sortedUnique(commandIds)) ||
    !Array.isArray(coverage?.testIds) ||
    coverage.testIds.length === 0 ||
    coverage.testIds.some((id) => !isNonEmptyString(id)) ||
    JSON.stringify(coverage.testIds) !==
      JSON.stringify(sortedUnique(coverage.testIds))
  ) {
    errors.push(
      `${item.id}: ${kind}-rapport dekt routes/themes/viewports/densities/commands/tests niet exact.`,
    );
  }
  const assertions = report.assertions;
  if (
    !Array.isArray(assertions) ||
    assertions.length === 0 ||
    assertions.some(
      (assertion) =>
        !hasExactKeys(assertion, ["id", "testId", "status", "message"]) ||
        !isNonEmptyString(assertion.id) ||
        !coverage?.testIds?.includes(assertion.testId) ||
        assertion.status !== "passed" ||
        !isNonEmptyString(assertion.message),
    ) ||
    new Set(assertions.map((assertion) => assertion.id)).size !==
      assertions.length ||
    coverage?.testIds?.some(
      (testId) => !assertions.some((assertion) => assertion.testId === testId),
    )
  ) {
    errors.push(
      `${item.id}: ${kind}-rapport vereist unieke, uitgevoerde en geslaagde assertions per test-ID.`,
    );
  }
  if (
    !hasExactKeys(report.summary, [
      "passed",
      "failed",
      "skipped",
      "notRun",
      "manual",
    ]) ||
    report.summary.passed !== assertions?.length ||
    report.summary.failed !== 0 ||
    report.summary.skipped !== 0 ||
    report.summary.notRun !== 0 ||
    report.summary.manual !== 0
  ) {
    errors.push(
      `${item.id}: ${kind}-rapportsummary vereist exact alle passed en nul failed/skipped/notRun/manual.`,
    );
  }
  if (
    !hasExactKeys(report.errors, EVIDENCE_ERROR_CHANNELS) ||
    EVIDENCE_ERROR_CHANNELS.some(
      (channel) =>
        !Array.isArray(report.errors?.[channel]) ||
        report.errors[channel].length !== 0,
    )
  ) {
    errors.push(
      `${item.id}: ${kind}-rapport bevat runtime-, netwerk- of hydrationerrors.`,
    );
  }
  if (!Array.isArray(report.attachments)) {
    errors.push(`${item.id}: ${kind}-rapport mist attachmentlijst.`);
  } else {
    for (const attachment of report.attachments) {
      validateEvidenceAttachment(errors, item, attachment, root, verifyFiles);
    }
    const attachmentTypes = new Set(
      report.attachments.map((attachment) => attachment.type),
    );
    const requiredTypes = new Set([kind === "runtime" ? "junit" : "log"]);
    if (commandIds.includes("fieldflow-browser")) requiredTypes.add("trace");
    if (commandIds.includes("fieldflow-visual")) {
      requiredTypes.add("screenshot");
      requiredTypes.add("geometry");
    }
    if ([...requiredTypes].some((type) => !attachmentTypes.has(type))) {
      errors.push(
        `${item.id}: ${kind}-rapport mist verplichte getypeerde attachments (${[...requiredTypes].join(", ")}).`,
      );
    }
  }
  if (hasRequirementMatrix) {
    errors.push(
      ...validateVerificationMatrixEvidence(item, report.verificationMatrix, {
        root,
        verifyFiles,
        matrixBundle: verificationMatrixBundle,
      }),
    );
  }
  return errors;
}

function validateHashedArtifactRecord(
  errors,
  subjectId,
  artifact,
  root,
  verifyFiles,
  provenance,
) {
  if (
    !hasExactKeys(artifact, ["path", "sha256", "mediaType", "reportKind"]) ||
    !isSafeEvidencePath(artifact.path, root) ||
    !/^[0-9a-f]{64}$/u.test(artifact.sha256 ?? "") ||
    artifact.mediaType !== "application/json" ||
    !["runtime", "staging"].includes(artifact.reportKind) ||
    !artifact.path.endsWith(".json")
  ) {
    errors.push(
      `${subjectId}: bewijsrapport mist veilig JSON-pad, type, kind of SHA-256.`,
    );
    return null;
  }
  if (!verifyFiles) return null;
  const artifactPath = resolve(root, artifact.path);
  if (!existsSync(artifactPath) || !statSync(artifactPath).isFile()) {
    errors.push(`${subjectId}: bewijsbestand bestaat niet: ${artifact.path}.`);
    return null;
  } else if (hashFile(artifactPath) !== artifact.sha256) {
    errors.push(`${subjectId}: bewijsfilehash wijkt af: ${artifact.path}.`);
    return null;
  }
  if (
    !githubArtifactAttestationVerifies(artifactPath, {
      sha256: artifact.sha256,
      provenance,
    })
  ) {
    errors.push(
      `${subjectId}: GitHub artifact-attestation ontbreekt of verifieert niet voor ${artifact.path}.`,
    );
    return null;
  }
  try {
    return JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch {
    errors.push(`${subjectId}: bewijsrapport is geen geldige JSON.`);
    return null;
  }
}

export function validateEvidenceIndexPayload(
  item,
  index,
  { root = ROOT, verifyFiles = false } = {},
) {
  const errors = [];
  const state = item.state;
  const localVerified = [
    "VERIFIED_LOCAL",
    "VERIFIED_STAGING",
    "RELEASED",
    "CLOSED",
  ].includes(state);
  const commandsRequired = localVerified || state === "MITIGATED";
  const stagingVerified = ["VERIFIED_STAGING", "RELEASED", "CLOSED"].includes(
    state,
  );
  const verification = evidenceVerification(item);
  const allowedIndexFields = [
    "schemaVersion",
    "subjectId",
    "headCommit",
    "authorId",
    "verification",
    "codePaths",
    "commands",
    "artifacts",
    "reviewers",
    "provenance",
    "release",
  ];
  if (/^R-\d{3}$/u.test(item.id ?? "") && state === "CLOSED") {
    allowedIndexFields.push("residualRisk", "closureDecision");
  }
  if (
    !hasExactKeys(index, allowedIndexFields) ||
    !/^(?:FFC-[A-Z0-9]+-\d{3}|R-\d{3})$/u.test(item.id ?? "") ||
    index?.schemaVersion !== 2 ||
    index?.subjectId !== item.id ||
    index?.headCommit !== item.evidence?.commit ||
    !/^[0-9a-f]{40}$/u.test(index?.headCommit ?? "") ||
    !isNonEmptyString(index?.authorId) ||
    index?.verification !== verification
  ) {
    errors.push(
      `${item.id}: evidence-index is niet aan subjectId, verification en exact headCommit gebonden.`,
    );
  }

  if (!Array.isArray(index?.codePaths) || index.codePaths.length === 0) {
    errors.push(
      `${item.id}: evidence-index mist codePaths met Git-blobhashes.`,
    );
  } else {
    const seenPaths = new Set();
    for (const record of index.codePaths) {
      if (
        !hasExactKeys(record, ["path", "blobSha256"]) ||
        !isSafeRelativePath(record?.path, root) ||
        seenPaths.has(record?.path) ||
        !/^[0-9a-f]{64}$/u.test(record?.blobSha256 ?? "")
      ) {
        errors.push(
          `${item.id}: codePath is ongeldig, dubbel of mist blobSha256.`,
        );
        continue;
      }
      seenPaths.add(record.path);
      if (verifyFiles && /^[0-9a-f]{40}$/u.test(index?.headCommit ?? "")) {
        const blob = readGitFile(root, index.headCommit, record.path);
        if (!blob) {
          errors.push(
            `${item.id}: codePath is geen bestand op evidence head: ${record.path}.`,
          );
        } else {
          const digest = createHash("sha256").update(blob).digest("hex");
          if (digest !== record.blobSha256) {
            errors.push(
              `${item.id}: Git-blobhash wijkt af voor ${record.path}.`,
            );
          }
        }
      }
    }
  }

  const commands = index?.commands;
  const expectedCommandIds = requiredEvidenceCommandIds(item);
  if (!Array.isArray(commands)) {
    errors.push(`${item.id}: commands moet altijd een array zijn.`);
  }
  if (commandsRequired) {
    if (
      !Array.isArray(commands) ||
      JSON.stringify(commands.map((command) => command?.id)) !==
        JSON.stringify(expectedCommandIds) ||
      commands.some(
        (command) =>
          !hasExactKeys(command, [
            "id",
            "verification",
            "command",
            "status",
            "exitCode",
            "reportPath",
            "reportSha256",
          ]) ||
          !Object.hasOwn(EVIDENCE_COMMANDS, command.id) ||
          command.verification !== verification ||
          command.command !==
            expectedEvidenceCommand(command.id, item, command.reportPath) ||
          command.exitCode !== 0 ||
          command.status !== "passed" ||
          !isSafeEvidencePath(command.reportPath, root) ||
          !/^[0-9a-f]{64}$/u.test(command.reportSha256 ?? "") ||
          /\b(?:manual|not[_ -]?run|skipped)\b/iu.test(
            `${command?.command ?? ""} ${command?.status ?? ""}`,
          ),
      )
    ) {
      errors.push(
        `${item.id}: exact getypeerde requirement-commands moeten passed/exitCode 0 zijn en naar hun gehashte rapport wijzen; manual/NOT_RUN/skipped of willekeurige shellcommands zijn verboden.`,
      );
    }
  } else if (Array.isArray(commands) && commands.length > 0) {
    errors.push(`${item.id}: IMPLEMENTED mag nog geen commandbewijs claimen.`);
  }

  if (commandsRequired) {
    validateEvidenceProvenance(
      errors,
      item,
      index?.authorId,
      index?.codePaths,
      index?.provenance,
      root,
      verifyFiles,
    );
  } else if (index?.provenance !== null) {
    errors.push(`${item.id}: IMPLEMENTED mag nog geen CI-provenance claimen.`);
  }

  if (
    !hasExactKeys(index?.artifacts, ["runtime", "staging"]) ||
    !Array.isArray(index.artifacts.runtime) ||
    !Array.isArray(index.artifacts.staging)
  ) {
    errors.push(
      `${item.id}: artifacts moet exact getypeerde runtime- en staging-arrays bevatten.`,
    );
  }

  for (const [kind, required] of [
    ["runtime", commandsRequired],
    ["staging", stagingVerified],
  ]) {
    const artifacts = Array.isArray(index?.artifacts?.[kind])
      ? index.artifacts[kind]
      : [];
    if (required && (!Array.isArray(artifacts) || artifacts.length !== 1)) {
      errors.push(
        `${item.id}: evidence-index vereist exact één canoniek ${kind}-JSON-rapport.`,
      );
    }
    if (!required && artifacts.length > 0) {
      errors.push(
        `${item.id}: deze state mag nog geen ${kind}-rapport claimen.`,
      );
    }
    const paths = new Set();
    for (const artifact of artifacts ?? []) {
      const report = validateHashedArtifactRecord(
        errors,
        item.id,
        artifact,
        root,
        verifyFiles,
        index.provenance,
      );
      if (paths.has(artifact?.path)) {
        errors.push(`${item.id}: dubbel ${kind}-artifactpad.`);
      }
      paths.add(artifact?.path);
      if (artifact?.reportKind !== kind) {
        errors.push(
          `${item.id}: ${kind}-artifact declareert een ander rapportkind.`,
        );
      }
      const kindCommandIds = expectedCommandIds.filter(
        (commandId) => evidenceReportKindForCommand(commandId) === kind,
      );
      if (report) {
        errors.push(
          ...validateMachineEvidenceReport(item, report, {
            kind,
            commandIds: kindCommandIds,
            provenance: index.provenance,
            root,
            verifyFiles,
          }),
        );
      }
    }
  }

  if (commandsRequired && Array.isArray(commands)) {
    const allArtifacts = [
      ...(index?.artifacts?.runtime ?? []),
      ...(index?.artifacts?.staging ?? []),
    ];
    for (const command of commands) {
      if (
        !allArtifacts.some(
          (artifact) =>
            artifact.path === command.reportPath &&
            artifact.sha256 === command.reportSha256 &&
            artifact.reportKind === evidenceReportKindForCommand(command.id),
        )
      ) {
        errors.push(
          `${item.id}: command ${command.id} is niet aan het canonieke rapportpad/hash/kind gekoppeld.`,
        );
      }
    }
  }

  const reviewers = index?.reviewers;
  const validReviewers = validateReviewerRecords(
    errors,
    item,
    index?.authorId,
    reviewers,
    index?.provenance,
    verifyFiles,
  );
  if (localVerified && (!validReviewers || reviewers.length < 1)) {
    errors.push(
      `${item.id}: onafhankelijke reviewerrol ontbreekt of bevat self-review.`,
    );
  }
  if (
    stagingVerified &&
    (!validReviewers ||
      !["functional-security", "visual-a11y"].every((role) =>
        reviewers.some((reviewer) => reviewer.role === role),
      ))
  ) {
    errors.push(
      `${item.id}: staging vereist onafhankelijke functional-security én visual-a11y review.`,
    );
  }
  if (!localVerified && Array.isArray(reviewers) && reviewers.length > 0) {
    errors.push(
      `${item.id}: deze state mag nog geen reviewattestatie claimen.`,
    );
  }
  if (state === "RELEASED") {
    const release = index?.release;
    if (
      !hasExactKeys(release, [
        "provider",
        "repository",
        "environment",
        "releasedCommit",
        "deploymentId",
        "statusId",
        "state",
      ]) ||
      release.provider !== "github-deployments" ||
      release.repository !== EVIDENCE_REPOSITORY ||
      release.environment !== "production" ||
      release.releasedCommit !== item.evidence?.releasedCommit ||
      release.releasedCommit !== item.evidence?.commit ||
      !Number.isInteger(release.deploymentId) ||
      release.deploymentId <= 0 ||
      !Number.isInteger(release.statusId) ||
      release.statusId <= 0 ||
      release.state !== "success"
    ) {
      errors.push(
        `${item.id}: releaseattestatie mist exacte GitHub production deployment op implementation HEAD.`,
      );
    } else if (verifyFiles) {
      const deployment = githubApiJson(
        `repos/${EVIDENCE_REPOSITORY}/deployments/${release.deploymentId}`,
      );
      const status = githubApiJson(
        `repos/${EVIDENCE_REPOSITORY}/deployments/${release.deploymentId}/statuses/${release.statusId}`,
      );
      if (
        !deployment ||
        deployment.sha !== release.releasedCommit ||
        deployment.environment !== "production" ||
        !status ||
        status.state !== "success"
      ) {
        errors.push(
          `${item.id}: live GitHub deployment/status bevestigt deze release niet.`,
        );
      }
    }
  } else if (index?.release !== null) {
    errors.push(`${item.id}: niet-RELEASED state mag geen release claimen.`);
  }
  return errors;
}

function loadEvidenceIndex(errors, item, root, verifyFiles) {
  const reference = parseHashedArtifactReference(item.evidence?.index);
  if (!reference || !isSafeEvidencePath(reference.path, root)) {
    errors.push(`${item.id}: evidence.index mist veilig pad#sha256.`);
    return null;
  }
  const indexPath = resolve(root, reference.path);
  if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
    errors.push(`${item.id}: evidence-index bestaat niet: ${reference.path}.`);
    return null;
  }
  if (hashFile(indexPath) !== reference.sha256) {
    errors.push(`${item.id}: evidence-indexhash wijkt af.`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(indexPath, "utf8"));
  } catch {
    errors.push(`${item.id}: evidence-index is geen geldige JSON.`);
    return null;
  }
}

export function validateRequirementEvidence(
  item,
  { root = ROOT, verifyFiles = false } = {},
) {
  const errors = [];
  const state = item.state;
  if (state === "CONTRACTED") {
    if (item.evidence && Object.keys(item.evidence).length > 0) {
      errors.push(`${item.id}: CONTRACTED mag geen bewijsclaim bevatten.`);
    }
    return errors;
  }
  const evidence = item.evidence;
  const expectedEvidenceFields =
    state === "RELEASED"
      ? ["commit", "index", "releasedCommit"]
      : ["commit", "index"];
  if (!hasExactKeys(evidence, expectedEvidenceFields)) {
    errors.push(
      `${item.id}: evidence bevat niet exact de claimvelden voor deze state.`,
    );
  }
  for (const legacyField of [
    "codePaths",
    "tests",
    "runtimeEvidence",
    "stagingEvidence",
    "reviewers",
  ]) {
    if (Object.hasOwn(evidence ?? {}, legacyField)) {
      errors.push(
        `${item.id}: legacy evidence.${legacyField} is verboden; gebruik de gehashte index.`,
      );
    }
  }
  if (!/^[0-9a-f]{40}$/u.test(evidence?.commit ?? "")) {
    errors.push(
      `${item.id}: evidence.commit mist een exacte implementatie-SHA.`,
    );
  } else if (verifyFiles && !gitCommitExists(root, evidence.commit)) {
    errors.push(`${item.id}: evidence.commit bestaat niet in de repository.`);
  }
  const index = loadEvidenceIndex(errors, item, root, verifyFiles);
  if (index)
    errors.push(
      ...validateEvidenceIndexPayload(item, index, { root, verifyFiles }),
    );
  if (
    state === "RELEASED" &&
    !/^[0-9a-f]{40}$/u.test(evidence?.releasedCommit ?? "")
  ) {
    errors.push(`${item.id}: evidence.releasedCommit ontbreekt.`);
  } else if (
    state === "RELEASED" &&
    verifyFiles &&
    !gitCommitExists(root, evidence.releasedCommit)
  ) {
    errors.push(
      `${item.id}: evidence.releasedCommit bestaat niet in de repository.`,
    );
  }
  return errors;
}

export function readPngDimensions(path) {
  const buffer = readFileSync(path);
  const signature = "89504e470d0a1a0a";
  if (
    buffer.length < 24 ||
    buffer.subarray(0, 8).toString("hex") !== signature ||
    buffer.subarray(12, 16).toString("ascii") !== "IHDR"
  ) {
    throw new Error(`Geen geldige PNG: ${path}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function validateRequiredFiles(errors, packageRoot) {
  for (const file of REQUIRED_DOCS) {
    const path = resolve(packageRoot, file);
    if (!existsSync(path) || !statSync(path).isFile()) {
      errors.push(`Verplicht pakketbestand ontbreekt: ${file}`);
    }
  }
}

export function validateRoutes(
  errors,
  root,
  routesManifest,
  productionInventory,
) {
  const routes = routesManifest.routes ?? [];
  const ids = new Set();
  const routeKeys = new Set();
  const declaredSources = [];
  const productionRoutesById = new Map(
    (productionInventory?.routes ?? []).map((route) => [route.routeId, route]),
  );

  if (hashJson(routesManifest) !== ROUTES_CONTENT_SHA256) {
    errors.push(
      "Routepresentatie-inhoudsdigest wijkt af; titles, archetypen, responsive composities of machinekoppelingen zijn niet meer exact.",
    );
  }

  if (routesManifest.schemaVersion !== 3) {
    errors.push("routes.json schemaVersion moet 3 zijn.");
  }
  if (
    routesManifest.contractLayers?.presentationComposition?.status !==
      "fieldflowNewContract" ||
    JSON.stringify(
      routesManifest.contractLayers?.presentationComposition?.fields,
    ) !==
      JSON.stringify([
        "title",
        "archetype",
        "prototypePattern",
        "capabilityIds",
        "primaryActionIds",
        "secondaryActionIds",
        "destructiveActionIds",
        "responsiveProfile",
        "responsivePattern",
        "notes",
      ]) ||
    routesManifest.contractLayers?.existingProduction?.status !==
      "existingProduction" ||
    routesManifest.contractLayers?.existingProduction?.manifest !==
      "production-inventory.json"
  ) {
    errors.push(
      "Routecontract scheidt presentatie en productie niet expliciet.",
    );
  }
  if (
    JSON.stringify(routesManifest.statePolicy?.always) !==
      JSON.stringify(REQUIRED_ROUTE_STATES) ||
    JSON.stringify(routesManifest.statePolicy?.byArchetype?.list) !==
      JSON.stringify(["filtered-empty"]) ||
    JSON.stringify(routesManifest.statePolicy?.byArchetype?.inbox) !==
      JSON.stringify(["filtered-empty"]) ||
    JSON.stringify(routesManifest.statePolicy?.mutationStates) !==
      JSON.stringify(["saving", "success", "mutation-error"])
  ) {
    errors.push("Geërfd route-statecontract is onvolledig.");
  }
  const generatedAgainst = routesManifest.generatedAgainst;
  if (
    generatedAgainst?.platformBaseCommit !== PLATFORM_BASE_COMMIT ||
    generatedAgainst?.uiuxMasterObservedCommit !== PLATFORM_BASE_COMMIT ||
    generatedAgainst?.mainObservedCommit !== OBSERVED_MAIN_COMMIT ||
    generatedAgainst?.prototypeCommit !== PROTOTYPE_COMMIT
  ) {
    errors.push("Route-inventarisbron wijkt af van de vastgezette commits.");
  }
  if (routes.length !== 79) {
    errors.push(`routes.json moet 79 routes bevatten, niet ${routes.length}.`);
  }
  const responsivePolicy = routesManifest.responsiveCompositionPolicy;
  const expectedRanges = {
    phone: [320, 560],
    tabletPortrait: [561, 860],
    compactDesktop: [861, 1180],
    desktop: [1181, 1919],
    wide: [1920, null],
  };
  const requiredProfiles = [
    "dashboard-grid",
    "planboard",
    "data-view",
    "dossier",
    "inbox",
    "editor",
    "website-studio",
    "settings-form",
    "settings-index",
    "article",
    "wizard",
    "auth",
    "single-purpose",
  ];
  if (
    JSON.stringify(responsivePolicy?.viewportRangesPx) !==
      JSON.stringify(expectedRanges) ||
    responsivePolicy?.componentThresholdsPx?.inlinePlanboardQueueViewportMin !==
      1280 ||
    responsivePolicy?.componentThresholdsPx
      ?.threePaneWebsiteStudioViewportMin !== 1280 ||
    responsivePolicy?.componentThresholdsPx?.desktopDataViewViewportMin !==
      861 ||
    requiredProfiles.some(
      (profile) =>
        !responsivePolicy?.profiles?.[profile]?.summary ||
        !responsivePolicy.profiles[profile].mobileMax860 ||
        !responsivePolicy.profiles[profile].compact861To1180 ||
        !responsivePolicy.profiles[profile].desktop1181Plus,
    )
  ) {
    errors.push("Canonieke responsive shell-/componentprofielen ontbreken.");
  }

  for (const route of routes) {
    const label = route.id || route.route || "(onbekende route)";
    if (!route.id || ids.has(route.id)) {
      errors.push(`Ontbrekende of dubbele route-ID: ${label}`);
    }
    ids.add(route.id);

    const routeKey = `${route.surface}:${route.route}`;
    if (!route.route || routeKeys.has(routeKey)) {
      errors.push(`Ontbrekende of dubbele route: ${routeKey}`);
    }
    routeKeys.add(routeKey);

    if (!["tenant", "auth"].includes(route.surface)) {
      errors.push(`${label}: ongeldige surface.`);
    }
    if (!route.source || !existsSync(resolve(root, route.source))) {
      errors.push(`${label}: bronbestand bestaat niet: ${route.source}`);
    } else {
      declaredSources.push(route.source);
      const expectedRoute = routeFromSource(route.source);
      if (expectedRoute !== route.route) {
        errors.push(
          `${label}: route ${route.route} past niet bij bron ${route.source} (${expectedRoute}).`,
        );
      }
    }
    if (!route.title || !route.domain || !route.archetype) {
      errors.push(`${label}: title/domain/archetype is onvolledig.`);
    }
    if (!route.permission || !route.workPackage) {
      errors.push(`${label}: permission/workPackage is onvolledig.`);
    }
    if (!PROTOTYPE_PATTERNS.has(route.prototypePattern)) {
      errors.push(`${label}: onbekend prototypePattern.`);
    }
    if (Object.hasOwn(route, "capabilities")) {
      errors.push(
        `${label}: vrije presentatie-capabilitylabels zijn verboden.`,
      );
    }
    if (Object.hasOwn(route, "actions")) {
      errors.push(`${label}: vrije presentatie-actielabels zijn verboden.`);
    }
    const productionRoute = productionRoutesById.get(route.id);
    if (!productionRoute) {
      errors.push(`${label}: productie-capability-/actiecontract ontbreekt.`);
    } else {
      const expectedCapabilityIds = (
        productionRoute.existingProduction?.capabilities ?? []
      ).map((capability) => capability.id);
      if (
        !Array.isArray(route.capabilityIds) ||
        JSON.stringify(route.capabilityIds) !==
          JSON.stringify(expectedCapabilityIds)
      ) {
        errors.push(
          `${label}: capabilityIds moet exact alle productiecapabilities in inventarisvolgorde bevatten.`,
        );
      }
      const actionFieldsByKind = {
        primary: "primaryActionIds",
        secondary: "secondaryActionIds",
        destructive: "destructiveActionIds",
      };
      for (const [kind, field] of Object.entries(actionFieldsByKind)) {
        const expected = (productionRoute.existingProduction?.actions ?? [])
          .filter((action) => action.kind === kind)
          .map((action) => action.id);
        const actual = route[field];
        if (
          !Array.isArray(actual) ||
          JSON.stringify(actual) !== JSON.stringify(expected)
        ) {
          errors.push(
            `${label}: ${field} moet exact alle productie-acties van soort ${kind} in inventarisvolgorde bevatten.`,
          );
        }
      }
    }
    const responsiveProfile =
      responsivePolicy?.profiles?.[route.responsiveProfile];
    if (
      !responsiveProfile ||
      route.responsivePattern !== responsiveProfile.summary
    ) {
      errors.push(`${label}: responsiveProfile/pattern ontbreekt of wijkt af.`);
    }
    for (const state of REQUIRED_ROUTE_STATES) {
      if (!route.requiredStates?.includes(state)) {
        errors.push(`${label}: verplichte state ontbreekt: ${state}`);
      }
    }
  }

  const discoveredSources = discoverPageSources(root);
  const comparison = compareRouteSources(declaredSources, discoveredSources);
  for (const source of comparison.missingFromManifest) {
    errors.push(`App Router-pagina ontbreekt in manifest: ${source}`);
  }
  for (const source of comparison.staleManifestSources) {
    errors.push(`Manifest verwijst naar stale pagina: ${source}`);
  }

  const tenantCount = routes.filter(
    (route) => route.surface === "tenant",
  ).length;
  const authCount = routes.filter((route) => route.surface === "auth").length;
  if (
    tenantCount !== 75 ||
    authCount !== 4 ||
    routesManifest.routeCounts?.tenantDashboardPages !== tenantCount ||
    routesManifest.routeCounts?.authPages !== authCount ||
    routesManifest.routeCounts?.total !== routes.length
  ) {
    errors.push("Routecounts zijn niet exact 75 tenant + 4 auth.");
  }

  try {
    execFileSync(
      "git",
      ["cat-file", "-e", `${PLATFORM_BASE_COMMIT}^{commit}`],
      {
        cwd: root,
        stdio: "ignore",
      },
    );
    const tree = execFileSync(
      "git",
      [
        "ls-tree",
        "-r",
        PLATFORM_BASE_COMMIT,
        "--",
        "artifacts/backoffice/src/app/(dashboard)",
        "artifacts/backoffice/src/app/(auth)",
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    const blobs = new Map();
    for (const line of tree.trim().split("\n")) {
      if (!line) continue;
      const match = /^\d+\s+blob\s+([0-9a-f]{40})\t(.+)$/u.exec(line);
      if (match) blobs.set(match[2], match[1]);
    }
    const digestInput = declaredSources
      .map((source) => `${source}:${blobs.get(source) ?? "MISSING"}`)
      .sort()
      .join("\n");
    const digest = createHash("sha256").update(digestInput).digest("hex");
    if (digest !== generatedAgainst?.routeSourceDigestSha256) {
      errors.push(
        "Route-page blobdigest past niet bij de vastgezette platformbasis.",
      );
    }
  } catch (error) {
    errors.push(
      `Gitbron van route-inventaris kan niet worden gevalideerd: ${error}`,
    );
  }

  return new Set(routes.map((route) => route.route));
}

export function collectTypescriptSymbolsFromSource(source, path) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const declared = new Set();
  const exported = new Set();
  const topLevelDeclared = new Set();
  const topLevelExported = new Set();
  const topLevelCallable = new Set();
  const topLevelAsyncCallable = new Set();

  function hasExportModifier(node) {
    return Boolean(
      node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ),
    );
  }

  function addBindingName(name, target) {
    if (ts.isIdentifier(name)) {
      target.add(name.text);
      return;
    }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) addBindingName(element.name, target);
      }
    }
  }

  function visit(node) {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name
    ) {
      declared.add(node.name.text);
      if (hasExportModifier(node)) exported.add(node.name.text);
    }
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        addBindingName(declaration.name, declared);
        if (hasExportModifier(node)) addBindingName(declaration.name, exported);
      }
    }
    if (
      (ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertyAssignment(node)) &&
      node.name &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
    ) {
      declared.add(node.name.text);
    }
    if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const element of node.exportClause.elements) {
        exported.add(element.name.text);
        declared.add(element.name.text);
      }
    }
    if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
      exported.add(node.expression.text);
      declared.add(node.expression.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  for (const statement of sourceFile.statements) {
    const statementExported = hasExportModifier(statement);
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      topLevelDeclared.add(statement.name.text);
      if (statementExported) topLevelExported.add(statement.name.text);
      if (ts.isFunctionDeclaration(statement)) {
        topLevelCallable.add(statement.name.text);
        if (
          statement.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
          )
        ) {
          topLevelAsyncCallable.add(statement.name.text);
        }
      }
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const names = new Set();
        addBindingName(declaration.name, names);
        for (const name of names) {
          topLevelDeclared.add(name);
          if (statementExported) topLevelExported.add(name);
          if (
            declaration.initializer &&
            (ts.isArrowFunction(declaration.initializer) ||
              ts.isFunctionExpression(declaration.initializer))
          ) {
            topLevelCallable.add(name);
            if (
              declaration.initializer.modifiers?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
              )
            ) {
              topLevelAsyncCallable.add(name);
            }
          }
        }
      }
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        topLevelExported.add(element.name.text);
      }
    }
  }
  const directivePrologue = [];
  for (const statement of sourceFile.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteral(statement.expression)
    ) {
      break;
    }
    directivePrologue.push(statement.expression.text);
  }
  const hasUseServerDirective = directivePrologue.includes("use server");
  return {
    declared,
    exported,
    topLevelDeclared,
    topLevelExported,
    topLevelCallable,
    topLevelAsyncCallable,
    hasUseServerDirective,
  };
}

function collectTypescriptSymbols(path) {
  return collectTypescriptSymbolsFromSource(readFileSync(path, "utf8"), path);
}

function resolveBackofficeTypescriptModule(reader, importerPath, specifier) {
  let basePath;
  if (specifier.startsWith("@/")) {
    basePath = posix.join(
      "artifacts/backoffice/src",
      specifier.slice("@/".length),
    );
  } else if (specifier.startsWith(".")) {
    basePath = posix.normalize(
      posix.join(posix.dirname(importerPath), specifier),
    );
  } else {
    return null;
  }

  const extensionlessBase = /\.(?:js|jsx|mjs)$/u.test(basePath)
    ? basePath.replace(/\.(?:js|jsx|mjs)$/u, "")
    : basePath;
  const candidates = [
    basePath,
    extensionlessBase,
    `${extensionlessBase}.ts`,
    `${extensionlessBase}.tsx`,
    posix.join(extensionlessBase, "index.ts"),
    posix.join(extensionlessBase, "index.tsx"),
  ];
  for (const candidate of [...new Set(candidates)]) {
    if (reader.has(candidate) && /\.(?:ts|tsx)$/u.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function createBackofficeImportGraph(root) {
  const reader = createPlatformBaseSourceReader(root);
  const moduleCache = new Map();
  const exportResolutionCache = new Map();

  function parseModule(path) {
    const cached = moduleCache.get(path);
    if (cached) return cached;

    const source = reader.read(path);
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const importedLocals = new Map();
    const directExports = new Map();
    const reexports = new Map();
    const exportStars = [];
    const localDeclarations = new Map();
    const anonymousDeclarations = new Map();

    function hasExportModifier(node) {
      return Boolean(
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ),
      );
    }

    function bindingNames(name, output = []) {
      if (ts.isIdentifier(name)) output.push(name.text);
      if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
        for (const element of name.elements) {
          if (ts.isBindingElement(element)) bindingNames(element.name, output);
        }
      }
      return output;
    }

    for (const statement of sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const targetPath = resolveBackofficeTypescriptModule(
          reader,
          path,
          statement.moduleSpecifier.text,
        );
        if (!targetPath) continue;
        const clause = statement.importClause;
        if (!clause) continue;
        if (clause.isTypeOnly) continue;
        if (clause.name) {
          const binding = {
            targetPath,
            importedName: "default",
            localName: clause.name.text,
          };
          importedLocals.set(binding.localName, binding);
        }
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            if (element.isTypeOnly) continue;
            const binding = {
              targetPath,
              importedName: (element.propertyName ?? element.name).text,
              localName: element.name.text,
            };
            importedLocals.set(binding.localName, binding);
          }
        }
        if (
          clause.namedBindings &&
          ts.isNamespaceImport(clause.namedBindings)
        ) {
          const localName = clause.namedBindings.name.text;
          importedLocals.set(localName, {
            targetPath,
            importedName: "*",
            localName,
          });
        }
        continue;
      }

      if (
        ts.isExportDeclaration(statement) &&
        !statement.isTypeOnly &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const targetPath = resolveBackofficeTypescriptModule(
          reader,
          path,
          statement.moduleSpecifier.text,
        );
        if (!targetPath) continue;
        if (!statement.exportClause) {
          exportStars.push(targetPath);
        } else if (ts.isNamedExports(statement.exportClause)) {
          for (const element of statement.exportClause.elements) {
            if (element.isTypeOnly) continue;
            reexports.set(element.name.text, {
              targetPath,
              importedName: (element.propertyName ?? element.name).text,
            });
          }
        } else if (ts.isNamespaceExport(statement.exportClause)) {
          reexports.set(statement.exportClause.name.text, {
            targetPath,
            importedName: "*",
          });
        }
        continue;
      }

      if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
      ) {
        for (const element of statement.exportClause.elements) {
          if (!element.isTypeOnly) {
            directExports.set(
              element.name.text,
              (element.propertyName ?? element.name).text,
            );
          }
        }
        continue;
      }

      if (ts.isExportAssignment(statement)) {
        if (ts.isIdentifier(statement.expression)) {
          directExports.set("default", statement.expression.text);
        } else {
          directExports.set("default", "$default");
          anonymousDeclarations.set("$default", statement.expression);
        }
        continue;
      }

      if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isEnumDeclaration(statement)) &&
        statement.name
      ) {
        if (!localDeclarations.has(statement.name.text) || statement.body) {
          localDeclarations.set(statement.name.text, statement);
        }
        if (hasExportModifier(statement)) {
          directExports.set(
            statement.modifiers?.some(
              (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
            )
              ? "default"
              : statement.name.text,
            statement.name.text,
          );
        }
        continue;
      }

      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          for (const name of bindingNames(declaration.name)) {
            localDeclarations.set(name, declaration);
            if (hasExportModifier(statement)) directExports.set(name, name);
          }
        }
      }
    }

    const result = {
      sourceFile,
      importedLocals,
      directExports,
      reexports,
      exportStars,
      localDeclarations,
      anonymousDeclarations,
    };
    moduleCache.set(path, result);
    return result;
  }

  function resolveExportTargets(path, exportedName, resolving = new Set()) {
    const cacheKey = `${path}#${exportedName}`;
    if (exportResolutionCache.has(cacheKey)) {
      return exportResolutionCache.get(cacheKey);
    }
    if (resolving.has(cacheKey)) return [];
    const nextResolving = new Set(resolving).add(cacheKey);
    const module = parseModule(path);
    const targets = [];

    const directName = module.directExports.get(exportedName);
    if (directName) {
      const imported = module.importedLocals.get(directName);
      if (imported) {
        targets.push(
          ...resolveExportTargets(
            imported.targetPath,
            imported.importedName,
            nextResolving,
          ),
        );
      } else {
        targets.push({ path, symbol: directName });
      }
    }

    const reexport = module.reexports.get(exportedName);
    if (reexport && reexport.importedName !== "*") {
      targets.push(
        ...resolveExportTargets(
          reexport.targetPath,
          reexport.importedName,
          nextResolving,
        ),
      );
    }
    if (exportedName !== "default") {
      for (const targetPath of module.exportStars) {
        targets.push(
          ...resolveExportTargets(targetPath, exportedName, nextResolving),
        );
      }
    }

    const uniqueTargets = [
      ...new Map(
        targets.map((target) => [`${target.path}#${target.symbol}`, target]),
      ).values(),
    ];
    exportResolutionCache.set(cacheKey, uniqueTargets);
    return uniqueTargets;
  }

  function reachableSymbolsFrom(entryPath, entrySymbol) {
    const symbols = new Set();
    const uiSymbols = new Set();
    const interactionSymbols = new Set();
    const uiWitnesses = new Map();
    const serverActionTargets = new Set();
    const edges = [];
    const processedMasks = new Map();
    const pending = [];

    function contextMask(context) {
      return (context.ui ? 1 : 0) | (context.interaction ? 2 : 0);
    }

    function activateTarget(target, context, edge = null) {
      const key = `${target.path}#${target.symbol}`;
      symbols.add(key);
      if (context.ui) uiSymbols.add(key);
      if (context.interaction) interactionSymbols.add(key);
      if (edge) edges.push({ ...edge, to: key });
      const nextMask = contextMask(context);
      const previousMask = processedMasks.get(key) ?? 0;
      if ((previousMask & nextMask) !== nextMask) {
        pending.push({ ...target, context });
      }
    }

    function enclosingJsxAttribute(node, boundary) {
      let current = node.parent;
      while (current && current !== boundary) {
        if (ts.isJsxAttribute(current)) return current;
        current = current.parent;
      }
      return null;
    }

    function isTypePosition(node, boundary) {
      let current = node.parent;
      while (current && current !== boundary) {
        if (ts.isTypeNode(current)) return true;
        current = current.parent;
      }
      return false;
    }

    function isIdentifierReference(node, boundary) {
      if (isTypePosition(node, boundary)) return false;
      const parent = node.parent;
      if (!parent) return false;
      if (
        ((ts.isFunctionDeclaration(parent) ||
          ts.isFunctionExpression(parent) ||
          ts.isArrowFunction(parent) ||
          ts.isClassDeclaration(parent) ||
          ts.isClassExpression(parent) ||
          ts.isVariableDeclaration(parent) ||
          ts.isParameter(parent) ||
          ts.isBindingElement(parent)) &&
          parent.name === node) ||
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isMethodDeclaration(parent) && parent.name === node) ||
        (ts.isPropertyDeclaration(parent) && parent.name === node) ||
        (ts.isJsxAttribute(parent) && parent.name === node) ||
        ts.isImportClause(parent) ||
        ts.isImportSpecifier(parent) ||
        ts.isNamespaceImport(parent) ||
        ts.isExportSpecifier(parent) ||
        ts.isLabeledStatement(parent) ||
        ts.isBreakStatement(parent) ||
        ts.isContinueStatement(parent)
      ) {
        return false;
      }
      return true;
    }

    function usageForIdentifier(node, boundary) {
      const attribute = enclosingJsxAttribute(node, boundary);
      const attributeName = attribute?.name?.getText?.() ?? "";
      if (attributeName === "action" || attributeName === "formAction") {
        return "form-action-target";
      }
      if (/^on[A-Z]/u.test(attributeName)) return "event-handler";
      if (attributeName === "href") return "navigation-href";
      let ancestor = node.parent;
      while (ancestor && ancestor !== boundary) {
        if (
          ts.isCallExpression(ancestor) &&
          ts.isIdentifier(ancestor.expression)
        ) {
          if (
            ["useActionState", "useFormState"].includes(
              ancestor.expression.text,
            )
          ) {
            return "form-action-target";
          }
          if (
            ["useEffect", "useLayoutEffect"].includes(ancestor.expression.text)
          ) {
            return "lifecycle-call";
          }
        }
        ancestor = ancestor.parent;
      }
      const parent = node.parent;
      if (
        (ts.isJsxOpeningElement(parent) ||
          ts.isJsxSelfClosingElement(parent) ||
          ts.isJsxClosingElement(parent)) &&
        parent.tagName === node
      ) {
        return "jsx-render";
      }
      if (ts.isCallExpression(parent) && parent.expression === node) {
        return "call";
      }
      if (ts.isNewExpression(parent) && parent.expression === node) {
        return "construct";
      }
      return "value";
    }

    function analyseDeclaration(path, symbol, declaration) {
      const module = parseModule(path);
      const dependencies = new Map();
      const witnesses = new Set();
      const stateSetters = new Set();
      const navigationRouters = new Set();
      const nestedUnits = new Map();
      const nestedUnitAliases = new Map();
      const nestedUnitNodeIds = new Map();
      const eagerNestedUnits = new Set();

      function localBindingNames(name, output = []) {
        if (ts.isIdentifier(name)) output.push(name.text);
        if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
          for (const element of name.elements) {
            if (ts.isBindingElement(element)) {
              localBindingNames(element.name, output);
            }
          }
        }
        return output;
      }

      function collectNestedUnits(node) {
        if (node !== declaration) {
          let aliases = [];
          let unitNode = null;
          if (ts.isFunctionDeclaration(node) && node.name) {
            aliases = [node.name.text];
            unitNode = node;
          } else if (ts.isVariableDeclaration(node) && node.initializer) {
            aliases = localBindingNames(node.name);
            unitNode = node.initializer;
          }
          if (unitNode && aliases.length > 0) {
            const unitId = `${aliases.join("|")}@${unitNode.pos}`;
            nestedUnits.set(unitId, unitNode);
            nestedUnitNodeIds.set(unitNode, unitId);
            if (
              ts.isVariableDeclaration(node) &&
              !ts.isArrowFunction(unitNode) &&
              !ts.isFunctionExpression(unitNode)
            ) {
              eagerNestedUnits.add(unitId);
            }
            for (const alias of aliases) nestedUnitAliases.set(alias, unitId);
          }
        }
        ts.forEachChild(node, collectNestedUnits);
      }
      collectNestedUnits(declaration);

      function enclosingNestedUnit(node) {
        let current = node.parent;
        while (current && current !== declaration) {
          const unitId = nestedUnitNodeIds.get(current);
          if (unitId) return unitId;
          current = current.parent;
        }
        return null;
      }

      const unitDependencies = new Map(
        [...nestedUnits.keys()].map((unitId) => [unitId, new Set()]),
      );
      const rootUnitReferences = new Set();
      const interactionUnitCandidates = [];

      for (const unitId of eagerNestedUnits) {
        const owner = enclosingNestedUnit(nestedUnits.get(unitId));
        if (owner) unitDependencies.get(owner)?.add(unitId);
        else rootUnitReferences.add(unitId);
      }

      function collectUnitReferences(node) {
        if (
          ts.isIdentifier(node) &&
          nestedUnitAliases.has(node.text) &&
          isIdentifierReference(node, declaration)
        ) {
          const referencedUnit = nestedUnitAliases.get(node.text);
          const owner = enclosingNestedUnit(node);
          if (owner && owner !== referencedUnit) {
            unitDependencies.get(owner)?.add(referencedUnit);
          } else if (!owner) {
            rootUnitReferences.add(referencedUnit);
          }
          const attribute = enclosingJsxAttribute(node, declaration);
          const attributeName = attribute?.name?.getText?.() ?? "";
          if (
            /^on[A-Z]/u.test(attributeName) ||
            attributeName === "action" ||
            attributeName === "formAction"
          ) {
            interactionUnitCandidates.push({ referencedUnit, owner });
          }
        }
        ts.forEachChild(node, collectUnitReferences);
      }
      collectUnitReferences(declaration);

      function transitiveUnitClosure(seeds) {
        const closure = new Set(seeds);
        const queue = [...seeds];
        while (queue.length > 0) {
          const unitId = queue.shift();
          for (const dependency of unitDependencies.get(unitId) ?? []) {
            if (!closure.has(dependency)) {
              closure.add(dependency);
              queue.push(dependency);
            }
          }
        }
        return closure;
      }

      const reachableNestedUnits = transitiveUnitClosure(rootUnitReferences);
      const interactionUnitReferences = new Set(
        interactionUnitCandidates
          .filter(({ owner }) => !owner || reachableNestedUnits.has(owner))
          .map(({ referencedUnit }) => referencedUnit),
      );
      const interactionNestedUnits = transitiveUnitClosure(
        interactionUnitReferences,
      );

      function addDependency(localName, usage) {
        const usages = dependencies.get(localName) ?? new Set();
        usages.add(usage);
        dependencies.set(localName, usages);
      }

      function visit(node) {
        const witnessUnit = enclosingNestedUnit(node);
        const witnessNodeIsReachable =
          !witnessUnit || reachableNestedUnits.has(witnessUnit);
        if (
          ts.isVariableDeclaration(node) &&
          ts.isArrayBindingPattern(node.name)
        ) {
          const initializer = node.initializer;
          if (
            initializer &&
            ts.isCallExpression(initializer) &&
            ts.isIdentifier(initializer.expression) &&
            initializer.expression.text === "useState"
          ) {
            const setter = node.name.elements[1];
            if (
              setter &&
              ts.isBindingElement(setter) &&
              ts.isIdentifier(setter.name)
            ) {
              stateSetters.add(setter.name.text);
            }
          }
        }
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer &&
          ts.isCallExpression(node.initializer) &&
          ts.isIdentifier(node.initializer.expression) &&
          node.initializer.expression.text === "useRouter"
        ) {
          navigationRouters.add(node.name.text);
        }
        if (witnessNodeIsReachable && ts.isJsxAttribute(node)) {
          const name = node.name.getText();
          if (/^on[A-Z]/u.test(name)) witnesses.add(`event-handler:${name}`);
          if (name === "href") witnesses.add("navigation:href");
          if (name === "action" || name === "formAction") {
            witnesses.add(`form-action:${name}`);
          }
        }
        if (witnessNodeIsReachable && ts.isCallExpression(node)) {
          if (
            ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            navigationRouters.has(node.expression.expression.text) &&
            ["push", "replace"].includes(node.expression.name.text)
          ) {
            witnesses.add(`navigation:router.${node.expression.name.text}`);
          }
          if (
            ts.isIdentifier(node.expression) &&
            stateSetters.has(node.expression.text)
          ) {
            witnesses.add(`state-transition:${node.expression.text}`);
          }
        }
        if (
          ts.isPropertyAccessExpression(node) &&
          ts.isIdentifier(node.expression)
        ) {
          const namespaceBinding = module.importedLocals.get(
            node.expression.text,
          );
          if (namespaceBinding?.importedName === "*") {
            addDependency(
              `${node.expression.text}.${node.name.text}`,
              usageForIdentifier(node.expression, declaration),
            );
          }
        }
        if (
          ts.isIdentifier(node) &&
          isIdentifierReference(node, declaration) &&
          (module.localDeclarations.has(node.text) ||
            module.importedLocals.has(node.text))
        ) {
          const unitOwner = enclosingNestedUnit(node);
          if (!unitOwner || reachableNestedUnits.has(unitOwner)) {
            const baseUsage = usageForIdentifier(node, declaration);
            addDependency(
              node.text,
              unitOwner && interactionNestedUnits.has(unitOwner)
                ? baseUsage === "call"
                  ? "interaction-call"
                  : ["form-action-target", "lifecycle-call"].includes(baseUsage)
                    ? baseUsage
                    : "interaction-value"
                : baseUsage,
            );
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(declaration);
      const key = `${path}#${symbol}`;
      uiWitnesses.set(key, witnesses);
      return dependencies;
    }

    const entryModule = parseModule(entryPath);
    if (entryModule.localDeclarations.has(entrySymbol)) {
      activateTarget(
        { path: entryPath, symbol: entrySymbol },
        { ui: true, interaction: false },
      );
    } else {
      for (const target of resolveExportTargets(entryPath, entrySymbol)) {
        activateTarget(target, { ui: true, interaction: false });
      }
    }

    while (pending.length > 0) {
      const current = pending.shift();
      const key = `${current.path}#${current.symbol}`;
      const currentMask = contextMask(current.context);
      const previousMask = processedMasks.get(key) ?? 0;
      if ((previousMask & currentMask) === currentMask) continue;
      processedMasks.set(key, previousMask | currentMask);
      const module = parseModule(current.path);
      const declaration =
        module.localDeclarations.get(current.symbol) ??
        module.anonymousDeclarations.get(current.symbol);
      if (!declaration) continue;
      const dependencies = analyseDeclaration(
        current.path,
        current.symbol,
        declaration,
      );
      for (const [localReference, usages] of dependencies) {
        const [localName, namespaceMember] = localReference.split(".");
        const directInteraction = [...usages].some((usage) =>
          [
            "event-handler",
            "form-action-target",
            "interaction-call",
            "interaction-value",
          ].includes(usage),
        );
        const context = {
          ui:
            current.context.ui || usages.has("jsx-render") || directInteraction,
          interaction: current.context.interaction || directInteraction,
        };
        const imported = module.importedLocals.get(localName);
        if (imported) {
          const importedName =
            imported.importedName === "*"
              ? namespaceMember
              : imported.importedName;
          if (!importedName) continue;
          for (const target of resolveExportTargets(
            imported.targetPath,
            importedName,
          )) {
            const edge = {
              from: key,
              localName: localReference,
              usages: [...usages].sort(),
              interaction: context.interaction,
            };
            activateTarget(target, context, edge);
            if (
              target.path.includes("/app/actions/") &&
              ((context.interaction &&
                [...usages].some((usage) =>
                  ["call", "event-handler", "form-action-target"].includes(
                    usage,
                  ),
                )) ||
                usages.has("form-action-target") ||
                usages.has("interaction-call") ||
                usages.has("lifecycle-call") ||
                (current.path === entryPath && usages.has("call")) ||
                (current.context.ui &&
                  usages.has("call") &&
                  [...(uiWitnesses.get(key) ?? [])].some((witness) =>
                    /^(event-handler|form-action|state-transition):/u.test(
                      witness,
                    ),
                  )))
            ) {
              serverActionTargets.add(`${target.path}#${target.symbol}`);
            }
          }
          continue;
        }
        if (module.localDeclarations.has(localName)) {
          activateTarget({ path: current.path, symbol: localName }, context, {
            from: key,
            localName,
            usages: [...usages].sort(),
            interaction: context.interaction,
          });
        }
      }
    }
    return {
      symbols,
      uiSymbols,
      interactionSymbols,
      uiWitnesses,
      serverActionTargets,
      edges,
    };
  }

  return { reachableSymbolsFrom };
}

export function traceBackofficeRouteSource(
  entryPath,
  entrySymbol,
  root = ROOT,
) {
  return createBackofficeImportGraph(root).reachableSymbolsFrom(
    entryPath,
    entrySymbol,
  );
}

export function discoverClientImportedServerActions(root = ROOT) {
  const reader = createPlatformBaseSourceReader(root);
  const scanRoots = [
    "artifacts/backoffice/src/components/",
    "artifacts/backoffice/src/app/",
  ];
  const exportsCache = new Map();
  const discovered = new Map();

  for (const path of [...reader.paths]
    .filter(
      (candidate) =>
        /\.(?:ts|tsx)$/u.test(candidate) &&
        scanRoots.some((prefix) => candidate.startsWith(prefix)),
    )
    .sort()) {
    const source = reader.read(path);
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const directivePrologue = [];
    for (const statement of sourceFile.statements) {
      if (
        !ts.isExpressionStatement(statement) ||
        !ts.isStringLiteral(statement.expression)
      ) {
        break;
      }
      directivePrologue.push(statement.expression.text);
    }
    const isClient = directivePrologue.includes("use client");
    if (!isClient) continue;

    for (const statement of sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !statement.moduleSpecifier.text.startsWith("@/app/actions/")
      ) {
        continue;
      }
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const suffix = statement.moduleSpecifier.text.slice(
        "@/app/actions/".length,
      );
      let sourcePath = `artifacts/backoffice/src/app/actions/${suffix}.ts`;
      if (!reader.has(sourcePath)) {
        sourcePath += "x";
      }
      if (!reader.has(sourcePath)) continue;

      let symbols = exportsCache.get(sourcePath);
      if (!symbols) {
        symbols = collectTypescriptSymbolsFromSource(
          reader.read(sourcePath),
          sourcePath,
        );
        exportsCache.set(sourcePath, symbols);
      }
      if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
        continue;
      }
      for (const element of clause.namedBindings.elements) {
        if (element.isTypeOnly) continue;
        const symbol = (element.propertyName ?? element.name).text;
        if (!symbols.exported.has(symbol)) continue;
        const key = `${sourcePath}#${symbol}`;
        const record = discovered.get(key) ?? {
          source: sourcePath,
          symbol,
          importedBy: new Set(),
        };
        record.importedBy.add(path);
        discovered.set(key, record);
      }
    }
  }

  return [...discovered.values()]
    .map((record) => ({
      source: record.source,
      symbol: record.symbol,
      importedBy: [...record.importedBy].sort(),
    }))
    .sort(
      (first, second) =>
        first.source.localeCompare(second.source) ||
        first.symbol.localeCompare(second.symbol),
    );
}

function validateAvailability(errors, label, availability, depth = 0) {
  const arrayFields = [
    "allPermissions",
    "anyPermissions",
    "modules",
    "featureFlags",
    "planEntitlements",
    "tenantSettings",
  ];
  const allowedFields = new Set([...arrayFields, "anyOf"]);
  if (
    !availability ||
    typeof availability !== "object" ||
    Array.isArray(availability)
  ) {
    errors.push(`${label}: availability moet een object zijn.`);
    return;
  }
  for (const field of Object.keys(availability)) {
    if (!allowedFields.has(field)) {
      errors.push(`${label}: onbekend availability-veld ${field}.`);
    }
  }
  for (const field of arrayFields) {
    if (
      !Array.isArray(availability?.[field]) ||
      availability[field].some((value) => !isNonEmptyString(value))
    ) {
      errors.push(`${label}: availability.${field} moet een stringarray zijn.`);
    }
  }
  for (const permission of [
    ...(availability?.allPermissions ?? []),
    ...(availability?.anyPermissions ?? []),
  ]) {
    if (!/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/u.test(permission)) {
      errors.push(`${label}: ongeldige permission ${permission}.`);
    }
  }
  for (const module of availability?.modules ?? []) {
    if (!KNOWN_AUTHORIZATION_MODULES.has(module)) {
      errors.push(`${label}: onbekende authorizationmodule ${module}.`);
    }
  }
  if (Object.hasOwn(availability, "anyOf")) {
    if (
      depth > 0 ||
      !Array.isArray(availability.anyOf) ||
      availability.anyOf.length === 0
    ) {
      errors.push(
        `${label}: availability.anyOf mag alleen op het hoogste niveau staan en moet niet-leeg zijn.`,
      );
      return;
    }
    for (const [index, branch] of availability.anyOf.entries()) {
      validateAvailability(
        errors,
        `${label}.anyOf[${index}]`,
        branch,
        depth + 1,
      );
    }
  }
}

export function computeProductionSourceDigest(root, inventory) {
  const sourcePaths = new Set();
  const addReference = (reference) => {
    if (isNonEmptyString(reference?.path)) sourcePaths.add(reference.path);
  };
  const addReferences = (records) => {
    for (const record of records ?? []) {
      for (const source of record?.sources ?? []) addReference(source);
    }
  };

  addReferences(inventory.globalCapabilities);
  addReferences(inventory.globalActions);
  for (const route of inventory.routes ?? []) {
    for (const source of route.sources ?? []) addReference(source);
    addReferences(route.existingProduction?.capabilities);
    addReferences(route.existingProduction?.actions);
  }
  for (const record of [
    ...(inventory.sourceCoverage?.inventoried ?? []),
    ...(inventory.sourceCoverage?.excluded ?? []),
  ]) {
    if (isNonEmptyString(record?.source)) sourcePaths.add(record.source);
  }

  const paths = [...sourcePaths].sort();
  const unsafePaths = paths.filter((path) => !isSafeRelativePath(path, root));
  let treeOutput;
  try {
    treeOutput = execFileSync(
      "git",
      ["ls-tree", "-r", "--full-tree", PLATFORM_BASE_COMMIT],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
      },
    );
  } catch (error) {
    return {
      paths,
      unsafePaths,
      missingPaths: paths,
      serialized: "",
      digest: null,
      error: String(error?.stderr ?? error?.message ?? error).trim(),
    };
  }
  const blobByPath = new Map();
  for (const line of treeOutput.split("\n")) {
    const tabIndex = line.indexOf("\t");
    if (tabIndex < 0) continue;
    const metadata = line.slice(0, tabIndex).split(" ");
    const path = line.slice(tabIndex + 1);
    if (metadata[1] === "blob" && /^[0-9a-f]{40}$/u.test(metadata[2] ?? "")) {
      blobByPath.set(path, metadata[2]);
    }
  }
  const missingPaths = paths.filter((path) => !blobByPath.has(path));
  const serialized = paths
    .filter((path) => blobByPath.has(path))
    .map((path) => `${path}:${blobByPath.get(path)}`)
    .sort()
    .join("\n");
  const digest = createHash("sha256").update(serialized).digest("hex");
  return { paths, unsafePaths, missingPaths, serialized, digest, error: null };
}

export function validateProductionInventory(
  errors,
  root,
  inventory,
  routesManifest,
) {
  const inventoryContentDigest = createHash("sha256")
    .update(JSON.stringify(inventory))
    .digest("hex");
  if (inventoryContentDigest !== PRODUCTION_INVENTORY_CONTENT_SHA256) {
    errors.push(
      "Production inventory-inhoudsdigest wijkt af; labels, gates, voorwaarden, effecten en bronkoppelingen zijn niet meer exact.",
    );
  }
  if (
    inventory.schemaVersion !== 2 ||
    inventory.name !== "Fieldflow Calm source-grounded production inventory" ||
    inventory.sourceAuthority?.classification !== "existingProduction" ||
    inventory.sourceAuthority?.routesManifest !==
      "docs/uiux/fieldflow-calm-handoff/manifests/routes.json" ||
    inventory.sourceAuthority?.permissionModuleMap !==
      "lib/db/src/module-permissions.ts#FIELDGRID_PERMISSION_MODULES" ||
    inventory.sourceAuthority?.authorizationRuntime !==
      "artifacts/backoffice/src/lib/auth/permissions.ts"
  ) {
    errors.push(
      "Production inventory-identiteit of bronautoriteit is ongeldig.",
    );
  }
  if (
    inventory.generatedAgainst?.platformBaseCommit !== PLATFORM_BASE_COMMIT ||
    inventory.generatedAgainst?.uiuxMasterObservedCommit !==
      PLATFORM_BASE_COMMIT ||
    inventory.generatedAgainst?.mainObservedCommit !== OBSERVED_MAIN_COMMIT ||
    inventory.generatedAgainst?.prototypeCommit !== PROTOTYPE_COMMIT ||
    inventory.generatedAgainst?.routeSourceDigestSha256 !==
      routesManifest.generatedAgainst?.routeSourceDigestSha256 ||
    inventory.generatedAgainst?.productionSourceDigestSha256 !==
      PRODUCTION_SOURCE_DIGEST_SHA256 ||
    inventory.generatedAgainst?.productionSourceDigestSerialization !==
      PRODUCTION_SOURCE_DIGEST_SERIALIZATION
  ) {
    errors.push(
      "Production inventory wijkt af van de vastgezette broncommits.",
    );
  }
  const productionSourceDigest = computeProductionSourceDigest(root, inventory);
  if (
    productionSourceDigest.error !== null ||
    productionSourceDigest.paths.length !==
      EXPECTED_PRODUCTION_SOURCE_PATH_COUNT ||
    productionSourceDigest.unsafePaths.length > 0 ||
    productionSourceDigest.missingPaths.length > 0 ||
    productionSourceDigest.digest !== PRODUCTION_SOURCE_DIGEST_SHA256 ||
    productionSourceDigest.digest !==
      inventory.generatedAgainst?.productionSourceDigestSha256
  ) {
    errors.push(
      `Production bronblobdigest is ongeldig: paths=${productionSourceDigest.paths.length}, unsafe=${productionSourceDigest.unsafePaths.length}, missing=${productionSourceDigest.missingPaths.length}${productionSourceDigest.error ? `, git=${productionSourceDigest.error}` : ""}.`,
    );
  }

  const inventoryRoutes = inventory.routes ?? [];
  const routeById = new Map(
    (routesManifest.routes ?? []).map((route) => [route.id, route]),
  );
  if (
    inventory.routeCount !== 79 ||
    inventoryRoutes.length !== 79 ||
    routeById.size !== inventoryRoutes.length
  ) {
    errors.push("Production inventory moet exact de 79 routerecords bevatten.");
  }

  const seenRoutes = new Set();
  const capabilityIds = new Set();
  const actionIds = new Set();
  const actionById = new Map();
  const sourceCache = new Map();
  const platformSourceReader = createPlatformBaseSourceReader(root);
  const importGraph = createBackofficeImportGraph(root);
  const allowedPreconditionTypes = new Set([
    "data",
    "lifecycle",
    "ownership",
    "record",
    "session",
    "status",
  ]);
  const allowedEffectTypes = new Set([
    "audit",
    "data-refresh",
    "download",
    "mutation",
    "navigation",
    "revalidation",
    "session",
    "ui",
  ]);

  function validateSourceReference(reference, label) {
    if (!isSafeRelativePath(reference?.path, root)) {
      errors.push(`${label}: ongeldig bronpad.`);
      return false;
    }
    if (!platformSourceReader.has(reference.path)) {
      errors.push(
        `${label}: bron bestaat niet op platformBaseCommit: ${reference.path}.`,
      );
      return false;
    }
    if (reference.symbol === null) return true;
    if (!isNonEmptyString(reference.symbol)) {
      errors.push(`${label}: symbol moet null of een niet-lege naam zijn.`);
      return false;
    }
    let symbols = sourceCache.get(reference.path);
    if (!symbols) {
      symbols = collectTypescriptSymbolsFromSource(
        platformSourceReader.read(reference.path),
        reference.path,
      );
      sourceCache.set(reference.path, symbols);
    }
    if (!symbols.topLevelDeclared.has(reference.symbol)) {
      errors.push(
        `${label}: top-level symbol ${reference.symbol} bestaat niet in ${reference.path}.`,
      );
      return false;
    }
    return true;
  }

  function validateCapability(capability, prefix) {
    const label = capability?.id ?? `${prefix}.capability`;
    if (
      !isNonEmptyString(capability?.id) ||
      capabilityIds.has(capability.id) ||
      !capability.id.startsWith(prefix) ||
      !isNonEmptyString(capability.label) ||
      !Array.isArray(capability.sources) ||
      capability.sources.length === 0
    ) {
      errors.push(`${prefix}: ongeldige/dubbele capability ${capability?.id}.`);
    }
    capabilityIds.add(capability?.id);
    for (const source of capability?.sources ?? []) {
      validateSourceReference(source, label);
    }
  }

  function validateTypedRecords(records, actionLabel, field, allowedTypes) {
    if (!Array.isArray(records)) {
      errors.push(`${actionLabel}: ${field} moet een typed array zijn.`);
      return;
    }
    const ids = new Set();
    for (const record of records) {
      if (
        !isNonEmptyString(record?.id) ||
        ids.has(record.id) ||
        !allowedTypes.has(record?.type) ||
        !isNonEmptyString(record?.description)
      ) {
        errors.push(`${actionLabel}: ongeldige/dubbele ${field}-record.`);
      }
      if (
        record?.id === "render-condition" ||
        record?.description ===
          "De productie-UI rendert of activeert deze actie alleen wanneer de actuele record- en schermstatus dit toestaat."
      ) {
        errors.push(
          `${actionLabel}: generieke render-condition is geen brongetrouwe preconditie.`,
        );
      }
      ids.add(record?.id);
    }
  }

  function validateAction(
    action,
    prefix,
    requiredPageSource = null,
    routeReachableSymbols = null,
  ) {
    const actionLabel = action?.id ?? `${prefix}.action`;
    if (
      !isNonEmptyString(action?.id) ||
      actionIds.has(action.id) ||
      !action.id.startsWith(`${prefix}.`) ||
      !isNonEmptyString(action.label)
    ) {
      errors.push(`${prefix}: ongeldige/dubbele action ${action?.id}.`);
    }
    actionIds.add(action?.id);
    actionById.set(action?.id, action);
    if (!["primary", "secondary", "destructive"].includes(action?.kind)) {
      errors.push(`${actionLabel}: ongeldige action kind.`);
    }
    if (
      !isNonEmptyString(action?.placement) ||
      typeof action?.mutation !== "boolean" ||
      typeof action?.conditional !== "boolean" ||
      !Object.hasOwn(action ?? {}, "opensFlow") ||
      !Object.hasOwn(action ?? {}, "submitsFlow") ||
      ![null, "string"].includes(
        action?.opensFlow === null ? null : typeof action?.opensFlow,
      ) ||
      ![null, "string"].includes(
        action?.submitsFlow === null ? null : typeof action?.submitsFlow,
      ) ||
      (action?.opensFlow !== null && action?.submitsFlow !== null) ||
      typeof action?.confirmation?.required !== "boolean" ||
      !Object.hasOwn(action?.confirmation ?? {}, "pattern") ||
      !Object.hasOwn(action?.confirmation ?? {}, "consequence")
    ) {
      errors.push(`${actionLabel}: actiegedrag/flow is onvolledig.`);
    }
    if (
      action?.confirmation?.required === true &&
      (!isNonEmptyString(action.confirmation.pattern) ||
        !isNonEmptyString(action.confirmation.consequence))
    ) {
      errors.push(
        `${actionLabel}: verplichte confirmatie mist patroon/gevolg.`,
      );
    }
    if (
      action?.confirmation?.required === false &&
      (action.confirmation.pattern !== null ||
        action.confirmation.consequence !== null)
    ) {
      errors.push(
        `${actionLabel}: niet-verplichte confirmatie moet null/null zijn.`,
      );
    }
    validateTypedRecords(
      action?.preconditions,
      actionLabel,
      "preconditions",
      allowedPreconditionTypes,
    );
    validateTypedRecords(
      action?.effects,
      actionLabel,
      "effects",
      allowedEffectTypes,
    );
    if (
      action?.conditional !== (action?.preconditions?.length ?? 0) > 0 ||
      (action?.effects?.length ?? 0) === 0 ||
      (action?.opensFlow !== null && action?.mutation !== false) ||
      (action?.submitsFlow !== null && action?.mutation !== true)
    ) {
      errors.push(
        `${actionLabel}: conditional/effect/open-/submitsemantiek is inconsistent.`,
      );
    }
    for (const [field, availability] of [
      ["availability", action?.availability],
      ["uiAvailabilityObserved", action?.uiAvailabilityObserved],
      ["serverAuthorization", action?.serverAuthorization],
    ]) {
      validateAvailability(errors, `${actionLabel}.${field}`, availability);
    }
    if (
      JSON.stringify(action?.availability) !==
      JSON.stringify(action?.uiAvailabilityObserved)
    ) {
      errors.push(
        `${actionLabel}: availability moet de waargenomen UI-gate exact volgen.`,
      );
    }
    if (
      action?.knownMismatch !== false &&
      !isNonEmptyString(action?.knownMismatch)
    ) {
      errors.push(`${actionLabel}: knownMismatch moet false of uitleg zijn.`);
    }
    if (
      action?.mutation === true &&
      JSON.stringify(action?.uiAvailabilityObserved) !==
        JSON.stringify(action?.serverAuthorization) &&
      !isNonEmptyString(action?.knownMismatch)
    ) {
      errors.push(`${actionLabel}: UI/server-gateverschil mist knownMismatch.`);
    }
    if (!Array.isArray(action?.sources) || action.sources.length === 0) {
      errors.push(`${actionLabel}: actiebronnen ontbreken.`);
      return;
    }
    if (
      requiredPageSource &&
      !action.sources.some((source) => source.path === requiredPageSource)
    ) {
      errors.push(
        `${actionLabel}: exacte App Router-page ontbreekt in actiebronnen.`,
      );
    }
    let hasDeclaredSymbol = false;
    let hasExportedServerMutation = false;
    for (const source of action.sources) {
      const valid = validateSourceReference(source, actionLabel);
      if (valid && source.symbol !== null) {
        hasDeclaredSymbol = true;
        if (
          action.mutation &&
          source.path.includes("/app/actions/") &&
          sourceCache.get(source.path)?.topLevelExported.has(source.symbol) &&
          sourceCache.get(source.path)?.topLevelCallable.has(source.symbol) &&
          sourceCache
            .get(source.path)
            ?.topLevelAsyncCallable.has(source.symbol) &&
          sourceCache.get(source.path)?.hasUseServerDirective
        ) {
          hasExportedServerMutation = true;
        }
      }
    }
    if (!hasDeclaredSymbol) {
      errors.push(`${actionLabel}: geen AST-valide action-symbol gekoppeld.`);
    }
    if (requiredPageSource && routeReachableSymbols) {
      const nonPageCandidates = action.sources.filter(
        (source) =>
          source.symbol !== null && source.path !== requiredPageSource,
      );
      const candidates =
        nonPageCandidates.length > 0
          ? nonPageCandidates
          : action.sources.filter(
              (source) =>
                source.symbol !== null && source.path === requiredPageSource,
            );
      const reachableCandidates = candidates.filter((source) =>
        routeReachableSymbols.symbols.has(`${source.path}#${source.symbol}`),
      );
      if (candidates.length === 0 || reachableCandidates.length === 0) {
        errors.push(
          `${actionLabel}: geen gekoppeld action-/componentsymbool is via de statische importgraaf (entry-symbol/def-use) bereikbaar vanaf de exacte App Router-page.`,
        );
      } else if (action.mutation) {
        const serverActionSources = action.sources.filter(
          (source) =>
            source.symbol !== null && source.path.includes("/app/actions/"),
        );
        if (
          serverActionSources.length === 0 ||
          !serverActionSources.every((source) =>
            routeReachableSymbols.serverActionTargets.has(
              `${source.path}#${source.symbol}`,
            ),
          )
        ) {
          errors.push(
            `${actionLabel}: Server Action mist een concrete call/formAction-witness vanuit een bereikbare UI-handler of server-render lifecycle.`,
          );
        }
      } else {
        const needsNavigationWitness = action.effects?.some(
          (effect) => effect.type === "navigation",
        );
        const candidateWitness = reachableCandidates.some((source) => {
          const key = `${source.path}#${source.symbol}`;
          if (!routeReachableSymbols.uiSymbols.has(key)) return false;
          const witnesses = [
            ...(routeReachableSymbols.uiWitnesses.get(key) ?? []),
          ];
          const incomingUsages = routeReachableSymbols.edges
            .filter((edge) => edge.to === key)
            .flatMap((edge) => edge.usages);
          const invokedFromWitnessOwner = routeReachableSymbols.edges
            .filter((edge) => edge.to === key && edge.usages.includes("call"))
            .some((edge) =>
              [
                ...(routeReachableSymbols.uiWitnesses.get(edge.from) ?? []),
              ].some((witness) =>
                /^(event-handler|form-action|state-transition):/u.test(witness),
              ),
            );
          return needsNavigationWitness
            ? !source.path.includes("/app/actions/") &&
                (witnesses.some((witness) =>
                  witness.startsWith("navigation:"),
                ) ||
                  incomingUsages.includes("navigation-href"))
            : witnesses.some((witness) =>
                /^(event-handler|form-action|state-transition):/u.test(witness),
              ) ||
                routeReachableSymbols.interactionSymbols.has(key) ||
                invokedFromWitnessOwner;
        });
        const pageOnlyFallback = candidates.every(
          (source) => source.path === requiredPageSource,
        );
        const graphWitnesses = [
          ...routeReachableSymbols.uiWitnesses.values(),
        ].flatMap((witnessSet) => [...witnessSet]);
        const closureWitness = pageOnlyFallback
          ? needsNavigationWitness
            ? graphWitnesses.some((witness) =>
                witness.startsWith("navigation:"),
              ) ||
              routeReachableSymbols.edges.some((edge) =>
                edge.usages.includes("navigation-href"),
              )
            : graphWitnesses.some((witness) =>
                /^(event-handler|form-action|state-transition):/u.test(witness),
              )
          : false;
        const hasOwnerWitness = candidateWitness || closureWitness;
        if (!hasOwnerWitness) {
          errors.push(
            `${actionLabel}: bereikbaar symbool mist een concrete UI-handler-, navigatie- of state-witness in de action-owner declaratie.`,
          );
        }
      }
    }
    if (action.mutation && !hasExportedServerMutation) {
      errors.push(
        `${actionLabel}: exacte top-level async callable export in de echte use-server directive-proloog ontbreekt.`,
      );
    }
  }

  const requiredGlobalCapabilityIds = [
    "global.shell",
    "global.search",
    "global.notifications",
    "global.identity-and-tenant",
    "global.support",
  ];
  if (
    JSON.stringify(
      (inventory.globalCapabilities ?? []).map((item) => item.id),
    ) !== JSON.stringify(requiredGlobalCapabilityIds)
  ) {
    errors.push(
      "Globale shellcapabilities zijn niet exact of uitputtend vastgelegd.",
    );
  }
  for (const capability of inventory.globalCapabilities ?? []) {
    validateCapability(capability, "global.");
  }
  if (
    !Array.isArray(inventory.globalActions) ||
    JSON.stringify(inventory.globalActions.map((action) => action.id)) !==
      JSON.stringify(REQUIRED_GLOBAL_ACTION_IDS)
  ) {
    errors.push(
      "Globale shellacties ontbreken, staan niet in bronvolgorde of zijn niet exact.",
    );
  } else {
    for (const action of inventory.globalActions) {
      validateAction(action, "global");
    }
  }

  for (const record of inventoryRoutes) {
    const route = routeById.get(record.routeId);
    const label = record.routeId ?? record.route ?? "(onbekend)";
    if (
      !route ||
      seenRoutes.has(record.routeId) ||
      route.route !== record.route
    ) {
      errors.push(`${label}: ontbrekende/dubbele of afwijkende routemapping.`);
    }
    seenRoutes.add(record.routeId);
    validateAvailability(errors, `${label}.route`, record.routeAvailability);

    if (!Array.isArray(record.sources) || record.sources.length === 0) {
      errors.push(`${label}: routebronnen ontbreken.`);
    } else {
      for (const source of record.sources) {
        validateSourceReference(source, `${label}.sources`);
      }
      if (
        route &&
        !record.sources.some((source) => source.path === route.source)
      ) {
        errors.push(
          `${label}: primaire App Router-page ontbreekt in routebronnen.`,
        );
      }
    }

    const capabilities = record.existingProduction?.capabilities;
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      errors.push(`${label}: existingProduction capabilities ontbreken.`);
    } else {
      for (const capability of capabilities) {
        validateCapability(capability, `${record.routeId}.capability.`);
      }
    }

    const pageReference = record.sources?.find(
      (source) => source.path === route?.source && source.symbol !== null,
    );
    let routeReachableSymbols = null;
    if (pageReference) {
      const pageSymbols = sourceCache.get(pageReference.path);
      if (!pageSymbols?.topLevelExported.has(pageReference.symbol)) {
        errors.push(
          `${label}: startpunt van de brontrace is geen exact geëxporteerd App Router-pagesymbool.`,
        );
      }
      try {
        routeReachableSymbols = importGraph.reachableSymbolsFrom(
          pageReference.path,
          pageReference.symbol,
        );
      } catch (error) {
        errors.push(
          `${label}: statische importgraaf kon niet worden opgebouwd: ${error}`,
        );
      }
    } else if (route) {
      errors.push(
        `${label}: pagesymbool voor statische importgraaf ontbreekt.`,
      );
    }

    const actions = record.existingProduction?.actions;
    if (!Array.isArray(actions)) {
      errors.push(`${label}: existingProduction actions ontbreken.`);
      continue;
    }
    for (const action of actions) {
      validateAction(
        action,
        record.routeId,
        route?.source ?? null,
        routeReachableSymbols,
      );
    }
  }

  for (const routeId of routeById.keys()) {
    if (!seenRoutes.has(routeId)) {
      errors.push(`Production inventory mist route-ID ${routeId}.`);
    }
  }

  const allCapabilities = [
    ...(inventory.globalCapabilities ?? []),
    ...inventoryRoutes.flatMap(
      (record) => record.existingProduction?.capabilities ?? [],
    ),
  ];
  const allActions = [...actionById.values()];
  for (const control of REQUIRED_DIRECT_NAVIGATION_CONTROLS) {
    const action = actionById.get(control.actionId);
    const pageSource = action?.sources?.find((source) =>
      source.path.endsWith("/page.tsx"),
    );
    const source = pageSource ? platformSourceReader.read(pageSource.path) : "";
    if (
      !action ||
      action.label !== control.label ||
      action.mutation !== false ||
      !action.effects?.some(
        (effect) =>
          effect.type === "navigation" &&
          effect.description.includes(control.target),
      ) ||
      !source.includes(control.sourceHrefNeedle) ||
      !source.includes(control.label)
    ) {
      errors.push(
        `${control.actionId}: zichtbaar direct navigatiecontrol mist exacte bron-, label-, target- of actie-inventarisdekking.`,
      );
    }
  }
  const routeCapabilities = inventoryRoutes.flatMap(
    (record) => record.existingProduction?.capabilities ?? [],
  );
  const routeActions = inventoryRoutes.flatMap(
    (record) => record.existingProduction?.actions ?? [],
  );
  const actualProductionCounts = {
    routes: inventoryRoutes.length,
    routeCapabilities: routeCapabilities.length,
    globalCapabilities: (inventory.globalCapabilities ?? []).length,
    routeActions: routeActions.length,
    globalActions: (inventory.globalActions ?? []).length,
    mutations: allActions.filter((action) => action.mutation === true).length,
    sourceCoverageInventoried:
      inventory.sourceCoverage?.inventoried?.length ?? 0,
    sourceCoverageExcluded: inventory.sourceCoverage?.excluded?.length ?? 0,
    sourceCoverageTotal:
      (inventory.sourceCoverage?.inventoried?.length ?? 0) +
      (inventory.sourceCoverage?.excluded?.length ?? 0),
  };
  if (
    JSON.stringify(actualProductionCounts) !==
    JSON.stringify(EXPECTED_PRODUCTION_COUNTS)
  ) {
    errors.push(
      `Production inventory-counts wijken af van de vastgezette broninventaris: ${JSON.stringify(actualProductionCounts)}.`,
    );
  }
  if (
    allCapabilities.some((capability) =>
      /optimistische mutaties met undo en stale-validatie/iu.test(
        capability.label ?? "",
      ),
    )
  ) {
    errors.push(
      "Production inventory mag ontbrekende optimistic/stale/undo niet claimen.",
    );
  }
  for (const [id, expected] of new Map([
    ["tenant-customers-id.portal-invite", true],
    ["tenant-customers-id.note-delete", true],
  ])) {
    if (actionById.get(id)?.confirmation?.required !== expected) {
      errors.push(`${id}: bronbevestiging is onjuist vastgelegd.`);
    }
  }

  const sourceCoverage = inventory.sourceCoverage;
  const discoveredImports = discoverClientImportedServerActions(root);
  const discoveredByKey = new Map(
    discoveredImports.map((item) => [`${item.source}#${item.symbol}`, item]),
  );
  const inventoriedCoverage = sourceCoverage?.inventoried ?? [];
  const excludedCoverage = sourceCoverage?.excluded ?? [];
  if (
    JSON.stringify(sourceCoverage?.scanScope) !==
      JSON.stringify([
        "artifacts/backoffice/src/components/**/*.{ts,tsx}",
        "artifacts/backoffice/src/app/**/*.{ts,tsx}",
      ]) ||
    !isNonEmptyString(sourceCoverage?.rule) ||
    sourceCoverage?.counts?.uniqueClientImportedServerActions !==
      discoveredImports.length ||
    sourceCoverage?.counts?.inventoried !== inventoriedCoverage.length ||
    sourceCoverage?.counts?.excluded !== excludedCoverage.length ||
    sourceCoverage?.counts?.unaccounted !== 0 ||
    inventoriedCoverage.length + excludedCoverage.length !==
      discoveredImports.length
  ) {
    errors.push(
      "Client→Server Action sourceCoverage-identiteit/count is ongeldig.",
    );
  }
  const coverageKeys = new Set();
  for (const [classification, records] of [
    ["inventoried", inventoriedCoverage],
    ["excluded", excludedCoverage],
  ]) {
    for (const record of records) {
      const key = `${record?.source}#${record?.symbol}`;
      const discovered = discoveredByKey.get(key);
      if (!discovered || coverageKeys.has(key)) {
        errors.push(
          `sourceCoverage ${key}: ontbreekt in AST-scan of is dubbel.`,
        );
      }
      coverageKeys.add(key);
      if (
        JSON.stringify(record?.importedBy) !==
        JSON.stringify(discovered?.importedBy)
      ) {
        errors.push(`sourceCoverage ${key}: importedBy wijkt af van AST-scan.`);
      }
      if (classification === "inventoried") {
        if (
          !Array.isArray(record.actionIds) ||
          record.actionIds.length === 0 ||
          new Set(record.actionIds).size !== record.actionIds.length
        ) {
          errors.push(
            `sourceCoverage ${key}: actionIds ontbreken of zijn dubbel.`,
          );
        }
        for (const actionId of record.actionIds ?? []) {
          const action = actionById.get(actionId);
          if (
            !action ||
            !action.sources?.some(
              (source) =>
                source.path === record.source &&
                source.symbol === record.symbol,
            )
          ) {
            errors.push(
              `sourceCoverage ${key}: reverse actionlink ${actionId} is stale.`,
            );
          }
        }
      } else if (
        !isNonEmptyString(record.reason) ||
        Object.hasOwn(record, "actionIds")
      ) {
        errors.push(
          `sourceCoverage ${key}: exclusion mist reden of claimt actionIds.`,
        );
      }
    }
  }
  for (const key of discoveredByKey.keys()) {
    if (!coverageKeys.has(key)) {
      errors.push(
        `AST-gevonden client Server Action ontbreekt in sourceCoverage: ${key}.`,
      );
    }
  }
  const coverageByKey = new Map(
    inventoriedCoverage.map((record) => [
      `${record.source}#${record.symbol}`,
      record,
    ]),
  );
  for (const action of allActions) {
    for (const source of action.sources ?? []) {
      const key = `${source.path}#${source.symbol}`;
      if (
        discoveredByKey.has(key) &&
        !coverageByKey.get(key)?.actionIds?.includes(action.id)
      ) {
        errors.push(
          `${action.id}: ontbreekt in sourceCoverage reverse mapping ${key}.`,
        );
      }
    }
  }
}

export function validateMismatchTraceability(
  errors,
  manifest,
  inventory,
  acceptance,
  risks,
) {
  const allActions = [
    ...(inventory.globalActions ?? []).map((action) => ({
      ...action,
      routeId: "global",
    })),
    ...(inventory.routes ?? []).flatMap((route) =>
      (route.existingProduction?.actions ?? []).map((action) => ({
        ...action,
        routeId: route.routeId,
      })),
    ),
  ];
  const mismatchActions = allActions
    .filter((action) => isNonEmptyString(action.knownMismatch))
    .sort((left, right) => left.id.localeCompare(right.id));
  const requirementIds = new Set(
    (acceptance.requirements ?? []).map((item) => item.id),
  );
  const riskIds = new Set((risks.risks ?? []).map((item) => item.id));
  const records = manifest?.records ?? [];
  if (
    manifest?.schemaVersion !== 1 ||
    manifest?.name !== "Fieldflow Calm known-mismatch traceability" ||
    manifest?.source !==
      "production-inventory.json actions where knownMismatch is a string" ||
    !isNonEmptyString(manifest?.semantics) ||
    manifest?.recordCount !== mismatchActions.length ||
    records.length !== mismatchActions.length ||
    JSON.stringify(records.map((record) => record.actionId)) !==
      JSON.stringify(mismatchActions.map((action) => action.id))
  ) {
    errors.push(
      "Known-mismatchtraceability moet exact iedere en uitsluitend iedere mismatchactie in stabiele ID-volgorde dekken.",
    );
    return;
  }
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const action = mismatchActions[index];
    const expectedSources = [
      ...new Set((action.sources ?? []).map((source) => source.path)),
    ].sort();
    if (
      record.routeId !== action.routeId ||
      record.observedMismatch !== action.knownMismatch ||
      JSON.stringify(record.sourcePaths) !== JSON.stringify(expectedSources) ||
      !isNonEmptyString(record.requiredResolution) ||
      JSON.stringify(record.requiredEvidence) !==
        JSON.stringify([
          "source-gate-diff",
          "allowed-role-browser",
          "denied-role-browser",
          "forged-direct-call-integration",
        ]) ||
      !Array.isArray(record.requirementIds) ||
      !record.requirementIds.includes("FFC-ROUTE-001") ||
      !record.requirementIds.includes("FFC-SEC-001") ||
      record.requirementIds.some((id) => !requirementIds.has(id)) ||
      !Array.isArray(record.riskIds) ||
      record.riskIds.length === 0 ||
      record.riskIds.some((id) => !riskIds.has(id))
    ) {
      errors.push(
        `${action.id}: mismatchrecord mist exacte observatie, bron, geldige risico-/eislinks of het volledige positieve/negatieve bewijsprofiel.`,
      );
    }
  }
}

export function validateNavigationContract(
  errors,
  manifest,
  routes,
  productionInventory,
) {
  const routeRecords = routes.routes ?? [];
  const inventoryRouteIds = new Set(
    (productionInventory.routes ?? []).map((route) => route.routeId),
  );
  const requiredRouteFields = [
    "id",
    "surface",
    "route",
    "parentId",
    "navGroup",
    "navOrder",
    "navLabel",
    "icon",
    "matchPrefixes",
    "breadcrumb",
    "helpKey",
    "searchContext",
    "releaseVisibility",
  ];
  const expectedTenantGroups = [
    "daily-operations",
    "relations-locations",
    "people-assets",
    "quality-evidence",
    "finance",
    "contact-publication",
    "organization-management",
    "supporting",
  ];
  if (
    !hasExactKeys(manifest, [
      "schemaVersion",
      "name",
      "state",
      "authority",
      "generatedAgainst",
      "groupCount",
      "tenantGroupCount",
      "routeCount",
      "groups",
      "iconCatalog",
      "derivationPolicy",
      "orderingPolicy",
      "availabilityPolicy",
      "activeStatePolicy",
      "hierarchyPolicy",
      "routeResolutionPolicy",
      "fieldContract",
      "routes",
    ]) ||
    manifest.schemaVersion !== 1 ||
    manifest.name !== "Fieldflow Calm navigation contract" ||
    manifest.state !== "CONTRACTED" ||
    manifest.authority?.routeIdentity !== "manifests/routes.json" ||
    manifest.generatedAgainst?.routesManifest !==
      "docs/uiux/fieldflow-calm-handoff/manifests/routes.json" ||
    manifest.generatedAgainst?.routesManifestSha256 !== hashJson(routes) ||
    manifest.generatedAgainst?.routeCount !== routeRecords.length ||
    manifest.routeCount !== routeRecords.length ||
    manifest.groupCount !== 9 ||
    manifest.tenantGroupCount !== 8 ||
    JSON.stringify(manifest.fieldContract?.requiredRouteFields) !==
      JSON.stringify(requiredRouteFields)
  ) {
    errors.push(
      "Navigatiecontractidentiteit, routes-bronbinding of gesloten routevelden zijn ongeldig.",
    );
  }

  const groups = manifest.groups ?? [];
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const actualTenantGroups = groups
    .filter((group) => group.surface === "tenant")
    .sort((left, right) => left.order - right.order)
    .map((group) => group.id);
  if (
    groups.length !== 9 ||
    groupById.size !== groups.length ||
    JSON.stringify(actualTenantGroups) !==
      JSON.stringify(expectedTenantGroups) ||
    groupById.get("authentication")?.surface !== "auth" ||
    groups.some(
      (group) =>
        !isNonEmptyString(group.label) ||
        !Number.isInteger(group.order) ||
        group.order <= 0 ||
        !["primary-navigation", "support-navigation", "flow-only"].includes(
          group.placement,
        ),
    )
  ) {
    errors.push(
      "Navigatiegroepen, oppervlakken, plaatsing of vaste volgorde zijn ongeldig.",
    );
  }
  for (const consumer of [
    "desktopSidebar",
    "mobileNavigation",
    "commandPalette",
  ]) {
    if (
      JSON.stringify(manifest.orderingPolicy?.[consumer]?.renderGroups) !==
        JSON.stringify(expectedTenantGroups) ||
      JSON.stringify(
        manifest.orderingPolicy?.[consumer]?.includeReleaseVisibility,
      ) !== JSON.stringify(["primary", "support"])
    ) {
      errors.push(
        `Navigatieconsumer ${consumer} gebruikt niet exact dezelfde tenantgroep-/visibilityvolgorde.`,
      );
    }
  }
  if (
    manifest.availabilityPolicy?.source !==
      "docs/uiux/fieldflow-calm-handoff/manifests/production-inventory.json#routes[*].routeAvailability" ||
    JSON.stringify(manifest.availabilityPolicy?.dimensions) !==
      JSON.stringify([
        "allPermissions",
        "anyPermissions",
        "modules",
        "featureFlags",
        "planEntitlements",
        "tenantSettings",
        "anyOf",
      ]) ||
    manifest.hierarchyPolicy?.cyclesAllowed !== false ||
    JSON.stringify(
      manifest.hierarchyPolicy?.allowedParentlessHiddenRouteIds,
    ) !== JSON.stringify(["auth-login"]) ||
    manifest.routeResolutionPolicy?.dynamicSpecificityExample?.winner !==
      "/inventory/issues/[id]"
  ) {
    errors.push(
      "Navigatiecontract mist de exacte availabilityalgebra, hiërarchie- of dynamische routeprecedentie.",
    );
  }

  const sourceById = new Map(routeRecords.map((route) => [route.id, route]));
  const navById = new Map();
  const groupOrders = new Set();
  const allPrefixes = new Set();
  for (const record of manifest.routes ?? []) {
    const source = sourceById.get(record.id);
    const group = groupById.get(record.navGroup);
    const orderKey = `${record.navGroup}:${record.navOrder}`;
    const invalidPrefix = (record.matchPrefixes ?? []).some(
      (prefix) =>
        !/^\/(?:[^\[\]]*)$/u.test(prefix) ||
        allPrefixes.has(prefix) ||
        (allPrefixes.add(prefix), false),
    );
    if (
      !hasExactKeys(record, requiredRouteFields) ||
      navById.has(record.id) ||
      !source ||
      record.surface !== source.surface ||
      record.route !== source.route ||
      record.breadcrumb !== source.title ||
      !group ||
      group.surface !== record.surface ||
      !Number.isInteger(record.navOrder) ||
      record.navOrder <= 0 ||
      groupOrders.has(orderKey) ||
      !isNonEmptyString(record.navLabel) ||
      !Object.hasOwn(manifest.iconCatalog?.icons ?? {}, record.icon) ||
      !Array.isArray(record.matchPrefixes) ||
      invalidPrefix ||
      !["primary", "support", "hidden"].includes(record.releaseVisibility) ||
      !inventoryRouteIds.has(record.id)
    ) {
      errors.push(
        `${record.id}: navigatieroute is dubbel, onvolledig of niet exact brongebonden.`,
      );
    }
    groupOrders.add(orderKey);
    navById.set(record.id, record);
  }
  if (
    navById.size !== routeRecords.length ||
    routeRecords.some((route) => !navById.has(route.id))
  ) {
    errors.push(
      "Navigatiecontract moet alle 79 productieroutes exact één keer bevatten.",
    );
  }

  for (const record of navById.values()) {
    if (record.parentId !== null) {
      const parent = navById.get(record.parentId);
      if (!parent || parent.surface !== record.surface) {
        errors.push(
          `${record.id}: navigation parent ontbreekt of kruist een surface.`,
        );
      }
    } else if (
      record.releaseVisibility === "hidden" &&
      record.id !== "auth-login"
    ) {
      errors.push(`${record.id}: parentloze hidden route is niet toegestaan.`);
    }
    const seen = new Set();
    let cursor = record;
    let reachedVisible = record.releaseVisibility !== "hidden";
    while (cursor?.parentId !== null) {
      if (seen.has(cursor.id)) {
        errors.push(`${record.id}: parenthiërarchie bevat een cyclus.`);
        break;
      }
      seen.add(cursor.id);
      cursor = navById.get(cursor.parentId);
      if (!cursor) break;
      reachedVisible ||= cursor.releaseVisibility !== "hidden";
    }
    if (
      record.surface === "tenant" &&
      record.releaseVisibility === "hidden" &&
      !reachedVisible
    ) {
      errors.push(
        `${record.id}: hidden tenantroute bereikt geen zichtbare navigatieouder.`,
      );
    }
  }
  const visibilityCounts = Object.fromEntries(
    ["primary", "support", "hidden"].map((state) => [
      state,
      [...navById.values()].filter((route) => route.releaseVisibility === state)
        .length,
    ]),
  );
  if (
    visibilityCounts.primary !== 18 ||
    visibilityCounts.support !== 4 ||
    visibilityCounts.hidden !== 57 ||
    navById.get("tenant-profile")?.navLabel !== "Profiel" ||
    navById.get("tenant-help")?.navLabel !== "Help"
  ) {
    errors.push(
      "Navigatievisibility of zichtbare IA-labels wijken af van Fieldflow Calm.",
    );
  }
}

export function validateComponentApiContract(
  errors,
  { root, manifest, componentStates, routes },
) {
  if (
    !hasExactKeys(manifest, [
      "schemaVersion",
      "name",
      "state",
      "authority",
      "generatedAgainst",
      "componentCount",
      "sharedTypes",
      "components",
      "compileContract",
    ]) ||
    manifest.schemaVersion !== 1 ||
    manifest.name !== "Fieldflow Calm public component API contract" ||
    manifest.state !== "CONTRACTED" ||
    manifest.authority?.exportsMustMatchExactly !== true ||
    manifest.authority?.additionalPublicPropsAllowed !== false ||
    manifest.generatedAgainst?.componentStatesManifest !==
      "docs/uiux/fieldflow-calm-handoff/manifests/component-states.json" ||
    manifest.generatedAgainst?.componentStatesManifestSha256 !==
      hashJson(componentStates) ||
    manifest.componentCount !== 2
  ) {
    errors.push(
      "Publieke component-API-identiteit of component-statebronbinding is ongeldig.",
    );
  }
  const stateComponents = new Map(
    (componentStates.components ?? []).map((component) => [
      component.id,
      component,
    ]),
  );
  const expectedIds = ["entity-wizard", "error-summary"];
  if (
    JSON.stringify(manifest.generatedAgainst?.componentStateIds) !==
      JSON.stringify(expectedIds) ||
    JSON.stringify(
      (manifest.components ?? []).map((component) => component.id),
    ) !== JSON.stringify(expectedIds)
  ) {
    errors.push(
      "Publieke component-API moet exact EntityWizard en FormErrorSummary bezitten.",
    );
  }
  const sharedSymbols = collectTypescriptSymbolsFromSource(
    manifest.sharedTypes?.declarations ?? "",
    "form-error-summary.shared.d.ts",
  );
  const sharedExports = [
    "FormErrorSource",
    "FormErrorSummaryItem",
    "FormServerError",
    "FormErrorControlFocusReason",
    "FormErrorControlFocusRequest",
    "FormErrorFocusControl",
    "FormErrorFocusEvent",
  ];
  if (sharedExports.some((name) => !sharedSymbols.topLevelExported.has(name))) {
    errors.push(
      "Publieke component-API mist één of meer gedeelde fout-/focus-exports.",
    );
  }
  for (const component of manifest.components ?? []) {
    const symbols = collectTypescriptSymbolsFromSource(
      component.declaration ?? "",
      `${component.id}.d.tsx`,
    );
    const stateComponent = stateComponents.get(component.id);
    const propNames = (component.props ?? []).map((prop) => prop.name);
    const actualPublicExports = new Set(symbols.topLevelExported);
    if (component.id === "error-summary") {
      for (const name of sharedSymbols.topLevelExported) {
        actualPublicExports.add(name);
      }
    }
    if (
      !stateComponent ||
      sha256Text(component.declaration ?? "") !== component.declarationSha256 ||
      !component.exports.every((name) => actualPublicExports.has(name)) ||
      component.exports.length !== actualPublicExports.size ||
      !actualPublicExports.has(component.exportName) ||
      !actualPublicExports.has(component.propsTypeName) ||
      !component.modulePath.startsWith(
        "artifacts/backoffice/src/components/",
      ) ||
      !isSafeRelativePath(component.modulePath, root) ||
      new Set(propNames).size !== propNames.length ||
      propNames.some(
        (name) =>
          !isNonEmptyString(name) ||
          !(component.declaration ?? "").includes(`readonly ${name}`),
      ) ||
      Object.keys(component.stateMapping ?? {}).some(
        (state) => !(stateComponent.states ?? []).includes(state),
      ) ||
      !Array.isArray(component.invariants) ||
      component.invariants.length === 0
    ) {
      errors.push(
        `${component.id}: declaration, exports, props, states of ownership zijn ongeldig.`,
      );
    }
  }
  const errorSummary = (manifest.components ?? []).find(
    (component) => component.id === "error-summary",
  );
  if (
    errorSummary?.sharedDeclarationSha256 !==
    sha256Text(manifest.sharedTypes?.declarations ?? "")
  ) {
    errors.push(
      "FormErrorSummary is niet exact aan de gedeelde fout-/focus-typen gebonden.",
    );
  }

  const compile = manifest.compileContract;
  const routeIds = new Set((routes.routes ?? []).map((route) => route.id));
  const reader = createPlatformBaseSourceReader(root);
  const expectedFixtureKinds = [
    "assignment",
    "customer",
    "object",
    "personnel",
  ];
  if (
    compile?.fixtureCount !== 4 ||
    compile?.fixtureDirectory !==
      "artifacts/backoffice/src/components/tenant-ui/__contract__" ||
    compile?.compileCommand !==
      "pnpm --filter @workspace/backoffice run typecheck" ||
    JSON.stringify(
      (compile?.fixtures ?? []).map((fixture) => fixture.entityKind),
    ) !== JSON.stringify(expectedFixtureKinds)
  ) {
    errors.push(
      "Component-API compile-fixturecatalogus is niet exact of volledig.",
    );
  }
  for (const fixture of compile?.fixtures ?? []) {
    const [sourcePath, sourceSymbol, ...extra] = (
      fixture.existingFormSource ?? ""
    ).split("#");
    let sourceSymbols = null;
    if (reader.has(sourcePath)) {
      sourceSymbols = collectTypescriptSymbolsFromSource(
        reader.read(sourcePath),
        sourcePath,
      );
    }
    const fixtureSymbols = collectTypescriptSymbolsFromSource(
      fixture.source ?? "",
      fixture.targetPath ?? "fixture.tsx",
    );
    if (
      sha256Text(fixture.source ?? "") !== fixture.sourceSha256 ||
      fixture.compileCommand !== compile.compileCommand ||
      !routeIds.has(fixture.routeId) ||
      !isNonEmptyString(fixture.witnessRoute) ||
      !isSafeRelativePath(fixture.targetPath, root) ||
      !fixture.targetPath.startsWith(`${compile.fixtureDirectory}/`) ||
      !fixture.targetPath.endsWith(".contract.tsx") ||
      extra.length > 0 ||
      !reader.has(sourcePath) ||
      !isNonEmptyString(sourceSymbol) ||
      !sourceSymbols?.topLevelDeclared.has(sourceSymbol) ||
      !Array.isArray(fixture.requiredExports) ||
      fixture.requiredExports.length !== 2 ||
      fixture.requiredExports.some(
        (name) => !fixtureSymbols.topLevelExported.has(name),
      ) ||
      /@ts-(?:ignore|expect-error)|\bskipLibCheck\b|\bas\s+any\b|:\s*any\b/u.test(
        fixture.source ?? "",
      )
    ) {
      errors.push(
        `${fixture.id}: compile-fixture is niet byte-exact, strict of productiebrongebonden.`,
      );
    }
  }
}

export function validatePlanboardActionContract(
  errors,
  { packageRoot, manifest, acceptance, risks },
) {
  const actions = manifest.wireContract?.actions ?? [];
  const expectedActions = [
    "place",
    "move",
    "unassign",
    "release",
    "optimize-preview",
    "optimize-commit",
    "undo",
  ];
  const acceptanceIds = new Set(
    (acceptance.requirements ?? []).map((requirement) => requirement.id),
  );
  const riskIds = new Set((risks.risks ?? []).map((risk) => risk.id));
  if (
    !hasExactKeys(manifest, [
      "schemaVersion",
      "name",
      "contractVersion",
      "authority",
      "wireContract",
      "reasonCodes",
      "previewCommitSemantics",
      "realtimeContract",
      "interestSelectionContract",
      "receiptContract",
      "traceability",
    ]) ||
    manifest.schemaVersion !== 1 ||
    manifest.name !== "Fieldflow Calm planboard action contract" ||
    manifest.contractVersion !== "fieldflow-planboard-v1" ||
    manifest.authority?.route !== "/planning" ||
    manifest.authority?.module !== "planning" ||
    manifest.authority?.readPermission !== "planning:read" ||
    manifest.authority?.mutationPermission !== "planning:write" ||
    !hasExactKeys(manifest.authority?.authorizationConcurrency, [
      "epoch",
      "lockedRows",
      "finalCheck",
      "supportEvidence",
    ]) ||
    !manifest.authority?.authorizationConcurrency?.epoch?.includes(
      "FOR SHARE",
    ) ||
    !manifest.authority?.authorizationConcurrency?.finalCheck?.includes(
      "database clock time",
    ) ||
    !manifest.authority?.authorizationConcurrency?.supportEvidence?.includes(
      "Composite database foreign keys",
    ) ||
    !manifest.authority?.conditionalGates?.mapSuggestion?.includes(
      "MAP_GATE_DENIED",
    ) ||
    manifest.wireContract?.requestUnionDiscriminant !== "action" ||
    JSON.stringify(actions.map((action) => action.action)) !==
      JSON.stringify(expectedActions)
  ) {
    errors.push(
      "Planboard-actioncontractidentiteit, autorisatie of gesloten actionunion is ongeldig.",
    );
  }
  if (
    manifest.wireContract?.common?.contractVersion?.const !==
      manifest.contractVersion ||
    JSON.stringify(manifest.wireContract?.common?.required) !==
      JSON.stringify([
        "contractVersion",
        "action",
        "mutationId",
        "originClientId",
        "requestedAt",
        "inputMode",
        "versions",
      ]) ||
    JSON.stringify(manifest.wireContract?.common?.inputMode?.enum) !==
      JSON.stringify([
        "pointer",
        "keyboard",
        "touch",
        "menu",
        "map-suggestion",
      ]) ||
    JSON.stringify(manifest.wireContract?.common?.versions?.required) !==
      JSON.stringify([
        "planningRevision",
        "assignments",
        "staffing",
        "interestResponses",
      ]) ||
    !manifest.wireContract?.common?.versions?.rule?.includes(
      "interest-response",
    ) ||
    manifest.wireContract?.requestHash?.algorithm !== "sha256" ||
    !manifest.wireContract?.requestHash?.serialization?.startsWith(
      "RFC 8785",
    ) ||
    manifest.wireContract?.warningEvaluation?.sequence?.length !== 6
  ) {
    errors.push(
      "Planboard wirecontract mist versievector, requesthash of tweestapswarningprotocol.",
    );
  }
  const dependencyConcurrency =
    manifest.wireContract?.dependencyClosure?.dependencyConcurrency;
  if (
    JSON.stringify(dependencyConcurrency?.lockedClasses) !==
      JSON.stringify([
        "assignments",
        "staffing",
        "interest-responses",
        "personnel-active-state",
        "availability",
        "sickness-and-leave",
        "roles-and-sectors",
        "certificates-diplomas-and-knowledge",
        "regions",
        "required-slots-and-capacity",
        "route-cache-and-travel-policy",
      ]) ||
    JSON.stringify(dependencyConcurrency?.producerRegistry) !==
      JSON.stringify([
        "assignment-lifecycle-or-schedule",
        "staffing-transition",
        "interest-response-transition",
        "personnel-activation",
        "availability-change",
        "sickness-or-leave-change",
        "role-sector-qualification-change",
        "region-change",
        "required-slots-or-capacity-change",
        "route-cache-or-travel-policy-change",
        "planning-policy-change",
      ]) ||
    !dependencyConcurrency?.producerRule?.includes(
      "same tenant planning revision",
    ) ||
    !dependencyConcurrency?.unlockedDependencyRule?.includes(
      "fails closed as VERSION_STALE",
    )
  ) {
    errors.push(
      "Planboard dependencylocks, producerregistry of revisionafsluiting is onvolledig.",
    );
  }
  for (const action of actions) {
    if (
      action.permission !== "planning:write" ||
      !Array.isArray(action.payload?.required) ||
      action.payload.required.length === 0 ||
      !isNonEmptyString(action.desktopInteraction) ||
      !isNonEmptyString(action.mobileInteraction) ||
      !isNonEmptyString(action.commitSemantics) ||
      !Array.isArray(action.requirements) ||
      action.requirements.length === 0 ||
      action.requirements.some((id) => !acceptanceIds.has(id)) ||
      !Array.isArray(action.risks) ||
      action.risks.length === 0 ||
      action.risks.some((id) => !riskIds.has(id)) ||
      /mobileInteraction[^]*drag required/iu.test(JSON.stringify(action))
    ) {
      errors.push(
        `${action.action}: payload, desktop/mobile-interactie, eis- of risicobinding is ongeldig.`,
      );
    }
  }
  const resultVariants = manifest.wireContract?.resultUnion?.variants ?? [];
  const expectedResultRequired = new Map([
    [
      "committed",
      [
        "receiptId",
        "saved",
        "versions",
        "planningRevision",
        "affectedAssignmentIds",
        "affectedStaffingIds",
        "affectedInterestResponseIds",
        "undo",
        "undoState",
      ],
    ],
    [
      "preview",
      [
        "receiptId",
        "previewEvaluationHash",
        "proposalHash",
        "evaluationIssuedAt",
        "validUntil",
        "planningRevision",
        "beforeRecords",
        "afterRecords",
        "reasons",
        "previewState",
      ],
    ],
    [
      "warning-required",
      [
        "warningEvaluationHash",
        "evaluationIssuedAt",
        "validUntil",
        "reasons",
        "safeSnapshot",
      ],
    ],
    ["blocked", ["reasons", "safeSnapshot"]],
    ["conflict", ["code", "reasons", "currentVersions", "safeSnapshot"]],
    ["forbidden", ["code"]],
    ["invalid", ["code", "fieldErrors"]],
    ["failed", ["code", "retryable"]],
  ]);
  const resultUnion = manifest.wireContract?.resultUnion;
  if (
    !hasExactKeys(resultUnion, [
      "discriminant",
      "common",
      "commonTypes",
      "sharedTypes",
      "objectPolicy",
      "storageBoundary",
      "variants",
      "replayRule",
    ]) ||
    resultUnion?.discriminant !== "kind" ||
    JSON.stringify(resultUnion?.common) !==
      JSON.stringify([
        "contractVersion",
        "action",
        "mutationId",
        "requestHash",
        "serverTime",
        "replayed",
      ]) ||
    !hasExactKeys(resultUnion?.sharedTypes, [
      "PlanningReason",
      "PlanningDisplayAssignmentValue",
      "PlanningDisplayStaffingValue",
      "PlanningDisplayInterestResponseValue",
      "PlanningDisplayCurrentRecord",
      "PlanningDisplayRecordState",
      "ReceiptCurrentRecord",
      "ReceiptRecordState",
      "ReceiptVersionState",
      "PlanningSafeSnapshot",
      "PlanningUndoReceipt",
      "PlanningUndoState",
      "FieldErrors",
    ]) ||
    !resultUnion?.storageBoundary?.includes(
      "never contains serverTime, replayed, undoState, previewState",
    ) ||
    !resultUnion?.replayRule?.includes("recomputes only serverTime") ||
    JSON.stringify(resultVariants.map((variant) => variant.kind)) !==
      JSON.stringify([
        "committed",
        "preview",
        "warning-required",
        "blocked",
        "conflict",
        "forbidden",
        "invalid",
        "failed",
      ]) ||
    !resultVariants.every((variant) => {
      const required = expectedResultRequired.get(variant.kind);
      return (
        required &&
        JSON.stringify(variant.required) === JSON.stringify(required) &&
        hasExactKeys(variant.fieldTypes, required) &&
        Object.values(variant.fieldTypes).every(isNonEmptyString)
      );
    })
  ) {
    errors.push(
      "Planboardresultaatunion is niet gesloten en volledig getypeerd.",
    );
  }
  const resultByKind = new Map(
    resultVariants.map((variant) => [variant.kind, variant]),
  );
  if (
    JSON.stringify(resultByKind.get("committed")?.actions) !==
      JSON.stringify([
        "place",
        "move",
        "unassign",
        "release",
        "optimize-commit",
        "undo",
      ]) ||
    JSON.stringify(resultByKind.get("preview")?.actions) !==
      JSON.stringify(["optimize-preview"]) ||
    resultVariants
      .filter((variant) => !["committed", "preview"].includes(variant.kind))
      .some((variant) => variant.receiptWritten !== false)
  ) {
    errors.push(
      "Planboardresultaatunion koppelt actions of zero-write-resultaten onjuist.",
    );
  }
  for (const field of ["blocked", "warning"]) {
    const values = manifest.reasonCodes?.[field];
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      new Set(values).size !== values.length
    ) {
      errors.push(`Planboard reason-codecatalogus ${field} is leeg of dubbel.`);
    }
  }
  const globalRequirements = manifest.traceability?.globalRequirements ?? [];
  const globalRisks = manifest.traceability?.globalRisks ?? [];
  const requiredPlanboardTraceability = [
    ...Array.from(
      { length: 30 },
      (_, index) => `FFC-PB-${String(index + 1).padStart(3, "0")}`,
    ),
    "FFC-SEC-008",
  ];
  if (
    globalRequirements.length === 0 ||
    globalRequirements.some((id) => !acceptanceIds.has(id)) ||
    requiredPlanboardTraceability.some(
      (requirementId) => !globalRequirements.includes(requirementId),
    ) ||
    globalRisks.length === 0 ||
    globalRisks.some((id) => !riskIds.has(id))
  ) {
    errors.push(
      "Planboard globale acceptance-/risicotraceability is ongeldig.",
    );
  }
  const placeAction = actions.find((action) => action.action === "place");
  const interest = manifest.interestSelectionContract;
  if (
    !placeAction?.payload?.required?.includes("source") ||
    !placeAction?.requirements?.includes("FFC-PB-022") ||
    !hasExactKeys(interest, [
      "action",
      "sourceDiscriminant",
      "requiredSourceFields",
      "versionEntry",
      "lockOrder",
      "preconditions",
      "requiredSlotsRule",
      "filledSlotsRule",
      "scheduledTransitionRule",
      "statusNonRegressionRule",
      "atomicTransition",
      "idempotency",
      "undo",
    ]) ||
    interest?.action !== "place" ||
    interest?.sourceDiscriminant !== "payload.source.kind=interest" ||
    JSON.stringify(interest?.requiredSourceFields) !==
      JSON.stringify(["interestResponseId"]) ||
    interest?.requiredSlotsRule !==
      "max(explicit required personnel count, distinct required role count, 1)" ||
    interest?.filledSlotsRule !==
      "count distinct personnel with an active assigned staffing link" ||
    interest?.scheduledTransitionRule !==
      "Transition to scheduled only when scheduledDate, scheduledStart and scheduledEnd are all present and filledSlots is greater than or equal to requiredSlots." ||
    interest?.statusNonRegressionRule !==
      "Never regress active or final workflow statuses; preserve planned fields and keep actual lifecycle timestamps authoritative for effective display." ||
    !interest?.atomicTransition?.includes(
      "one receipt, audit record and outbox event",
    ) ||
    !interest?.undo?.includes("fresh monotone lifecycle version")
  ) {
    errors.push(
      "Planboard interestselectie is niet als gesloten, atomische en volledig undoable place-bron vastgelegd.",
    );
  }
  const realtime = manifest.realtimeContract;
  if (
    !hasExactKeys(realtime, [
      "channel",
      "eventType",
      "payload",
      "eventIdentity",
      "ownEventRule",
      "highWater",
      "idleVisibilitySloMs",
      "sloRule",
      "producerRule",
      "tenantIsolation",
    ]) ||
    realtime?.eventType !== "planning_refresh" ||
    JSON.stringify(realtime?.payload?.required) !==
      JSON.stringify([
        "tenantId",
        "actorUserId",
        "mutationId",
        "revision",
        "originClientId",
      ]) ||
    !realtime?.eventIdentity?.includes("tenantId+revision") ||
    !realtime?.eventIdentity?.includes("never a subscriber dedupe key") ||
    !hasExactKeys(realtime?.highWater, [
      "state",
      "coalescing",
      "defer",
      "reconnect",
    ]) ||
    !realtime?.highWater?.coalescing?.includes(
      "snapshot.planningRevision >= maxSeenRevision",
    ) ||
    !realtime?.highWater?.reconnect?.includes(
      "authoritative tenant revision",
    ) ||
    realtime?.idleVisibilitySloMs !== 2000 ||
    !realtime?.sloRule?.includes("hard budget") ||
    !realtime?.tenantIsolation?.includes("authenticated subscription tenant")
  ) {
    errors.push(
      "Planboard realtimecontract mist tenant+revision-dedupe, high-waterherstel of de harde 2000ms-SLO.",
    );
  }
  const receipt = manifest.receiptContract;
  const revision = receipt?.revisionCounter;
  const authorizationEpoch = receipt?.authorizationEpoch;
  const databaseBoundary = receipt?.databaseBoundary;
  const transactionAlgorithm = receipt?.transactionAlgorithm ?? [];
  if (
    !hasExactKeys(receipt, [
      "ddlAuthority",
      "schemaFile",
      "migrationFile",
      "table",
      "revisionCounter",
      "authorizationEpoch",
      "databaseBoundary",
      "key",
      "fullPayloadRetention",
      "undoWindow",
      "previewWindow",
      "requestAdmissionWindow",
      "receiptIdRule",
      "outboxDedupeKey",
      "access",
      "authorizationContext",
      "immutability",
      "snapshotRule",
      "undoVersionRule",
      "retention",
      "transactionAlgorithm",
    ]) ||
    receipt?.ddlAuthority !== "04-PLANBORD.md section 11.1" ||
    receipt?.schemaFile !== "lib/db/src/schema/planning-mutations.ts" ||
    receipt?.migrationFile !==
      "lib/db/migrations/20260904120000_planning_mutation_receipts.sql" ||
    receipt?.table !== "public.planning_mutation_receipts" ||
    JSON.stringify(receipt?.key) !==
      JSON.stringify(["tenant_id", "actor_user_id", "mutation_id"]) ||
    receipt?.fullPayloadRetention !== "180 days from committed_at" ||
    receipt?.undoWindow !== "10 minutes from committed_at" ||
    receipt?.previewWindow !== "5 minutes from evaluated_at" ||
    receipt?.requestAdmissionWindow !==
      "24 hours old through 60 seconds in the future, after exact-replay lookup" ||
    receipt?.receiptIdRule !==
      "The server generates receiptId before INSERT and uses the same UUID in planning_mutation_receipts.id and saved_result.receiptId; the database column has no default." ||
    receipt?.outboxDedupeKey !==
      "planning:<tenantId>:<actorUserId>:<mutationId>; never mutationId alone" ||
    !hasExactKeys(revision, [
      "table",
      "readFunction",
      "function",
      "initial",
      "commit",
      "preview",
      "retentionRule",
    ]) ||
    revision?.table !== "public.planning_revision_counters" ||
    revision?.readFunction !== "public.fieldgrid_get_planning_revision()" ||
    revision?.function !==
      "public.fieldgrid_advance_planning_revision(uuid,bigint)" ||
    revision?.initial !== "an absent tenant row means revision 0" ||
    !revision?.commit?.includes("expected+1 is success") ||
    revision?.preview !== "read without increment" ||
    !revision?.retentionRule?.includes("tenant revision never resets") ||
    !hasExactKeys(authorizationEpoch, [
      "table",
      "advanceFunction",
      "provisioning",
      "mutationLock",
      "missingRow",
      "producers",
      "producerRule",
    ]) ||
    authorizationEpoch?.table !== "public.planning_authorization_epochs" ||
    authorizationEpoch?.advanceFunction !==
      "public.fieldgrid_advance_planning_authorization_epoch(uuid)" ||
    !authorizationEpoch?.provisioning?.includes("AFTER INSERT trigger") ||
    !authorizationEpoch?.mutationLock?.includes("FOR SHARE") ||
    !authorizationEpoch?.producers?.includes(
      "support-grant-create-revoke-or-scope-change",
    ) ||
    !hasExactKeys(databaseBoundary, [
      "connection",
      "entry",
      "directPrivileges",
      "entrypoints",
      "privilegedFunctions",
    ]) ||
    !databaseBoundary?.connection?.includes("one PostgreSQL transaction") ||
    (databaseBoundary?.connection?.includes("second credential") &&
      !databaseBoundary.connection.includes("no second credential")) ||
    JSON.stringify(databaseBoundary?.entrypoints) !==
      JSON.stringify([
        "public.fieldgrid_get_planning_revision()",
        "public.fieldgrid_get_planning_receipt_by_mutation(uuid)",
        "public.fieldgrid_get_planning_receipt_child(uuid,text)",
        "public.fieldgrid_insert_planning_mutation_receipt(jsonb)",
        "public.fieldgrid_lock_planning_authorization_epoch()",
        "public.fieldgrid_advance_planning_revision(uuid,bigint)",
        "public.fieldgrid_advance_planning_authorization_epoch(uuid)",
        "public.fieldgrid_prune_planning_mutation_receipts(integer)",
      ]) ||
    !databaseBoundary?.directPrivileges?.includes(
      "FORCE RLS is intentionally absent",
    ) ||
    !databaseBoundary?.privilegedFunctions?.includes("SECURITY DEFINER") ||
    !receipt?.access?.includes("RLS is enabled with no access policies") ||
    !receipt?.access?.includes("no direct table DML") ||
    !receipt?.authorizationContext?.includes("authorization_context_hash") ||
    !receipt?.authorizationContext?.includes(
      "another binds that platform user",
    ) ||
    !receipt?.immutability?.includes("UPDATE is rejected") ||
    !receipt?.snapshotRule?.includes(
      "Server-only before_records/after_records use ReceiptRecordState",
    ) ||
    !receipt?.snapshotRule?.includes(
      "display_before_records/display_after_records",
    ) ||
    !receipt?.snapshotRule?.includes("exists=false tombstone") ||
    !receipt?.snapshotRule?.includes("fresh monotone lifecycleVersion") ||
    !hasExactKeys(receipt?.undoVersionRule, [
      "compare",
      "restore",
      "advance",
      "receipt",
    ]) ||
    !receipt?.undoVersionRule?.restore?.includes(
      "never copy historical lifecycleVersion or updatedAt",
    ) ||
    !receipt?.undoVersionRule?.advance?.includes(
      "lifecycleVersion=current+1",
    ) ||
    transactionAlgorithm.length !== 7 ||
    !transactionAlgorithm[0]?.includes("one transaction") ||
    !transactionAlgorithm[0]?.includes(
      "fieldgrid_lock_planning_authorization_epoch()",
    ) ||
    !transactionAlgorithm[2]?.includes("MUTATION_ID_REUSED") ||
    !transactionAlgorithm[3]?.includes("interest-response vector") ||
    !transactionAlgorithm[5]?.includes("fresh lifecycle versions") ||
    !transactionAlgorithm[6]?.includes(
      "planning:<tenantId>:<actorUserId>:<mutationId>",
    )
  ) {
    errors.push(
      "Planboard receipt-, replay-, RLS-, undo- of retentiecontract is onvolledig.",
    );
  }
  const planboardDoc = readFileSync(
    resolve(packageRoot, "04-PLANBORD.md"),
    "utf8",
  );
  for (const needle of [
    "CREATE TABLE public.planning_revision_counters",
    "CREATE FUNCTION public.fieldgrid_advance_planning_revision(",
    "CREATE TABLE public.planning_authorization_epochs",
    "CREATE FUNCTION public.fieldgrid_lock_planning_authorization_epoch()",
    "CREATE FUNCTION public.fieldgrid_advance_planning_authorization_epoch(",
    "CREATE TRIGGER tenants_initialize_planning_authorization_epoch",
    "CREATE TABLE public.planning_mutation_receipts",
    "id uuid PRIMARY KEY,",
    "before_records jsonb NOT NULL",
    "after_records jsonb NOT NULL",
    "display_before_records jsonb NOT NULL",
    "display_after_records jsonb NOT NULL",
    "saved_result jsonb NOT NULL",
    "ALTER TABLE public.planning_mutation_receipts ENABLE ROW LEVEL SECURITY",
    "CREATE FUNCTION public.fieldgrid_get_planning_revision()",
    "CREATE FUNCTION public.fieldgrid_get_planning_receipt_by_mutation(",
    "CREATE FUNCTION public.fieldgrid_get_planning_receipt_child(",
    "CREATE FUNCTION public.fieldgrid_insert_planning_mutation_receipt(",
    "CREATE TRIGGER planning_mutation_receipts_reject_update",
    "CREATE FUNCTION public.fieldgrid_prune_planning_mutation_receipts",
    "REVOKE ALL ON TABLE public.planning_mutation_receipts",
    "GRANT EXECUTE ON FUNCTION\n  public.fieldgrid_insert_planning_mutation_receipt(jsonb)\n  TO service_role;",
    "planning:<tenantId>:<actorUserId>:<mutationId>",
  ]) {
    if (!planboardDoc.includes(needle)) {
      errors.push(`04-PLANBORD.md mist uitvoerbare receipt-DDL: ${needle}.`);
    }
  }
  if (/id uuid PRIMARY KEY\s+DEFAULT/iu.test(planboardDoc)) {
    errors.push(
      "04-PLANBORD.md mag voor receiptId geen database-default definiëren.",
    );
  }
  if (
    /ALTER TABLE public\.planning_(?:mutation_receipts|revision_counters|authorization_epochs) FORCE ROW LEVEL SECURITY/iu.test(
      planboardDoc,
    ) ||
    /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[^;]*ON TABLE public\.planning_(?:mutation_receipts|revision_counters|authorization_epochs)[^;]*TO service_role/iu.test(
      planboardDoc,
    ) ||
    /fieldgrid_planning_(?:runtime|mutator)/u.test(planboardDoc)
  ) {
    errors.push(
      "04-PLANBORD.md bevat een verboden FORCE-RLS-aanname, directe service-role-DML of tweede planningcredential.",
    );
  }
}

const VERIFICATION_TUPLE_FIELDS = [
  "schemaVersion",
  "family",
  "requirementId",
  "matrixId",
  "subjectType",
  "routeId",
  "capabilityId",
  "actionId",
  "componentId",
  "componentCaseId",
  "surfaceId",
  "surfaceTargetId",
  "riskId",
  "role",
  "input",
  "state",
  "viewportWidth",
  "viewportHeight",
  "zoomPercent",
  "density",
  "motion",
  "contrastMode",
  "tenantBrand",
];
const VERIFICATION_SUBJECT_ORDER = [
  "route",
  "capability",
  "action",
  "component",
  "component-case",
  "surface",
  "surface-target",
  "risk",
];
const VERIFICATION_SHARED_MATRIX_ORDER = [
  "whitelabel-auth-full",
  "whitelabel-pdf-email-full",
  "whitelabel-tenant-switch-full",
];
const verificationMatrixValidationCache = new Map();

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function verificationAxisRows(suite) {
  const rows = [];
  const seen = new Set();
  const add = (row) => {
    const serialized = JSON.stringify(row);
    if (seen.has(serialized)) return;
    seen.add(serialized);
    rows.push(row);
  };
  add({ ...suite.defaultRow });
  for (let left = 0; left < suite.axisOrder.length; left += 1) {
    for (let right = left + 1; right < suite.axisOrder.length; right += 1) {
      const leftAxis = suite.axisOrder[left];
      const rightAxis = suite.axisOrder[right];
      for (const leftValue of suite.values[leftAxis] ?? []) {
        for (const rightValue of suite.values[rightAxis] ?? []) {
          add({
            ...suite.defaultRow,
            [leftAxis]: leftValue,
            [rightAxis]: rightValue,
          });
        }
      }
    }
  }
  return rows;
}

function verificationTuple({
  family,
  requirementId = null,
  matrixId = null,
  subjectType,
  subject = {},
  axes,
  profiles,
}) {
  const profile = profiles.get(axes.viewportZoomProfile);
  if (!profile)
    throw new Error(`Unknown viewport profile ${axes.viewportZoomProfile}`);
  return {
    schemaVersion: 1,
    family,
    requirementId,
    matrixId,
    subjectType,
    routeId: subject.routeId ?? null,
    capabilityId: subject.capabilityId ?? null,
    actionId: subject.actionId ?? null,
    componentId: subject.componentId ?? null,
    componentCaseId: subject.componentCaseId ?? null,
    surfaceId: subject.surfaceId ?? null,
    surfaceTargetId: subject.surfaceTargetId ?? null,
    riskId: subject.riskId ?? null,
    role: axes.role,
    input: axes.input,
    state: axes.state,
    viewportWidth: profile.width,
    viewportHeight: profile.height,
    zoomPercent: profile.zoomPercent,
    density: axes.density,
    motion: axes.motion,
    contrastMode: axes.contrastMode,
    tenantBrand: axes.tenantBrand,
  };
}

function verificationStreamAccumulator() {
  const idHash = createHash("sha256");
  const payloadHash = createHash("sha256");
  let count = 0;
  let firstTuple = null;
  let lastTuple = null;
  let firstTupleId = null;
  let lastTupleId = null;
  return {
    add(tuple) {
      const payload = JSON.stringify(tuple);
      const tupleId = `FFVT-${sha256Text(payload)}`;
      if (count === 0) {
        firstTuple = tuple;
        firstTupleId = tupleId;
      }
      lastTuple = tuple;
      lastTupleId = tupleId;
      count += 1;
      idHash.update(`${tupleId}\n`);
      payloadHash.update(`${payload}\n`);
    },
    finish() {
      return {
        tupleCount: count,
        tupleIdStreamSha256: idHash.digest("hex"),
        tuplePayloadStreamSha256: payloadHash.digest("hex"),
        firstTupleId,
        lastTupleId,
        firstTuple,
        lastTuple,
      };
    },
  };
}

function fullCartesianRows(axisOrder, axisValues, visit, index = 0, row = {}) {
  if (index === axisOrder.length) {
    visit(row);
    return;
  }
  const axis = axisOrder[index];
  for (const value of axisValues[axis] ?? []) {
    fullCartesianRows(axisOrder, axisValues, visit, index + 1, {
      ...row,
      [axis]: value,
    });
  }
}

function routeMatchesSelectors(route, selectors) {
  return selectors.some((selector) => referenceMatchesRoute(selector, route));
}

function expectedRouteSubjectSet(record, routes, inventory) {
  const selectedRoutes = (routes.routes ?? []).filter((route) =>
    routeMatchesSelectors(route.route, record.selectors ?? []),
  );
  const inventoryByRoute = new Map(
    (inventory.routes ?? []).map((route) => [route.routeId, route]),
  );
  const capabilityIds = selectedRoutes.flatMap(
    (route) =>
      inventoryByRoute
        .get(route.id)
        ?.existingProduction?.capabilities?.map((item) => item.id) ?? [],
  );
  const actionIds = selectedRoutes.flatMap(
    (route) =>
      inventoryByRoute
        .get(route.id)
        ?.existingProduction?.actions?.map((item) => item.id) ?? [],
  );
  if (record.includeGlobals === true) {
    capabilityIds.push(
      ...(inventory.globalCapabilities ?? []).map((item) => item.id),
    );
    actionIds.push(...(inventory.globalActions ?? []).map((item) => item.id));
  }
  return {
    routeIds: selectedRoutes.map((route) => route.id),
    capabilityIds,
    actionIds,
  };
}

function verificationSubjectOwners(inventory) {
  const capabilities = new Map();
  const actions = new Map();
  for (const route of inventory.routes ?? []) {
    for (const item of route.existingProduction?.capabilities ?? []) {
      capabilities.set(item.id, route.routeId);
    }
    for (const item of route.existingProduction?.actions ?? []) {
      actions.set(item.id, route.routeId);
    }
  }
  for (const item of inventory.globalCapabilities ?? []) {
    capabilities.set(item.id, null);
  }
  for (const item of inventory.globalActions ?? []) actions.set(item.id, null);
  return { capabilities, actions };
}

function requirementVerificationSubjects(binding, routeSet, owners) {
  const routeAnchor = routeSet.routeIds[0] ?? null;
  return [
    ...routeSet.routeIds.map((id) => ({
      subjectType: "route",
      subject: { routeId: id },
    })),
    ...routeSet.capabilityIds.map((id) => ({
      subjectType: "capability",
      subject: {
        routeId: owners.capabilities.get(id) ?? null,
        capabilityId: id,
      },
    })),
    ...routeSet.actionIds.map((id) => ({
      subjectType: "action",
      subject: { routeId: owners.actions.get(id) ?? null, actionId: id },
    })),
    ...(binding.localSubjects?.componentIds ?? []).map((id) => ({
      subjectType: "component",
      subject: { routeId: routeAnchor, componentId: id },
    })),
    ...(binding.localSubjects?.componentCaseIds ?? []).map((id) => ({
      subjectType: "component-case",
      subject: { routeId: routeAnchor, componentCaseId: id },
    })),
    ...(binding.localSubjects?.surfaceIds ?? []).map((id) => ({
      subjectType: "surface",
      subject: { routeId: routeAnchor, surfaceId: id },
    })),
    ...(binding.localSubjects?.surfaceTargetIds ?? []).map((id) => ({
      subjectType: "surface-target",
      subject: { routeId: routeAnchor, surfaceTargetId: id },
    })),
    ...(binding.localSubjects?.riskIds ?? []).map((id) => ({
      subjectType: "risk",
      subject: { routeId: routeAnchor, riskId: id },
    })),
  ];
}

function summarizeRequirementVerificationTuples(
  binding,
  routeSet,
  suite,
  owners,
  routes,
  profiles,
) {
  const accumulator = verificationStreamAccumulator();
  const subjects = requirementVerificationSubjects(binding, routeSet, owners);
  for (const { subjectType, subject } of subjects) {
    accumulator.add(
      verificationTuple({
        family: "subject-coverage",
        requirementId: binding.requirementId,
        subjectType,
        subject,
        axes: suite.defaultRow,
        profiles,
      }),
    );
  }
  const routeAnchor = routeSet.routeIds[0] ?? null;
  for (const axes of verificationAxisRows(suite)) {
    accumulator.add(
      verificationTuple({
        family: "axis-pair-closure",
        requirementId: binding.requirementId,
        subjectType: "route",
        subject: { routeId: routeAnchor },
        axes,
        profiles,
      }),
    );
  }
  let responsiveCount = 0;
  if (binding.requirementId === "FFC-RSP-001") {
    const responsiveProfiles = [320, 390, 430, 768, 1024, 1280, 1440, 1920].map(
      (width) =>
        [...profiles.values()].find(
          (profile) => profile.width === width && profile.zoomPercent === 100,
        ),
    );
    for (const route of routes.routes ?? []) {
      for (const profile of responsiveProfiles) {
        accumulator.add(
          verificationTuple({
            family: "responsive-route-width-full",
            requirementId: binding.requirementId,
            subjectType: "route",
            subject: { routeId: route.id },
            axes: {
              role: "owner-admin",
              input: "fine-pointer",
              state: "populated",
              viewportZoomProfile: profile?.id,
              density: "comfortable",
              motion: "no-preference",
              contrastMode: "normal",
              tenantBrand: "default",
            },
            profiles,
          }),
        );
        responsiveCount += 1;
      }
    }
  }
  return {
    summary: accumulator.finish(),
    familyCounts: {
      subjectCoverage: subjects.length,
      axisPairClosure: verificationAxisRows(suite).length,
      responsiveRouteWidthFull: responsiveCount,
    },
  };
}

function summarizeSharedVerificationTuples(matrix, profiles) {
  const accumulator = verificationStreamAccumulator();
  fullCartesianRows(matrix.axisOrder, matrix.axisValues, (axes) => {
    const binding = matrix.subjectBindings[axes.subjectBinding];
    accumulator.add(
      verificationTuple({
        family: "shared-full-cartesian",
        matrixId: matrix.id,
        subjectType: "surface-target",
        subject: {
          routeId: binding?.routeId ?? null,
          surfaceTargetId: binding?.surfaceTargetId ?? null,
        },
        axes,
        profiles,
      }),
    );
  });
  return accumulator.finish();
}

export function validateVerificationMatrix(
  errors,
  {
    packageRoot,
    manifest,
    schema,
    acceptance,
    routes,
    inventory,
    componentStates,
    risks,
    captureContract,
    surfaces,
  },
) {
  const cacheKey = sha256Text(
    JSON.stringify({
      manifest,
      acceptance,
      routes,
      inventory,
      componentStates,
      risks,
      captureContract,
      surfaces,
      schema,
    }),
  );
  if (verificationMatrixValidationCache.has(cacheKey)) {
    errors.push(...verificationMatrixValidationCache.get(cacheKey));
    return;
  }
  const localErrors = [];
  try {
    const expectedRequired = [
      "$schema",
      "schemaVersion",
      "name",
      "state",
      "generatedAgainst",
      "canonicalization",
      "axisCatalogs",
      "routeSubjectSets",
      "axisSuites",
      "requirementBindings",
      "sharedFullCartesianMatrices",
      "specialCoverageAssertions",
      "evidenceBindingContract",
      "totals",
      "verificationPlanRootSha256",
    ];
    if (
      manifest?.schemaVersion !== 1 ||
      manifest?.name !== "Fieldflow Calm deterministic verification matrix" ||
      manifest?.state !== "CONTRACTED" ||
      manifest?.$schema !== "../reference/verification-matrix.schema.json" ||
      schema?.$id !==
        "https://fieldgrid.invalid/contracts/fieldflow-calm/verification-matrix.schema.json" ||
      schema?.additionalProperties !== false ||
      JSON.stringify(schema?.required) !== JSON.stringify(expectedRequired) ||
      JSON.stringify(Object.keys(manifest)) !== JSON.stringify(expectedRequired)
    ) {
      localErrors.push(
        "Verificatiematrix of het gesloten JSON-schema heeft een ongeldige identiteit/vorm.",
      );
    }
    const generatedInputs = {
      acceptance: lifecycleIndependentContract(acceptance, "requirements"),
      routes,
      productionInventory: inventory,
      componentStates,
      risks: lifecycleIndependentContract(risks, "risks"),
      captureContract: lifecycleIndependentCaptureContract(captureContract),
      whitelabelSurfaces: surfaces,
    };
    const expectedPaths = {
      acceptance: "manifests/acceptance.json",
      routes: "manifests/routes.json",
      productionInventory: "manifests/production-inventory.json",
      componentStates: "manifests/component-states.json",
      risks: "manifests/risks.json",
      captureContract: "evidence/visual/capture-contract.json",
      whitelabelSurfaces: "manifests/surfaces.json",
    };
    for (const [key, value] of Object.entries(generatedInputs)) {
      if (
        manifest.generatedAgainst?.[key]?.path !== expectedPaths[key] ||
        manifest.generatedAgainst?.[key]?.semanticSha256 !== hashJson(value)
      ) {
        localErrors.push(
          `Verificatiematrix generatedAgainst wijkt af voor ${key}.`,
        );
      }
    }
    if (
      JSON.stringify(manifest.canonicalization?.tupleFieldOrder) !==
        JSON.stringify(VERIFICATION_TUPLE_FIELDS) ||
      JSON.stringify(manifest.canonicalization?.subjectGeneratorOrder) !==
        JSON.stringify(VERIFICATION_SUBJECT_ORDER) ||
      JSON.stringify(manifest.canonicalization?.sharedMatrixGeneratorOrder) !==
        JSON.stringify(VERIFICATION_SHARED_MATRIX_ORDER)
    ) {
      localErrors.push(
        "Verificatiematrixcanonicalisatie of generatorvolgorde wijkt af.",
      );
    }
    const profiles = new Map(
      (manifest.axisCatalogs?.viewportZoomProfiles ?? []).map((profile) => [
        profile.id,
        profile,
      ]),
    );
    const expectedProfileTriples = [
      [320, 568, 100],
      [390, 844, 100],
      [430, 932, 100],
      [768, 1024, 100],
      [1024, 768, 100],
      [1280, 800, 100],
      [1440, 1000, 100],
      [1920, 1080, 100],
      [1024, 768, 200],
    ];
    if (
      JSON.stringify(
        [...profiles.values()].map((profile) => [
          profile.width,
          profile.height,
          profile.zoomPercent,
        ]),
      ) !== JSON.stringify(expectedProfileTriples)
    ) {
      localErrors.push(
        "Verificatiematrix mist de exacte acht viewports plus 200%-zoomfixture.",
      );
    }

    const routeSets = new Map();
    for (const routeSet of manifest.routeSubjectSets ?? []) {
      const expected = expectedRouteSubjectSet(routeSet, routes, inventory);
      if (
        routeSets.has(routeSet.id) ||
        routeSet.selectorSemantics !== "exact-or-terminal-prefix-star-v1" ||
        JSON.stringify(routeSet.routeIds) !==
          JSON.stringify(expected.routeIds) ||
        JSON.stringify(routeSet.capabilityIds) !==
          JSON.stringify(expected.capabilityIds) ||
        JSON.stringify(routeSet.actionIds) !==
          JSON.stringify(expected.actionIds)
      ) {
        localErrors.push(
          `${routeSet.id}: routesubjectset is dubbel of niet exact uit de broninventaris afgeleid.`,
        );
      }
      routeSets.set(routeSet.id, routeSet);
    }

    const axisSuites = new Map();
    for (const suite of manifest.axisSuites ?? []) {
      const rows = verificationAxisRows(suite);
      const rowIdHash = createHash("sha256");
      const rowPayloadHash = createHash("sha256");
      const ids = [];
      for (const row of rows) {
        const payload = JSON.stringify(row);
        const id = `FFVA-${sha256Text(payload)}`;
        ids.push(id);
        rowIdHash.update(`${id}\n`);
        rowPayloadHash.update(`${payload}\n`);
      }
      const validAxes = suite.axisOrder.every(
        (axis) =>
          Array.isArray(suite.values?.[axis]) &&
          suite.values[axis].length > 0 &&
          suite.values[axis].includes(suite.defaultRow?.[axis]),
      );
      if (
        axisSuites.has(suite.id) ||
        suite.algorithm !== "lexicographic-default-filled-pair-closure-v1" ||
        !validAxes ||
        suite.rowCount !== rows.length ||
        suite.rowIdStreamSha256 !== rowIdHash.digest("hex") ||
        suite.rowPayloadStreamSha256 !== rowPayloadHash.digest("hex") ||
        suite.firstRowId !== ids[0] ||
        suite.lastRowId !== ids.at(-1)
      ) {
        localErrors.push(
          `${suite.id}: pairwise assuite/count/hash is ongeldig.`,
        );
      }
      axisSuites.set(suite.id, suite);
    }

    const componentIds = new Set(
      (componentStates.components ?? []).map((component) => component.id),
    );
    const componentCaseIds = new Set(
      (componentStates.components ?? []).flatMap((component) =>
        (component.captureCases ?? []).map(
          (captureCase) => `${component.id}/${captureCase.id}`,
        ),
      ),
    );
    const surfaceIds = new Set(
      (surfaces.surfaces ?? []).map((surface) => surface.id),
    );
    const surfaceTargetIds = new Set(
      (surfaces.surfaces ?? []).flatMap((surface) =>
        (surface.evidenceTargets ?? []).map(
          (target) => `${surface.id}/${target}`,
        ),
      ),
    );
    const riskIds = new Set((risks.risks ?? []).map((risk) => risk.id));
    const owners = verificationSubjectOwners(inventory);
    const requirementBindings = manifest.requirementBindings ?? [];
    const requirements = acceptance.requirements ?? [];
    let requirementTupleTotal = 0;
    for (let index = 0; index < requirements.length; index += 1) {
      const requirement = requirements[index];
      const binding = requirementBindings[index];
      const routeSet = routeSets.get(binding?.routeSubjectSetId);
      const suite = axisSuites.get(binding?.axisSuiteId);
      const local = binding?.localSubjects;
      if (
        binding?.requirementId !== requirement.id ||
        binding?.priority !== requirement.priority ||
        binding?.category !== requirement.category ||
        binding?.verification !== requirement.verification ||
        binding?.workPackage !== requirement.workPackage ||
        !routeSet ||
        !suite ||
        JSON.stringify(routeSet.selectors) !==
          JSON.stringify(requirement.routes) ||
        !local ||
        (local.componentIds ?? []).some((id) => !componentIds.has(id)) ||
        (local.componentCaseIds ?? []).some(
          (id) => !componentCaseIds.has(id),
        ) ||
        (local.surfaceIds ?? []).some((id) => !surfaceIds.has(id)) ||
        (local.surfaceTargetIds ?? []).some(
          (id) => !surfaceTargetIds.has(id),
        ) ||
        (local.riskIds ?? []).some((id) => !riskIds.has(id))
      ) {
        localErrors.push(
          `${requirement.id}: requirementbinding of lokale subjects zijn ongeldig.`,
        );
        continue;
      }
      const recomputed = summarizeRequirementVerificationTuples(
        binding,
        routeSet,
        suite,
        owners,
        routes,
        profiles,
      );
      const expectedSummary = {
        tupleCount: binding.tupleCount,
        tupleIdStreamSha256: binding.tupleIdStreamSha256,
        tuplePayloadStreamSha256: binding.tuplePayloadStreamSha256,
        firstTupleId: binding.firstTupleId,
        lastTupleId: binding.lastTupleId,
        firstTuple: binding.firstTuple,
        lastTuple: binding.lastTuple,
      };
      if (
        JSON.stringify(recomputed.familyCounts) !==
          JSON.stringify(binding.familyCounts) ||
        JSON.stringify(recomputed.summary) !== JSON.stringify(expectedSummary)
      ) {
        localErrors.push(
          `${requirement.id}: tuplecount, familycount of JSONL-streamhash wijkt af.`,
        );
      }
      requirementTupleTotal += recomputed.summary.tupleCount;
    }
    if (requirementBindings.length !== requirements.length) {
      localErrors.push(
        "Verificatiematrix moet exact 145 requirementbindings in acceptatievolgorde bevatten.",
      );
    }

    const sharedMatrices = manifest.sharedFullCartesianMatrices ?? [];
    let sharedTupleTotal = 0;
    for (let index = 0; index < sharedMatrices.length; index += 1) {
      const matrix = sharedMatrices[index];
      if (
        matrix.id !== VERIFICATION_SHARED_MATRIX_ORDER[index] ||
        matrix.algorithm !== "lexicographic-full-cartesian-v1" ||
        !matrix.axisOrder.every(
          (axis) =>
            Array.isArray(matrix.axisValues?.[axis]) &&
            matrix.axisValues[axis].length > 0,
        ) ||
        matrix.requirementIds.some(
          (id) =>
            !requirementBindings.some(
              (binding) =>
                binding.requirementId === id &&
                binding.sharedMatrixIds.includes(matrix.id),
            ),
        ) ||
        Object.values(matrix.subjectBindings ?? {}).some(
          (binding) =>
            !surfaceTargetIds.has(binding.surfaceTargetId) ||
            (binding.routeId !== null &&
              !(routes.routes ?? []).some(
                (route) => route.id === binding.routeId,
              )),
        )
      ) {
        localErrors.push(
          `${matrix.id}: gedeelde whitelabelmatrixbinding is ongeldig.`,
        );
      }
      const summary = summarizeSharedVerificationTuples(matrix, profiles);
      const expectedSummary = {
        tupleCount: matrix.tupleCount,
        tupleIdStreamSha256: matrix.tupleIdStreamSha256,
        tuplePayloadStreamSha256: matrix.tuplePayloadStreamSha256,
        firstTupleId: matrix.firstTupleId,
        lastTupleId: matrix.lastTupleId,
        firstTuple: matrix.firstTuple,
        lastTuple: matrix.lastTuple,
      };
      if (JSON.stringify(summary) !== JSON.stringify(expectedSummary)) {
        localErrors.push(
          `${matrix.id}: full-Cartesian count of JSONL-streamhash wijkt af.`,
        );
      }
      sharedTupleTotal += summary.tupleCount;
    }
    for (const binding of requirementBindings) {
      if (
        (binding.sharedMatrixIds ?? []).some(
          (id) =>
            !sharedMatrices.some(
              (matrix) =>
                matrix.id === id &&
                matrix.requirementIds.includes(binding.requirementId),
            ),
        )
      ) {
        localErrors.push(
          `${binding.requirementId}: shared-matrixreversebinding ontbreekt.`,
        );
      }
    }

    const planHash = createHash("sha256");
    for (const binding of requirementBindings) {
      planHash.update(
        `${JSON.stringify({
          requirementId: binding.requirementId,
          tupleCount: binding.tupleCount,
          tupleIdStreamSha256: binding.tupleIdStreamSha256,
          tuplePayloadStreamSha256: binding.tuplePayloadStreamSha256,
          sharedMatrixIds: binding.sharedMatrixIds,
        })}\n`,
      );
    }
    for (const matrix of sharedMatrices) {
      planHash.update(
        `${JSON.stringify({
          matrixId: matrix.id,
          tupleCount: matrix.tupleCount,
          tupleIdStreamSha256: matrix.tupleIdStreamSha256,
          tuplePayloadStreamSha256: matrix.tuplePayloadStreamSha256,
          requirementIds: matrix.requirementIds,
        })}\n`,
      );
    }
    const totals = manifest.totals;
    if (
      totals?.requirements !== requirements.length ||
      totals?.routeSubjectSets !== routeSets.size ||
      totals?.axisSuites !== axisSuites.size ||
      totals?.requirementTuples !== requirementTupleTotal ||
      totals?.sharedFullCartesianMatrices !== sharedMatrices.length ||
      totals?.sharedFullCartesianTuples !== sharedTupleTotal ||
      totals?.allPlannedTuples !== requirementTupleTotal + sharedTupleTotal ||
      manifest.verificationPlanRootSha256 !== planHash.digest("hex") ||
      manifest.specialCoverageAssertions?.routeParity?.actual?.routes !== 79 ||
      manifest.specialCoverageAssertions?.routeParity?.actual?.capabilities !==
        282 ||
      manifest.specialCoverageAssertions?.routeParity?.actual?.actions !==
        428 ||
      manifest.specialCoverageAssertions?.responsive?.actualTupleCount !==
        632 ||
      JSON.stringify(
        manifest.specialCoverageAssertions?.whitelabel?.requiredMatrixIds,
      ) !== JSON.stringify(VERIFICATION_SHARED_MATRIX_ORDER)
    ) {
      localErrors.push(
        "Verificatiematrix totalen, speciale volledige dekking of plan-root zijn ongeldig.",
      );
    }
  } catch (error) {
    localErrors.push(
      `Verificatiematrix kon niet fail-closed worden herleid: ${error}`,
    );
  }
  verificationMatrixValidationCache.set(cacheKey, localErrors);
  errors.push(...localErrors);
}

export function validateRiskEvidence(
  item,
  { root = ROOT, verifyFiles = false } = {},
) {
  const errors = [];
  if (item.state === "OPEN") {
    if (
      item.evidence &&
      typeof item.evidence === "object" &&
      Object.keys(item.evidence).length > 0
    ) {
      errors.push(`${item.id}: OPEN mag geen sluitbewijs claimen.`);
    }
    return errors;
  }
  const evidence = item.evidence;
  if (!hasExactKeys(evidence, ["commit", "index"])) {
    errors.push(
      `${item.id}: risico-evidence moet exact commit en index bevatten.`,
    );
  }
  for (const legacyField of [
    "codePaths",
    "tests",
    "runtimeEvidence",
    "stagingEvidence",
    "reviewers",
    "residualRisk",
    "closureDecision",
  ]) {
    if (Object.hasOwn(evidence ?? {}, legacyField)) {
      errors.push(
        `${item.id}: legacy evidence.${legacyField} is verboden; gebruik de gehashte index.`,
      );
    }
  }
  if (!/^[0-9a-f]{40}$/u.test(evidence?.commit ?? "")) {
    errors.push(
      `${item.id}: evidence.commit mist een exacte implementatie-SHA.`,
    );
  } else if (verifyFiles && !gitCommitExists(root, evidence.commit)) {
    errors.push(`${item.id}: evidence.commit bestaat niet in de repository.`);
  }
  const index = loadEvidenceIndex(errors, item, root, verifyFiles);
  if (index) {
    errors.push(
      ...validateEvidenceIndexPayload(item, index, { root, verifyFiles }),
    );
  }
  if (
    item.state === "CLOSED" &&
    (!isNonEmptyString(index?.residualRisk) ||
      !isNonEmptyString(index?.closureDecision))
  ) {
    errors.push(
      `${item.id}: residualRisk/closureDecision ontbreekt voor CLOSED.`,
    );
  }
  return errors;
}

export function validateRisks(errors, packageRoot, manifest, root) {
  const expectedStates = [
    "OPEN",
    "MITIGATED",
    "VERIFIED_LOCAL",
    "VERIFIED_STAGING",
    "CLOSED",
  ];
  const risks = manifest.risks ?? [];
  if (
    hashJson(lifecycleIndependentContract(manifest, "risks")) !==
    RISKS_CONTRACT_SHA256
  ) {
    errors.push(
      "Risicocontract-inhoudsdigest wijkt af; alleen state en evidence mogen zonder contractherziening veranderen.",
    );
  }
  if (
    manifest.schemaVersion !== 1 ||
    JSON.stringify(manifest.stateModel) !== JSON.stringify(expectedStates) ||
    manifest.riskCount !== 50 ||
    risks.length !== 50
  ) {
    errors.push(
      "Risicomanifest moet exact 50 items en de canonieke lifecycle bevatten.",
    );
  }
  if (
    manifest.evidenceContract?.schemaVersion !== 3 ||
    manifest.evidenceContract?.sharedIndexContract !==
      "acceptance.json#evidenceContract.indexSchema" ||
    JSON.stringify(manifest.evidenceContract?.claimFields) !==
      JSON.stringify(["commit", "index"]) ||
    JSON.stringify(manifest.evidenceContract?.stateRequirements) !==
      JSON.stringify({
        MITIGATED: [
          "commit",
          "index",
          "codePaths+blobSha256",
          "typed risk-bound commands passed with exitCode 0",
          "machine-readable runtime report+sha256+zero failures",
          "verified Git ancestry and successful GitHub Actions provenance",
        ],
        VERIFIED_LOCAL: [
          "one live independent exact-HEAD APPROVED GitHub review",
        ],
        VERIFIED_STAGING: [
          "machine-readable staging report+sha256+zero failures",
          "live functional-security exact-HEAD reviewer",
          "live visual-a11y exact-HEAD reviewer",
        ],
        CLOSED: ["residualRisk in index", "closureDecision in index"],
      })
  ) {
    errors.push("Risico-evidencecontract wijkt af van de gehashte index.");
  }
  const tableItems = new Map();
  const register = readFileSync(
    resolve(packageRoot, "10-RISICOREGISTER.md"),
    "utf8",
  );
  for (const line of register.split("\n")) {
    if (!/^\|\s*R-\d{3}\s*\|/u.test(line)) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    tableItems.set(cells[1], cells[2]);
  }
  if (tableItems.size !== 50) {
    errors.push(
      "10-RISICOREGISTER.md moet exact 50 canonieke risicorijen bevatten.",
    );
  }
  const seen = new Set();
  for (let index = 0; index < risks.length; index += 1) {
    const item = risks[index];
    const expectedId = `R-${String(index + 1).padStart(3, "0")}`;
    if (item.id !== expectedId || seen.has(item.id)) {
      errors.push(`Risicomanifest mist volgorde/uniciteit bij ${item.id}.`);
    }
    seen.add(item.id);
    if (
      !["P0", "P1"].includes(item.priority) ||
      tableItems.get(item.id) !== item.priority
    ) {
      errors.push(
        `${item.id}: prioriteit wijkt af van het canonieke register.`,
      );
    }
    if (!REQUIRED_WORK_PACKAGES.includes(item.ownerWorkPackage)) {
      errors.push(`${item.id}: ongeldig ownerWorkPackage.`);
    }
    if (!expectedStates.includes(item.state)) {
      errors.push(`${item.id}: ongeldige risicostate ${item.state}.`);
    }
    for (const field of [
      "commit",
      "index",
      "codePaths",
      "tests",
      "runtimeEvidence",
      "stagingEvidence",
      "reviewers",
      "residualRisk",
      "closureDecision",
    ]) {
      if (Object.hasOwn(item, field)) {
        errors.push(`${item.id}: ${field} hoort genest onder evidence/index.`);
      }
    }
    errors.push(...validateRiskEvidence(item, { root, verifyFiles: true }));
  }
  const p0 = risks.filter((item) => item.priority === "P0").length;
  const p1 = risks.filter((item) => item.priority === "P1").length;
  if (p0 !== 35 || p1 !== 15) {
    errors.push(
      `Risicoprioriteiten moeten exact 35 P0 en 15 P1 zijn, niet ${p0}/${p1}.`,
    );
  }
}

export function validateSurfaces(errors, root, manifest, acceptance) {
  const expectedScopes = new Map([
    ["tenant-backoffice", "included"],
    ["tenant-auth", "included"],
    ["customer-portal-web", "included"],
    ["personnel-portal-web", "included"],
    ["customer-pwa-install", "included"],
    ["personnel-pwa-install", "included"],
    ["email", "included"],
    ["pdf-and-exports", "included"],
    ["public-website", "separate-contract"],
    ["personnel-capacitor-runtime-chrome", "included"],
    ["native-android-build-assets", "excluded"],
  ]);
  const surfaces = manifest.surfaces ?? [];
  if (
    manifest.schemaVersion !== 1 ||
    manifest.surfaceCount !== expectedScopes.size ||
    surfaces.length !== expectedScopes.size ||
    manifest.sourceAuthority?.themeResolver !==
      "lib/db/src/tenant-branding.ts#getTenantBranding"
  ) {
    errors.push(
      "Whitelabelsurface-manifest heeft geen canonieke identiteit/count.",
    );
  }
  if (
    createHash("sha256").update(JSON.stringify(surfaces)).digest("hex") !==
    SURFACES_CONTENT_SHA256
  ) {
    errors.push(
      "Whitelabelsurface-manifest wijkt af van de uitputtende inhoudsdigest.",
    );
  }
  const acceptanceIds = new Set(
    (acceptance.requirements ?? []).map((item) => item.id),
  );
  const seen = new Set();
  for (const surface of surfaces) {
    const expectedScope = expectedScopes.get(surface.id);
    if (
      !expectedScope ||
      seen.has(surface.id) ||
      surface.scope !== expectedScope
    ) {
      errors.push(
        `${surface.id}: onbekende/dubbele surface of onjuiste scope.`,
      );
    }
    seen.add(surface.id);
    if (
      !isNonEmptyString(surface.themeSource) ||
      !isNonEmptyString(surface.inheritance)
    ) {
      errors.push(`${surface.id}: themabron/inheritance ontbreekt.`);
    }
    if (
      !Array.isArray(surface.sourcePaths) ||
      surface.sourcePaths.length === 0
    ) {
      errors.push(`${surface.id}: sourcePaths ontbreken.`);
    } else {
      for (const path of surface.sourcePaths) {
        if (
          !isSafeRelativePath(path, root) ||
          !existsSync(resolve(root, path))
        ) {
          errors.push(`${surface.id}: bronpad ontbreekt/ontsnapt: ${path}.`);
        }
      }
    }
    if (
      !Array.isArray(surface.acceptanceIds) ||
      surface.acceptanceIds.length === 0 ||
      surface.acceptanceIds.some((id) => !acceptanceIds.has(id))
    ) {
      errors.push(`${surface.id}: acceptanceIds ontbreken of zijn onbekend.`);
    }
    if (
      surface.scope !== "excluded" &&
      (!Array.isArray(surface.evidenceTargets) ||
        surface.evidenceTargets.length === 0 ||
        surface.evidenceTargets.some((target) => !isNonEmptyString(target)))
    ) {
      errors.push(`${surface.id}: evidenceTargets ontbreken.`);
    }
    if (
      surface.scope === "excluded" &&
      (!Array.isArray(surface.evidenceTargets) ||
        surface.evidenceTargets.length !== 0)
    ) {
      errors.push(`${surface.id}: excluded surface mag geen dekking claimen.`);
    }
  }
  for (const id of expectedScopes.keys()) {
    if (!seen.has(id))
      errors.push(`Verplichte whitelabelsurface ontbreekt: ${id}.`);
  }
  if (surfaces.filter((surface) => surface.scope === "included").length !== 9) {
    errors.push(
      "Whitelabelscope moet exact negen inbegrepen runtime-oppervlakken hebben.",
    );
  }
}

export function validateComponentStates(
  errors,
  root,
  packageRoot,
  manifest,
  routesManifest,
  acceptance,
  prototypeSource,
) {
  if (hashJson(manifest) !== COMPONENT_STATES_CONTENT_SHA256) {
    errors.push(
      "Component-state-inhoudsdigest wijkt af; states, fixtures, interacties of paritycontracten zijn niet meer exact.",
    );
  }
  const expectedStateModel = [
    "CONTRACTED",
    "IMPLEMENTED",
    "VERIFIED_LOCAL",
    "VERIFIED_STAGING",
  ];
  const expectedComponentIds = [
    "button",
    "input",
    "select",
    "textarea",
    "checkbox",
    "switch",
    "data-view-row",
    "data-view-card",
    "row-action-dropdown-menu",
    "filter-sheet",
    "detail-sheet",
    "dialog",
    "alert-dialog",
    "entity-wizard",
    "command-palette",
    "mobile-nav",
    "toast",
    "error-summary",
    "empty",
    "loading",
    "forbidden",
    "label",
    "combobox",
    "radio-group",
    "date-time",
    "popover",
    "tooltip",
    "tabs",
    "accordion-collapsible",
    "planboard-placement-interaction",
  ];
  const expectedParityRequiredStates = new Map([
    [
      "button",
      [
        "rest",
        "focus-visible",
        "pressed",
        "disabled",
        "pending",
        "destructive",
        "icon-only",
      ],
    ],
    [
      "input",
      [
        "empty",
        "populated",
        "focus-visible",
        "disabled",
        "read-only",
        "required",
        "invalid",
        "autofill",
      ],
    ],
    [
      "select",
      [
        "closed-empty",
        "closed-selected",
        "open",
        "item-focused",
        "item-selected",
        "disabled",
        "invalid",
        "long-list-scroll",
      ],
    ],
    [
      "textarea",
      [
        "empty",
        "populated",
        "focus-visible",
        "disabled",
        "read-only",
        "required",
        "invalid",
        "long-content",
      ],
    ],
    [
      "checkbox",
      [
        "unchecked",
        "checked",
        "indeterminate",
        "focus-visible",
        "disabled-unchecked",
        "disabled-checked",
        "invalid",
      ],
    ],
    [
      "switch",
      [
        "off",
        "on",
        "focus-visible",
        "disabled-off",
        "disabled-on",
        "pending",
        "error-restored",
      ],
    ],
    [
      "data-view-row",
      [
        "rest",
        "selected",
        "bulk-selected",
        "pending-action",
        "updated",
        "read-only",
      ],
    ],
    [
      "data-view-card",
      [
        "rest",
        "selected",
        "pending-action",
        "updated",
        "read-only",
        "long-content",
      ],
    ],
    [
      "row-action-dropdown-menu",
      [
        "closed",
        "open-first-item-focused",
        "keyboard-navigation",
        "disabled-item",
        "destructive-separated",
        "action-selected",
        "collision-flipped",
      ],
    ],
    [
      "filter-sheet",
      [
        "closed",
        "open-clean",
        "open-dirty",
        "applying",
        "apply-error",
        "applied",
        "reset",
        "long-content-scroll",
      ],
    ],
    [
      "detail-sheet",
      [
        "closed",
        "open-loading",
        "open-loaded",
        "open-long-content",
        "open-read-only",
        "open-error",
        "nested-menu-or-select",
      ],
    ],
    [
      "dialog",
      [
        "closed",
        "open",
        "open-scrollable",
        "nested-select",
        "pending",
        "recoverable-error",
        "success-close",
      ],
    ],
    [
      "alert-dialog",
      [
        "closed",
        "open-destructive",
        "cancel-focused",
        "confirm-focused",
        "confirm-pending",
        "confirm-error",
        "confirmed-closed",
      ],
    ],
    [
      "entity-wizard",
      [
        "closed",
        "step-one",
        "intermediate-valid",
        "step-invalid",
        "review",
        "submitting",
        "submit-error",
        "success",
      ],
    ],
    [
      "command-palette",
      [
        "closed",
        "open-empty",
        "querying",
        "results",
        "active-result",
        "no-results",
        "recent-results",
        "permission-filtered",
        "navigating",
      ],
    ],
    [
      "mobile-nav",
      [
        "closed",
        "current-route",
        "group-expanded",
        "group-collapsed",
        "permission-filtered",
        "tenant-brand-fallback",
      ],
    ],
    [
      "toast",
      [
        "success",
        "info",
        "warning",
        "error",
        "pending",
        "action-undo",
        "stacked",
        "dismissed",
      ],
    ],
    [
      "error-summary",
      [
        "hidden",
        "validation-visible",
        "summary-focused",
        "field-link-focused",
        "server-error",
        "corrected",
      ],
    ],
    [
      "empty",
      [
        "first-use-empty",
        "no-data-empty",
        "filtered-empty",
        "search-no-results",
        "empty-with-primary-action",
        "read-only-empty",
      ],
    ],
    [
      "loading",
      [
        "page-initial",
        "list-initial",
        "detail-initial",
        "planboard-initial",
        "filter-refresh",
        "mutation-pending",
        "reduced-motion",
      ],
    ],
    [
      "forbidden",
      [
        "route-forbidden",
        "direct-url-forbidden",
        "read-only-partial",
        "hidden-navigation",
        "return-to-dashboard",
      ],
    ],
    [
      "label",
      [
        "rest",
        "associated-control-focused",
        "required",
        "invalid-associated",
        "disabled-associated",
        "long-wrapped",
      ],
    ],
    [
      "combobox",
      [
        "closed-empty",
        "closed-selected",
        "open",
        "search-focused",
        "querying",
        "active-option",
        "option-selected",
        "no-results",
        "disabled",
        "disabled-option",
        "invalid",
        "long-options-scroll",
      ],
    ],
    [
      "radio-group",
      [
        "unselected",
        "selected",
        "focus-visible",
        "keyboard-navigation",
        "disabled-group",
        "disabled-option",
        "required",
        "invalid",
        "long-label",
      ],
    ],
    [
      "date-time",
      [
        "date-empty",
        "date-populated",
        "time-empty",
        "time-partial",
        "range-valid",
        "range-invalid",
        "required",
        "disabled",
        "pending",
        "server-error-retained",
        "amsterdam-context",
      ],
    ],
    [
      "popover",
      [
        "closed",
        "open",
        "trigger-focused",
        "content-focused",
        "collision-flipped",
        "long-content",
        "nested-control",
        "dismissed",
      ],
    ],
    [
      "tooltip",
      [
        "closed",
        "delayed-open",
        "open-keyboard",
        "content-associated",
        "dismissed",
        "disabled-trigger-wrapper",
        "long-content",
        "reduced-motion",
      ],
    ],
    [
      "tabs",
      [
        "first-active",
        "other-active",
        "trigger-focused",
        "keyboard-navigation",
        "disabled-tab",
        "overflow-scroll",
        "inactive-hidden",
        "long-label",
      ],
    ],
    [
      "accordion-collapsible",
      [
        "collapsed",
        "expanded",
        "trigger-focused",
        "keyboard-navigation",
        "disabled-item",
        "long-content",
        "nested-control",
        "reduced-motion",
      ],
    ],
    ["planboard-placement-interaction", []],
  ]);
  const runtimeArtifactRoot =
    "docs/uiux/fieldflow-calm-handoff/evidence/implementation/component-states";
  const components = manifest.components ?? [];
  if (
    manifest.schemaVersion !== 1 ||
    manifest.name !== "Fieldflow Calm component and overlay state contract" ||
    manifest.state !== "CONTRACTED" ||
    JSON.stringify(manifest.stateModel) !==
      JSON.stringify(expectedStateModel) ||
    manifest.componentCount !== expectedComponentIds.length ||
    components.length !== expectedComponentIds.length ||
    JSON.stringify(components.map((component) => component.id)) !==
      JSON.stringify(expectedComponentIds)
  ) {
    errors.push(
      "Component-statecontract mist de canonieke identiteit of 30 componenten.",
    );
  }
  if (
    JSON.stringify(manifest.sourceEvidenceContract) !==
    JSON.stringify({
      repositorySource: {
        type: "repositorySource",
        requiredFields: ["type", "sourcePath", "symbol"],
        pathRule:
          "sourcePath is a safe repository-relative path to an existing TypeScript or TSX source file; symbol is one exact named AST declaration in that file",
      },
      prototypeArchivePath: {
        type: "prototypeArchivePath",
        requiredFields: [
          "type",
          "prototypeArchivePath",
          "archiveManifest",
          "symbol",
        ],
        pathRule:
          "prototypeArchivePath is resolved only inside the immutable archive identified by archiveManifest and is never resolved as a repository sourcePath",
      },
    })
  ) {
    errors.push("Component-statecontract mist het exacte bronbewijscontract.");
  }
  if (
    JSON.stringify(manifest.captureFixtureContract) !==
    JSON.stringify({
      rule: "Each fixture starts from a fresh authenticated tenant context with deterministic data, fixed Europe/Amsterdam time, reduced motion for visual capture and no prior overlay, toast, storage or focus state. Interaction traces additionally run with normal motion and keyboard or coarse pointer as declared.",
      selectors: {
        component: "[data-ff-component]",
        state: "[data-ff-state]",
        density: "[data-ff-density]",
        theme: "[data-ff-theme]",
      },
      requiredComputedMeasurements: [
        "bounding rectangle",
        "computed font size",
        "foreground/background/border/focus colors",
        "accessible name and role",
        "document and local scroll widths",
        "active element before open, after open, after Escape and after close",
      ],
    })
  ) {
    errors.push(
      "Component-statecontract mist het exacte capturefixturecontract.",
    );
  }
  if (
    manifest.proofPolicy?.runtimeArtifactRoot !== runtimeArtifactRoot ||
    JSON.stringify(manifest.proofPolicy?.requiredArtifactSuffixes) !==
      JSON.stringify([
        ".visual.png",
        ".axe.json",
        ".computed.json",
        ".interaction.json",
      ]) ||
    !isNonEmptyString(manifest.proofPolicy?.rule) ||
    (manifest.proofPolicy?.forbiddenClaims ?? []).length !== 5 ||
    !manifest.proofPolicy?.forbiddenClaims?.includes(
      "a settled post-placement screenshot presented as proof of an active pointer drag, touch flow or keyboard positioning interaction",
    )
  ) {
    errors.push("Component-statecontract mist het toekomstige bewijsbeleid.");
  }
  if (
    manifest.viewports?.desktop?.width !== 1440 ||
    manifest.viewports?.desktop?.height !== 1000 ||
    manifest.viewports?.compactDesktop?.width !== 1024 ||
    manifest.viewports?.compactDesktop?.height !== 768 ||
    manifest.viewports?.mobile?.width !== 390 ||
    manifest.viewports?.mobile?.height !== 844 ||
    JSON.stringify(manifest.viewports?.minimumCoverage) !==
      JSON.stringify(MANDATORY_VIEWPORTS) ||
    manifest.viewports?.zoomCoverage?.browserZoomPercent !== 200
  ) {
    errors.push("Component-statecontract mist desktop/mobile/zoomdekking.");
  }
  if (
    JSON.stringify(manifest.globalAxes?.density) !==
      JSON.stringify(["compact", "comfortable", "spacious"]) ||
    JSON.stringify(manifest.globalAxes?.theme) !==
      JSON.stringify([
        "canonical-light",
        "tenant-light",
        "tenant-dark",
        "tenant-saturated-red",
        "tenant-bright-yellow",
        "tenant-monochrome",
        "tenant-low-contrast-corrected",
      ]) ||
    !manifest.globalAxes?.motion?.includes("reduce") ||
    !manifest.globalAxes?.contrastMode?.includes("forced-colors") ||
    !manifest.globalAxes?.permissions?.includes("read-only") ||
    manifest.globalMinimums?.interactiveTargetPx?.width !== 44 ||
    manifest.globalMinimums?.interactiveTargetPx?.height !== 44 ||
    manifest.globalMinimums?.mobileFormFontPx !== 16 ||
    manifest.globalMinimums?.interactiveLabelFontPx !== 13 ||
    manifest.globalMinimums?.normalTextContrast !== 4.5 ||
    manifest.globalMinimums?.uiBoundaryAndFocusContrast !== 3 ||
    manifest.globalMinimums?.focusOutlinePx !== 3 ||
    manifest.globalMinimums?.focusOutlineOffsetPx !== 2
  ) {
    errors.push(
      "Component-statecontract mist de verplichte assen/minimumwaarden.",
    );
  }

  const executionMatrix = manifest.caseExecutionMatrix;
  const expectedDefinitionCountRule =
    "The manifest keeps exactly 60 base capture-case definitions: 29 paired desktop/mobile component cases plus two desktop-only active planboard interaction cases. The runner expands every definition over this matrix; expansion never creates or renames a capture case.";
  const expectedMobileWidths = [320, 390, 430, 768];
  const expectedDesktopWidths = [1024, 1280, 1440, 1920];
  const expectedLongContentRuns = [
    { width: 320, height: 568, browserZoomPercent: 100 },
    { width: 768, height: 1024, browserZoomPercent: 100 },
    { width: 1024, height: 768, browserZoomPercent: 200 },
    { width: 1920, height: 1080, browserZoomPercent: 100 },
  ];
  const expectedLongContentOutcomes = [
    "no-document-horizontal-overflow",
    "no-critical-text-clipping",
    "full-value-remains-programmatically-available",
    "wrapping-preserves-reading-and-focus-order",
    "primary-and-row-actions-remain-operable",
  ];
  if (
    executionMatrix?.state !== "CONTRACTED" ||
    Object.hasOwn(executionMatrix ?? {}, "evidence") ||
    executionMatrix?.baseCaptureCaseCount !== 60 ||
    executionMatrix?.definitionCountRule !== expectedDefinitionCountRule ||
    executionMatrix?.viewportExpansion?.mobile?.captureCaseViewport !==
      "mobile" ||
    JSON.stringify(executionMatrix?.viewportExpansion?.mobile?.runAtWidths) !==
      JSON.stringify(expectedMobileWidths) ||
    executionMatrix?.viewportExpansion?.mobile?.appliesTo !==
      "every-matching-capture-case" ||
    executionMatrix?.viewportExpansion?.desktop?.captureCaseViewport !==
      "desktop" ||
    JSON.stringify(executionMatrix?.viewportExpansion?.desktop?.runAtWidths) !==
      JSON.stringify(expectedDesktopWidths) ||
    executionMatrix?.viewportExpansion?.desktop?.appliesTo !==
      "every-matching-capture-case" ||
    executionMatrix?.zoomExpansion?.appliesTo !== "every-capture-case" ||
    executionMatrix?.zoomExpansion?.width !== 1024 ||
    executionMatrix?.zoomExpansion?.height !== 768 ||
    executionMatrix?.zoomExpansion?.browserZoomPercent !== 200 ||
    executionMatrix?.zoomExpansion?.effectiveCssViewportWidth !== 512 ||
    executionMatrix?.derivedExecutionCount !== 300
  ) {
    errors.push(
      "Component-statecontract mist de exacte case-uitvoeringsmatrix voor 320–1920 en 1024x768@200%.",
    );
  }

  const longContent = executionMatrix?.longContentFixture;
  const expectedTenantName =
    "Koninklijke Vastgoedservice Noord-Holland en Omstreken BV NL";
  const expectedEntityName =
    "Periodieke inspectie en onderhoud van collectieve verwarmingsinstallatie in appartementencomplex VvE";
  const expectedValidationErrorLines = [
    "Voer een geldig Nederlands rekeningnummer in.",
    "Controleer ook de tenaamstelling van de contracthouder.",
  ];
  const expectedAddresses = [
    "Burgemeester Van Walsumweg 123-III links, 3011 MZ Rotterdam, Zuid-Holland, Nederland",
    "Professor Doctor Dorgelolaan 45, gebouw De Groene Toren, verdieping 18, 5613 AM Eindhoven",
  ];
  const expectedAmounts = ["€ 1.234.567,89", "−€ 987.654.321,00"];
  if (
    longContent?.id !== "long-content-nl-v1" ||
    longContent?.locale !== "nl-NL" ||
    longContent?.tenantName?.value !== expectedTenantName ||
    longContent?.tenantName?.expectedCodePointLength !== 60 ||
    [...(longContent?.tenantName?.value ?? "")].length !== 60 ||
    longContent?.entityName?.value !== expectedEntityName ||
    longContent?.entityName?.expectedCodePointLength !== 100 ||
    [...(longContent?.entityName?.value ?? "")].length !== 100 ||
    JSON.stringify(longContent?.validationError?.lines) !==
      JSON.stringify(expectedValidationErrorLines) ||
    longContent?.validationError?.expectedLineCount !== 2 ||
    JSON.stringify(longContent?.addresses) !==
      JSON.stringify(expectedAddresses) ||
    JSON.stringify(longContent?.amounts) !== JSON.stringify(expectedAmounts) ||
    JSON.stringify(longContent?.runs) !==
      JSON.stringify(expectedLongContentRuns) ||
    JSON.stringify(longContent?.requiredOutcomes) !==
      JSON.stringify(expectedLongContentOutcomes)
  ) {
    errors.push(
      "Component-statecontract mist de exacte lange-contentfixture en 320/768/1024@200%/1920-runs.",
    );
  }

  const keyboardSafeArea = executionMatrix?.mobileKeyboardSafeAreaFixture;
  const expectedKeyboardComponentIds = [
    "input",
    "textarea",
    "select",
    "combobox",
    "filter-sheet",
    "detail-sheet",
    "dialog",
    "entity-wizard",
    "command-palette",
    "popover",
    "error-summary",
  ];
  const expectedRectAssertions = [
    {
      subject: "stickyFooterRect.bottom",
      operator: "<=",
      reference: "visualViewportRect.bottom-minus-safeAreaInsets.bottom",
    },
    {
      subject: "activeControlRect.top",
      operator: ">=",
      reference: "visualViewportRect.top-plus-safeAreaInsets.top",
    },
    {
      subject: "activeControlRect.bottom",
      operator: "<=",
      reference: "stickyFooterRect.top",
    },
    {
      subject: "activeErrorTextRect.bottom",
      operator: "<=",
      reference: "stickyFooterRect.top",
    },
    {
      subject: "overlayRect.left",
      operator: ">=",
      reference: "visualViewportRect.left-plus-safeAreaInsets.left",
    },
    {
      subject: "overlayRect.right",
      operator: "<=",
      reference: "visualViewportRect.right-minus-safeAreaInsets.right",
    },
    {
      subject: "document.scrollWidth",
      operator: "<=",
      reference: "document.clientWidth",
    },
  ];
  if (
    keyboardSafeArea?.id !== "mobile-keyboard-safe-area-v1" ||
    JSON.stringify(keyboardSafeArea?.runAtWidths) !==
      JSON.stringify(expectedMobileWidths) ||
    JSON.stringify(keyboardSafeArea?.requiredComponentIds) !==
      JSON.stringify(expectedKeyboardComponentIds) ||
    keyboardSafeArea?.requiredComponentIds?.some(
      (id) => !expectedComponentIds.includes(id),
    ) ||
    keyboardSafeArea?.virtualKeyboardState !== "visible" ||
    keyboardSafeArea?.visualViewportRequired !== true ||
    JSON.stringify(keyboardSafeArea?.safeAreaInsetsRequired) !==
      JSON.stringify(["top", "right", "bottom", "left"]) ||
    keyboardSafeArea?.nullRectPolicy !== "fail" ||
    JSON.stringify(keyboardSafeArea?.rectAssertions) !==
      JSON.stringify(expectedRectAssertions)
  ) {
    errors.push(
      "Component-statecontract mist exacte visualViewport-, keyboard- en safe-area-rectasserties.",
    );
  }

  const portalCoverage = executionMatrix?.portalCoverage;
  const expectedAdditionalPortalKinds = [
    "DropdownMenu",
    "Select",
    "Combobox",
    "Popover",
    "Tooltip",
    "AlertDialog",
    "CommandPalette",
    "Toast",
  ];
  const expectedOpenPortalKinds = [
    "Dialog",
    "Sheet",
    ...expectedAdditionalPortalKinds,
  ];
  const expectedPortalKindToComponentIds = {
    Dialog: ["dialog", "entity-wizard"],
    Sheet: ["filter-sheet", "detail-sheet", "mobile-nav"],
    DropdownMenu: ["row-action-dropdown-menu"],
    Select: ["select"],
    Combobox: ["combobox"],
    Popover: ["popover"],
    Tooltip: ["tooltip"],
    AlertDialog: ["alert-dialog"],
    CommandPalette: ["command-palette"],
    Toast: ["toast"],
  };
  if (
    portalCoverage?.portalRoot !== 'body[data-concept="fieldflow"]' ||
    JSON.stringify(portalCoverage?.existingBaselinePortalKinds) !==
      JSON.stringify(["Dialog", "Sheet"]) ||
    JSON.stringify(portalCoverage?.requiredAdditionalPortalKinds) !==
      JSON.stringify(expectedAdditionalPortalKinds) ||
    JSON.stringify(portalCoverage?.requiredOpenPortalKinds) !==
      JSON.stringify(expectedOpenPortalKinds) ||
    JSON.stringify(portalCoverage?.portalKindToComponentIds) !==
      JSON.stringify(expectedPortalKindToComponentIds) ||
    Object.values(portalCoverage?.portalKindToComponentIds ?? {})
      .flat()
      .some((id) => !expectedComponentIds.includes(id)) ||
    JSON.stringify(portalCoverage?.requiredComputedTokens) !==
      JSON.stringify([
        "--ff-primary",
        "--ff-sidebar-active-bg",
        "--muted-text",
        "--input",
        "--ff-focus",
      ]) ||
    JSON.stringify(portalCoverage?.requiredMeasurements) !==
      JSON.stringify([
        "open-content-rect",
        "interactive-target-rects",
        "computed-theme-tokens",
        "focus-trap-or-managed-focus",
        "escape-order",
        "exact-return-focus",
      ])
  ) {
    errors.push(
      "Component-statecontract mist Dialog/Sheet plus acht extra portaltypen en hun meetcontract.",
    );
  }

  const routeSet = new Set(
    (routesManifest.routes ?? []).map((route) => route.route),
  );
  const acceptanceIds = new Set(
    (acceptance.requirements ?? []).map((requirement) => requirement.id),
  );
  const repositorySymbolCache = new Map();
  const prototypeSymbolCache = new Map();
  const archivePath = resolve(
    packageRoot,
    "evidence/prototype",
    prototypeSource.archive?.file ?? "",
  );
  const expectedArchiveManifest =
    "docs/uiux/fieldflow-calm-handoff/evidence/prototype/source-manifest.json";
  const captureIds = new Set();
  const evidenceTargets = new Set();
  let desktopCases = 0;
  let mobileCases = 0;
  const allowedNewTargets = new Map([
    [
      "entity-wizard",
      "artifacts/backoffice/src/components/tenant-ui/entity-wizard.tsx",
    ],
    [
      "error-summary",
      "artifacts/backoffice/src/components/ui/form-error-summary.tsx",
    ],
  ]);

  const expectedCrossComponentJourneys = [
    {
      id: "mobile-planboard-non-drag",
      inputModes: ["touch"],
      presentation: "fullscreen-wizard",
      requiredActions: [
        "plan",
        "exact-time",
        "move",
        "replace-employee",
        "unassign-one-employee",
        "release-whole-assignment",
        "conflict-review",
        "confirm",
        "cancel",
        "undo",
      ],
      requiredStates: [
        "wizard-open",
        "validation-error",
        "conflict",
        "unassign-review",
        "unassign-pending",
        "unassign-success",
        "release-team-impact",
        "release-confirmation",
        "release-cancelled",
        "release-pending",
        "release-success",
        "release-rollback",
        "undo-complete",
      ],
      requiredAssertions: [
        "Unassign removes exactly the selected employee while preserving the assignment moment and every other active staffing link.",
        "Release is pre-start only, lists every affected active team member before confirmation, and cancel performs zero writes.",
        "Confirmed release atomically removes every active staffing link, changes scheduled to plannable, clears scheduledDate/start/end, never changes actual timestamps, and exposes version-safe undo.",
        "A failed unassign or release restores the complete before-snapshot for every affected assignment and staffing row.",
      ],
      acceptanceIds: [
        "FFC-PB-008",
        "FFC-PB-023",
        "FFC-A11Y-002",
        "FFC-A11Y-005",
        "FFC-A11Y-007",
        "FFC-A11Y-010",
        "FFC-RSP-009",
      ],
    },
    {
      id: "mobile-planboard-timeline-keyboard",
      inputModes: ["keyboard"],
      presentation: "explicit-toggle-timeline-grid",
      requiredActions: [
        "open-timeline",
        "select-queue-item",
        "move-by-raster",
        "move-by-hour",
        "change-employee",
        "confirm",
        "cancel",
        "undo",
      ],
      requiredStates: [
        "timeline-open",
        "item-selected",
        "position-preview",
        "invalid-position",
        "confirm-pending",
        "success",
        "cancelled",
        "undo-complete",
      ],
      acceptanceIds: [
        "FFC-PB-024",
        "FFC-A11Y-002",
        "FFC-A11Y-004",
        "FFC-A11Y-007",
        "FFC-A11Y-010",
      ],
    },
  ];
  const crossComponentJourneys = manifest.crossComponentJourneys ?? [];
  const crossEvidenceTargets = new Set();
  if (
    crossComponentJourneys.length !== expectedCrossComponentJourneys.length ||
    JSON.stringify(crossComponentJourneys.map((journey) => journey.id)) !==
      JSON.stringify(
        expectedCrossComponentJourneys.map((journey) => journey.id),
      )
  ) {
    errors.push(
      "Component-statecontract mist de twee canonieke mobiele planbordjourneys.",
    );
  }
  for (const expected of expectedCrossComponentJourneys) {
    const journey = crossComponentJourneys.find(
      (candidate) => candidate.id === expected.id,
    );
    const expectedPrefix = `${runtimeArtifactRoot}/cross-component/`;
    if (
      !journey ||
      journey.state !== "CONTRACTED" ||
      Object.hasOwn(journey, "evidence") ||
      journey.route !== "/planning" ||
      JSON.stringify(journey.viewports) !==
        JSON.stringify([320, 390, 430, 768]) ||
      JSON.stringify(journey.inputModes) !==
        JSON.stringify(expected.inputModes) ||
      journey.presentation !== expected.presentation ||
      JSON.stringify(journey.requiredActions) !==
        JSON.stringify(expected.requiredActions) ||
      JSON.stringify(journey.requiredStates) !==
        JSON.stringify(expected.requiredStates) ||
      JSON.stringify(journey.requiredAssertions ?? []) !==
        JSON.stringify(expected.requiredAssertions ?? []) ||
      JSON.stringify(journey.acceptanceIds) !==
        JSON.stringify(expected.acceptanceIds) ||
      !Array.isArray(journey.componentIds) ||
      journey.componentIds.length === 0 ||
      journey.componentIds.some((id) => !expectedComponentIds.includes(id)) ||
      !["entry", "error", "success", "rollback", "cancel", "undo"].every(
        (field) => isNonEmptyString(journey.focusContract?.[field]),
      ) ||
      JSON.stringify(journey.minimums?.targetPx) !== JSON.stringify([44, 44]) ||
      journey.minimums?.mobileFormFontPx !== 16 ||
      !isNonEmptyString(journey.evidenceTargetPrefix) ||
      !journey.evidenceTargetPrefix.startsWith(expectedPrefix) ||
      !isSafeRelativePath(journey.evidenceTargetPrefix, root) ||
      existsSync(resolve(root, journey.evidenceTargetPrefix)) ||
      crossEvidenceTargets.has(journey.evidenceTargetPrefix)
    ) {
      errors.push(
        `${expected.id}: cross-component journeycontract is ongeldig.`,
      );
    }
    if (journey?.evidenceTargetPrefix) {
      crossEvidenceTargets.add(journey.evidenceTargetPrefix);
    }
  }

  function validateComponentSource(source, label) {
    if (source?.type === "repositorySource") {
      if (
        !isSafeRelativePath(source.sourcePath, root) ||
        !/\.(?:ts|tsx)$/u.test(source.sourcePath)
      ) {
        errors.push(
          `${label}: onveilig of niet-TypeScript repositorySource-pad.`,
        );
        return;
      }
      const path = resolve(root, source.sourcePath);
      if (!existsSync(path) || !statSync(path).isFile()) {
        errors.push(
          `${label}: repositorySource bestaat niet: ${source.sourcePath}.`,
        );
        return;
      }
      let symbols = repositorySymbolCache.get(path);
      if (!symbols) {
        symbols = collectTypescriptSymbols(path);
        repositorySymbolCache.set(path, symbols);
      }
      if (
        !isNonEmptyString(source.symbol) ||
        !symbols.topLevelDeclared.has(source.symbol)
      ) {
        errors.push(
          `${label}: exact top-level AST-symbol ontbreekt: ${source.symbol}.`,
        );
      }
      return;
    }
    if (source?.type === "prototypeArchivePath") {
      if (
        source.archiveManifest !== expectedArchiveManifest ||
        !isSafeRelativePath(
          source.prototypeArchivePath,
          resolve(packageRoot, "evidence/prototype"),
        ) ||
        !/\.(?:ts|tsx)$/u.test(source.prototypeArchivePath)
      ) {
        errors.push(`${label}: ongeldige prototypeArchivePath-bron.`);
        return;
      }
      const member = `${prototypeSource.archive?.rootDirectory}/${source.prototypeArchivePath}`;
      let symbols = prototypeSymbolCache.get(member);
      if (!symbols) {
        try {
          const content = execFileSync("tar", ["-xOzf", archivePath, member], {
            encoding: "utf8",
            maxBuffer: 16 * 1024 * 1024,
          });
          symbols = collectTypescriptSymbolsFromSource(
            content,
            source.prototypeArchivePath,
          );
          prototypeSymbolCache.set(member, symbols);
        } catch (error) {
          errors.push(
            `${label}: prototypearchiefbron kan niet worden gelezen: ${error}`,
          );
          return;
        }
      }
      if (
        !isNonEmptyString(source.symbol) ||
        !symbols.topLevelDeclared.has(source.symbol)
      ) {
        errors.push(
          `${label}: top-level prototypesymbol ontbreekt: ${source.symbol}.`,
        );
      }
      return;
    }
    errors.push(`${label}: onbekend sourceEvidence-type.`);
  }

  for (const component of components) {
    const label = component.id ?? "(component zonder ID)";
    const targetExists =
      isSafeRelativePath(component.implementationTarget, root) &&
      existsSync(resolve(root, component.implementationTarget));
    const targetStatusValid =
      (component.implementationStatus === "existing-target" && targetExists) ||
      (component.implementationStatus === "new-target" &&
        !targetExists &&
        allowedNewTargets.get(component.id) === component.implementationTarget);
    if (
      component.state !== "CONTRACTED" ||
      Object.hasOwn(component, "evidence") ||
      !isNonEmptyString(component.name) ||
      !isNonEmptyString(component.category) ||
      !isSafeRelativePath(component.implementationTarget, root) ||
      !targetStatusValid
    ) {
      errors.push(
        `${label}: componentidentiteit/target/contractstate is ongeldig.`,
      );
    }
    if (
      !Array.isArray(component.sourceEvidence) ||
      component.sourceEvidence.length === 0
    ) {
      errors.push(`${label}: machineleesbare sourceEvidence ontbreekt.`);
    } else {
      for (const source of component.sourceEvidence) {
        validateComponentSource(source, label);
      }
    }
    if (
      !Array.isArray(component.witnessRoutes) ||
      component.witnessRoutes.length === 0 ||
      component.witnessRoutes.some(
        (route) => !routeSet.has(route.split(/[?#]/u, 1)[0]),
      )
    ) {
      errors.push(
        `${label}: witnessRoutes ontbreken of verwijzen buiten routes.json.`,
      );
    }
    if (
      !Array.isArray(component.states) ||
      component.states.length === 0 ||
      new Set(component.states).size !== component.states.length ||
      component.states.some((state) => !isNonEmptyString(state)) ||
      !Array.isArray(component.stateRules) ||
      component.stateRules.length === 0 ||
      component.stateRules.some((rule) => !isNonEmptyString(rule)) ||
      !["entry", "escape", "return"].every((field) =>
        isNonEmptyString(component.focusContract?.[field]),
      ) ||
      !isNonEmptyString(component.responsiveContract?.desktop) ||
      !isNonEmptyString(component.responsiveContract?.mobile)
    ) {
      errors.push(`${label}: states/focus/responsive regels zijn onvolledig.`);
    }
    const expectedParityStates =
      expectedParityRequiredStates.get(component.id) ?? [];
    if (
      JSON.stringify(component.parityRequiredStates) !==
        JSON.stringify(expectedParityStates) ||
      component.parityRequiredStates?.some(
        (state) => !(component.states ?? []).includes(state),
      )
    ) {
      errors.push(
        `${label}: canonieke parityRequiredStates ontbreken of zijn gewijzigd.`,
      );
    }
    for (const field of ["targetPx", "itemTargetPx"]) {
      const value = component.minimums?.[field];
      if (
        value !== undefined &&
        (!Array.isArray(value) ||
          value.length !== 2 ||
          value.some((size) => !Number.isFinite(size) || size < 44))
      ) {
        errors.push(`${label}: ${field} is kleiner dan 44x44.`);
      }
    }
    if (
      (component.minimums?.fontPxMobile !== undefined &&
        component.minimums.fontPxMobile < 16) ||
      (component.minimums?.textContrast !== undefined &&
        component.minimums.textContrast < 4.5) ||
      (component.minimums?.uiContrast !== undefined &&
        component.minimums.uiContrast < 3) ||
      JSON.stringify(component.axes?.density) !==
        JSON.stringify(["compact", "comfortable", "spacious"]) ||
      !Array.isArray(component.axes?.themeTokens) ||
      component.axes.themeTokens.length === 0 ||
      !Array.isArray(component.acceptanceIds) ||
      component.acceptanceIds.length === 0 ||
      component.acceptanceIds.some((id) => !acceptanceIds.has(id))
    ) {
      errors.push(
        `${label}: minimum-/density-/theme-/acceptancecontract is ongeldig.`,
      );
    }
    if (component.id === "planboard-placement-interaction") {
      const expectedStates = [
        "pointer-drag-active-valid",
        "pointer-drag-active-warning",
        "pointer-drag-active-blocked",
        "drag-ghost-visible",
        "target-highlight-valid",
        "target-highlight-warning",
        "target-highlight-blocked",
        "typed-warning-reason",
        "typed-blocked-reason",
        "pointer-offset-retained",
        "keyboard-position-preview",
        "keyboard-invalid-position",
      ];
      const expectedAcceptanceIds = [
        "FFC-PB-003",
        "FFC-PB-006",
        "FFC-PB-007",
        "FFC-PB-010",
      ];
      const [pointerCase, keyboardCase] = component.captureCases ?? [];
      const pointerFrames = pointerCase?.interactionFrames ?? [];
      const keyboardFrames = keyboardCase?.interactionFrames ?? [];
      const warningReason = {
        code: "unknown_availability",
        severity: "warning",
        label: "Beschikbaarheid niet ingesteld",
      };
      const blockedReason = {
        code: "already_booked",
        severity: "block",
        label: "Al ingepland op dit tijdstip",
      };
      if (
        JSON.stringify(component.states) !== JSON.stringify(expectedStates) ||
        JSON.stringify(component.acceptanceIds) !==
          JSON.stringify(expectedAcceptanceIds) ||
        component.implementationTarget !==
          "artifacts/backoffice/src/components/assignments/PlanningBoardView.tsx" ||
        component.implementationStatus !== "existing-target" ||
        JSON.stringify(component.witnessRoutes) !==
          JSON.stringify(["/planning"])
      ) {
        errors.push(
          `${label}: canonieke states, PB-003/006/007/010-binding of implementatietarget wijkt af.`,
        );
      }
      if (
        JSON.stringify(component.parityRequiredStates) !== JSON.stringify([]) ||
        JSON.stringify(component.interactionModeParityContract) !==
          JSON.stringify({
            directMobileCaptureRequired: false,
            touchDragRequired: false,
            desktopOnlyInputModes: ["pointer", "keyboard"],
            mobileWidths: [320, 390, 430, 768],
            mappings: [
              {
                desktopProofClaim: "active-pointer-drag",
                mobileJourneyId: "mobile-planboard-non-drag",
                equivalence: "functional-placement-without-drag",
                evidenceInterchangeable: false,
              },
              {
                desktopProofClaim: "active-keyboard-placement",
                mobileJourneyId: "mobile-planboard-timeline-keyboard",
                equivalence: "same-grid-keyboard-positioning",
                evidenceInterchangeable: false,
              },
            ],
            rule: "Desktop active drag and keyboard frames remain their own evidence. Mobile functional parity is proved only by the referenced non-drag touch journey and the keyboard journey exposed through the explicit Timeline toggle; neither journey may be relabelled as pointer-drag evidence.",
          })
      ) {
        errors.push(
          `${label}: expliciete desktop-only interactionModeParityContract of mobiele journeykoppeling ontbreekt.`,
        );
      }
      if (
        pointerCase?.id !==
          "planboard-placement-pointer-desktop-active-matrix" ||
        pointerCase?.viewport !== "desktop" ||
        pointerCase?.inputMode !== "pointer" ||
        pointerCase?.proofClass !== "active-interaction" ||
        JSON.stringify(pointerCase?.proofClaims) !==
          JSON.stringify([
            "active-pointer-drag",
            "drag-ghost",
            "target-highlight",
            "typed-planning-reason",
            "pointer-offset",
          ]) ||
        JSON.stringify(pointerCase?.excludedProofClaims) !==
          JSON.stringify([
            "touch-placement-flow",
            "settled-post-placement-as-active-interaction",
          ]) ||
        pointerCase?.settledPostPlacementEligible !== false ||
        JSON.stringify(pointerFrames.map((frame) => frame.id)) !==
          JSON.stringify([
            "active-valid",
            "active-warning",
            "active-blocked",
          ]) ||
        JSON.stringify(pointerFrames.map((frame) => frame.evaluationState)) !==
          JSON.stringify(["valid", "warning", "blocked"]) ||
        pointerFrames.some((frame) => frame.mutationCountBeforeRelease !== 0) ||
        JSON.stringify(pointerFrames[0]?.expectedTypedReasons) !==
          JSON.stringify([]) ||
        JSON.stringify(pointerFrames[1]?.expectedTypedReasons) !==
          JSON.stringify([warningReason]) ||
        JSON.stringify(pointerFrames[2]?.expectedTypedReasons) !==
          JSON.stringify([blockedReason]) ||
        !pointerFrames.every((frame) =>
          frame.requiredVisuals?.includes("drag-ghost"),
        ) ||
        !pointerFrames[0]?.requiredVisuals?.includes(
          "target-highlight-valid",
        ) ||
        !pointerFrames[1]?.requiredVisuals?.includes(
          "target-highlight-warning",
        ) ||
        !pointerFrames[2]?.requiredVisuals?.includes(
          "target-highlight-blocked",
        ) ||
        JSON.stringify(pointerCase?.pointerOffsetProbe) !==
          JSON.stringify({
            assignmentFixtureId: "FG-2048",
            sourceStartMinutes: 540,
            sourceDurationMinutes: 90,
            grabOffsetMinutes: 45,
            targetPointerMinutes: 645,
            gridStepMinutes: 15,
            expectedPreviewStartMinutes: 600,
            expectedPreviewEndMinutes: 690,
            maximumDeltaMinutes: 0,
          })
      ) {
        errors.push(
          `${label}: actieve pointermatrix mist valid/warning/blocked, ghost, targethighlight, typed reason of exact pointeroffset.`,
        );
      }
      if (
        keyboardCase?.id !==
          "planboard-placement-keyboard-desktop-active-matrix" ||
        keyboardCase?.viewport !== "desktop" ||
        keyboardCase?.inputMode !== "keyboard" ||
        keyboardCase?.proofClass !== "active-interaction" ||
        JSON.stringify(keyboardCase?.proofClaims) !==
          JSON.stringify([
            "active-keyboard-placement",
            "position-preview",
            "invalid-position",
            "typed-planning-reason",
          ]) ||
        JSON.stringify(keyboardCase?.excludedProofClaims) !==
          JSON.stringify([
            "pointer-drag",
            "touch-placement-flow",
            "settled-post-placement-as-active-interaction",
          ]) ||
        keyboardCase?.settledPostPlacementEligible !== false ||
        JSON.stringify(keyboardFrames.map((frame) => frame.id)) !==
          JSON.stringify(["position-preview", "invalid-position"]) ||
        JSON.stringify(keyboardFrames.map((frame) => frame.evaluationState)) !==
          JSON.stringify(["valid", "blocked"]) ||
        keyboardFrames.some(
          (frame) => frame.mutationCountBeforeConfirm !== 0,
        ) ||
        JSON.stringify(keyboardFrames[0]?.expectedTypedReasons) !==
          JSON.stringify([]) ||
        JSON.stringify(keyboardFrames[1]?.expectedTypedReasons) !==
          JSON.stringify([blockedReason]) ||
        !keyboardFrames[0]?.requiredAnnouncements?.includes(
          "Geldige positie",
        ) ||
        !keyboardFrames[1]?.requiredAnnouncements?.includes(
          "Ongeldige positie",
        ) ||
        !keyboardFrames[1]?.requiredAnnouncements?.includes(
          "Al ingepland op dit tijdstip",
        ) ||
        keyboardFrames[1]?.focusRemainsOnActiveGridcell !== true
      ) {
        errors.push(
          `${label}: actieve keyboardmatrix mist position-preview, invalid-position, typed reason, announcement of focusbehoud.`,
        );
      }
    }
    if (
      !Array.isArray(component.captureCases) ||
      component.captureCases.length !== 2
    ) {
      errors.push(`${label}: exact twee canonieke capturecases vereist.`);
      continue;
    }
    const coveredStates = new Set();
    const componentViewports = new Set();
    for (const capture of component.captureCases) {
      if (!isNonEmptyString(capture.id) || captureIds.has(capture.id)) {
        errors.push(`${label}: ontbrekende/dubbele capturecase ${capture.id}.`);
      }
      captureIds.add(capture.id);
      componentViewports.add(capture.viewport);
      if (capture.viewport === "desktop") desktopCases += 1;
      if (capture.viewport === "mobile") mobileCases += 1;
      if (
        !["desktop", "mobile"].includes(capture.viewport) ||
        !isNonEmptyString(capture.fixture) ||
        !isNonEmptyString(capture.interaction) ||
        !Array.isArray(capture.states) ||
        capture.states.length === 0 ||
        capture.states.some((state) => !component.states.includes(state))
      ) {
        errors.push(
          `${capture.id}: viewport/fixture/interactie/states zijn ongeldig.`,
        );
      }
      for (const state of capture.states ?? []) coveredStates.add(state);
      const missingParityStates = expectedParityStates.filter(
        (state) => !capture.states?.includes(state),
      );
      if (missingParityStates.length > 0) {
        errors.push(
          `${capture.id}: ${capture.viewport}-parity mist ${missingParityStates.join(", ")}.`,
        );
      }
      const expectedPrefix = `${runtimeArtifactRoot}/${component.id}/`;
      if (
        !isNonEmptyString(capture.evidenceTargetPrefix) ||
        !capture.evidenceTargetPrefix.startsWith(expectedPrefix) ||
        !isSafeRelativePath(capture.evidenceTargetPrefix, root) ||
        evidenceTargets.has(capture.evidenceTargetPrefix) ||
        existsSync(resolve(root, capture.evidenceTargetPrefix))
      ) {
        errors.push(
          `${capture.id}: evidenceTargetPrefix is onveilig, dubbel of claimt output.`,
        );
      }
      evidenceTargets.add(capture.evidenceTargetPrefix);
    }
    const expectedComponentViewports =
      component.id === "planboard-placement-interaction"
        ? ["desktop"]
        : ["desktop", "mobile"];
    if (
      JSON.stringify([...componentViewports].sort()) !==
        JSON.stringify(expectedComponentViewports) ||
      component.states.some((state) => !coveredStates.has(state))
    ) {
      errors.push(
        `${label}: canonieke viewport- of volledige statedekking ontbreekt.`,
      );
    }
  }
  if (
    captureIds.size !== 60 ||
    evidenceTargets.size !== 60 ||
    desktopCases !== 31 ||
    mobileCases !== 29
  ) {
    errors.push(
      "Component-statecontract moet exact 60 unieke cases (31 desktop/29 mobile) hebben.",
    );
  }
  const derivedExecutionCount =
    mobileCases * expectedMobileWidths.length +
    desktopCases * expectedDesktopWidths.length +
    captureIds.size;
  if (
    derivedExecutionCount !== 300 ||
    executionMatrix?.derivedExecutionCount !== derivedExecutionCount
  ) {
    errors.push(
      "Component-statecontract case-uitvoering moet uit 60 definities exact 300 viewport-/zoomruns afleiden.",
    );
  }

  const axisCoverage = executionMatrix?.axisCoverage;
  const expectedAxisCoverageRule =
    "The 300 canonical viewport/zoom component runs are a required subset of this axis suite. Every critical execution unit is expanded over the full Cartesian product of its five applicable viewport/zoom profiles and every theme, density, motion, contrast and permission value. Every remaining component capture case uses the deterministic pair-closure algorithm, including one canonical-default seed for each applicable viewport/zoom profile. No axis value, pair or critical tuple may be sampled away.";
  const expectedAxisOrder = [
    "viewportZoomProfile",
    "theme",
    "density",
    "motion",
    "contrastMode",
    "permissionProfile",
  ];
  const expectedViewportZoomProfiles = [
    {
      id: "mobile-320x568-z100",
      profileSet: "mobile",
      width: 320,
      height: 568,
      browserZoomPercent: 100,
      effectiveCssViewportWidth: 320,
    },
    {
      id: "mobile-390x844-z100",
      profileSet: "mobile",
      width: 390,
      height: 844,
      browserZoomPercent: 100,
      effectiveCssViewportWidth: 390,
    },
    {
      id: "mobile-430x932-z100",
      profileSet: "mobile",
      width: 430,
      height: 932,
      browserZoomPercent: 100,
      effectiveCssViewportWidth: 430,
    },
    {
      id: "mobile-768x1024-z100",
      profileSet: "mobile",
      width: 768,
      height: 1024,
      browserZoomPercent: 100,
      effectiveCssViewportWidth: 768,
    },
    {
      id: "desktop-1024x768-z100",
      profileSet: "desktop",
      width: 1024,
      height: 768,
      browserZoomPercent: 100,
      effectiveCssViewportWidth: 1024,
    },
    {
      id: "desktop-1280x800-z100",
      profileSet: "desktop",
      width: 1280,
      height: 800,
      browserZoomPercent: 100,
      effectiveCssViewportWidth: 1280,
    },
    {
      id: "desktop-1440x1000-z100",
      profileSet: "desktop",
      width: 1440,
      height: 1000,
      browserZoomPercent: 100,
      effectiveCssViewportWidth: 1440,
    },
    {
      id: "desktop-1920x1080-z100",
      profileSet: "desktop",
      width: 1920,
      height: 1080,
      browserZoomPercent: 100,
      effectiveCssViewportWidth: 1920,
    },
    {
      id: "shared-1024x768-z200",
      profileSet: "shared",
      width: 1024,
      height: 768,
      browserZoomPercent: 200,
      effectiveCssViewportWidth: 512,
    },
  ];
  const expectedViewportZoomProfileSets = {
    mobile: [
      "mobile-320x568-z100",
      "mobile-390x844-z100",
      "mobile-430x932-z100",
      "mobile-768x1024-z100",
      "shared-1024x768-z200",
    ],
    desktop: [
      "desktop-1024x768-z100",
      "desktop-1280x800-z100",
      "desktop-1440x1000-z100",
      "desktop-1920x1080-z100",
      "shared-1024x768-z200",
    ],
  };
  const expectedAxisBindings = {
    theme: "globalAxes.theme",
    density: "globalAxes.density",
    motion: "globalAxes.motion",
    contrastMode: "globalAxes.contrastMode",
    permissionProfile: "globalAxes.permissions",
  };
  if (
    axisCoverage?.schemaVersion !== 1 ||
    axisCoverage?.rule !== expectedAxisCoverageRule ||
    JSON.stringify(axisCoverage?.axisOrder) !==
      JSON.stringify(expectedAxisOrder) ||
    JSON.stringify(axisCoverage?.viewportZoomProfiles) !==
      JSON.stringify(expectedViewportZoomProfiles) ||
    JSON.stringify(axisCoverage?.viewportZoomProfileSets) !==
      JSON.stringify(expectedViewportZoomProfileSets) ||
    JSON.stringify(axisCoverage?.axisBindings) !==
      JSON.stringify(expectedAxisBindings)
  ) {
    errors.push(
      "Component-statecontract mist de exacte machineleesbare viewport-/zoom- en globale testassen.",
    );
  }

  const expectedCriticalScopes = [
    {
      id: "shell",
      routeIds: ["tenant-home"],
      executionUnits: [
        ["capture-case", "mobile-nav-desktop-equivalent", "desktop"],
        ["capture-case", "mobile-nav-mobile-lifecycle", "mobile"],
        ["capture-case", "command-palette-desktop-search", "desktop"],
        ["capture-case", "command-palette-mobile-search", "mobile"],
        ["capture-case", "toast-desktop-state-stack", "desktop"],
        ["capture-case", "toast-mobile-state-stack", "mobile"],
      ],
      derivedRunCount: 7560,
      derivedDistinctAxisCombinationCount: 2268,
    },
    {
      id: "branding-editor",
      routeIds: ["tenant-instellingen-branding"],
      executionUnits: [
        ["capture-case", "input-desktop-validation", "desktop"],
        ["capture-case", "input-mobile-validation", "mobile"],
        ["capture-case", "select-desktop-open", "desktop"],
        ["capture-case", "select-mobile-open", "mobile"],
        ["capture-case", "textarea-desktop-validation", "desktop"],
        ["capture-case", "textarea-mobile-validation", "mobile"],
        ["capture-case", "combobox-desktop-search", "desktop"],
        ["capture-case", "combobox-mobile-search", "mobile"],
        ["capture-case", "entity-wizard-desktop-flow", "desktop"],
        ["capture-case", "entity-wizard-mobile-flow", "mobile"],
      ],
      derivedRunCount: 12600,
      derivedDistinctAxisCombinationCount: 2268,
    },
    {
      id: "planboard",
      routeIds: ["tenant-planning"],
      executionUnits: [
        [
          "capture-case",
          "planboard-placement-pointer-desktop-active-matrix",
          "desktop",
        ],
        [
          "capture-case",
          "planboard-placement-keyboard-desktop-active-matrix",
          "desktop",
        ],
        ["cross-component-journey", "mobile-planboard-non-drag", "mobile"],
        [
          "cross-component-journey",
          "mobile-planboard-timeline-keyboard",
          "mobile",
        ],
      ],
      derivedRunCount: 5040,
      derivedDistinctAxisCombinationCount: 2268,
    },
    {
      id: "permissions",
      routeIds: [
        "tenant-instellingen-gebruikers",
        "tenant-instellingen-rollen",
        "tenant-instellingen-rollen-id",
      ],
      executionUnits: [
        ["capture-case", "checkbox-desktop-state-matrix", "desktop"],
        ["capture-case", "checkbox-mobile-state-matrix", "mobile"],
        ["capture-case", "switch-desktop-state-matrix", "desktop"],
        ["capture-case", "switch-mobile-state-matrix", "mobile"],
        ["capture-case", "forbidden-desktop-permissions", "desktop"],
        ["capture-case", "forbidden-mobile-permissions", "mobile"],
      ],
      derivedRunCount: 7560,
      derivedDistinctAxisCombinationCount: 2268,
    },
  ];
  const actualCriticalScopes =
    axisCoverage?.criticalFullCartesian?.scopes?.map((scope) => ({
      id: scope.id,
      routeIds: scope.routeIds,
      executionUnits: scope.executionUnits?.map((unit) => [
        unit.type,
        unit.id,
        unit.viewportZoomProfileSet,
      ]),
      derivedRunCount: scope.derivedRunCount,
      derivedDistinctAxisCombinationCount:
        scope.derivedDistinctAxisCombinationCount,
    })) ?? [];
  const fullCartesian = axisCoverage?.criticalFullCartesian;
  if (
    fullCartesian?.algorithm !== "lexicographic-cartesian-product-v1" ||
    JSON.stringify(actualCriticalScopes) !==
      JSON.stringify(expectedCriticalScopes) ||
    fullCartesian?.executionUnitCount !== 26 ||
    fullCartesian?.componentCaptureCaseCount !== 24 ||
    fullCartesian?.crossComponentJourneyCount !== 2 ||
    fullCartesian?.derivedDistinctScopeAxisCombinationCount !== 9072 ||
    fullCartesian?.runsPerExecutionUnit !== 1260 ||
    fullCartesian?.derivedRunCount !== 32760
  ) {
    errors.push(
      "Component-statecontract mist het volledige kritieke kruisproduct voor shell, branding-editor, planbord en permissions.",
    );
  }

  const captureCaseById = new Map();
  for (const component of components) {
    for (const captureCase of component.captureCases ?? []) {
      captureCaseById.set(captureCase.id, captureCase);
    }
  }
  const journeyById = new Map(
    crossComponentJourneys.map((journey) => [journey.id, journey]),
  );
  const knownRouteIds = new Set(
    (routesManifest.routes ?? []).map((route) => route.id),
  );
  const criticalCaptureCaseIds = new Set();
  const criticalJourneyIds = new Set();
  const fullTupleRecords = [];
  const distinctCriticalScopeAxisKeys = new Set();
  const globalAxisDomains = {
    theme: manifest.globalAxes?.theme ?? [],
    density: manifest.globalAxes?.density ?? [],
    motion: manifest.globalAxes?.motion ?? [],
    contrastMode: manifest.globalAxes?.contrastMode ?? [],
    permissionProfile: manifest.globalAxes?.permissions ?? [],
  };
  const fullRunsPerUnit =
    5 *
    Object.values(globalAxisDomains).reduce(
      (product, domain) => product * domain.length,
      1,
    );
  for (const scope of fullCartesian?.scopes ?? []) {
    if (scope.routeIds?.some((routeId) => !knownRouteIds.has(routeId))) {
      errors.push(
        `${scope.id}: kritieke testas verwijst naar onbekende route.`,
      );
    }
    let derivedScopeRuns = 0;
    const distinctScopeAxisKeys = new Set();
    for (const unit of scope.executionUnits ?? []) {
      const profileIds =
        axisCoverage?.viewportZoomProfileSets?.[unit.viewportZoomProfileSet] ??
        [];
      if (unit.type === "capture-case") {
        const captureCase = captureCaseById.get(unit.id);
        if (
          !captureCase ||
          captureCase.viewport !== unit.viewportZoomProfileSet ||
          criticalCaptureCaseIds.has(unit.id)
        ) {
          errors.push(
            `${scope.id}/${unit.id}: kritieke capturecase is onbekend, dubbel of aan de verkeerde viewportset gebonden.`,
          );
        }
        criticalCaptureCaseIds.add(unit.id);
      } else if (unit.type === "cross-component-journey") {
        if (
          !journeyById.has(unit.id) ||
          unit.viewportZoomProfileSet !== "mobile" ||
          criticalJourneyIds.has(unit.id)
        ) {
          errors.push(
            `${scope.id}/${unit.id}: kritieke journey is onbekend, dubbel of aan de verkeerde viewportset gebonden.`,
          );
        }
        criticalJourneyIds.add(unit.id);
      } else {
        errors.push(
          `${scope.id}/${unit.id}: onbekend kritisch execution-unit-type.`,
        );
      }
      derivedScopeRuns +=
        profileIds.length *
        Object.values(globalAxisDomains).reduce(
          (product, domain) => product * domain.length,
          1,
        );
      for (const viewportZoomProfile of profileIds) {
        for (const theme of globalAxisDomains.theme) {
          for (const density of globalAxisDomains.density) {
            for (const motion of globalAxisDomains.motion) {
              for (const contrastMode of globalAxisDomains.contrastMode) {
                for (const permissionProfile of globalAxisDomains.permissionProfile) {
                  const distinctScopeAxisKey = JSON.stringify([
                    scope.id,
                    viewportZoomProfile,
                    theme,
                    density,
                    motion,
                    contrastMode,
                    permissionProfile,
                  ]);
                  distinctScopeAxisKeys.add(distinctScopeAxisKey);
                  distinctCriticalScopeAxisKeys.add(distinctScopeAxisKey);
                  fullTupleRecords.push(
                    JSON.stringify([
                      scope.id,
                      unit.type,
                      unit.id,
                      viewportZoomProfile,
                      theme,
                      density,
                      motion,
                      contrastMode,
                      permissionProfile,
                    ]),
                  );
                }
              }
            }
          }
        }
      }
    }
    if (scope.derivedRunCount !== derivedScopeRuns) {
      errors.push(
        `${scope.id}: afgeleid kritisch kruisproduct wijkt af van ${derivedScopeRuns} runs.`,
      );
    }
    if (
      scope.derivedDistinctAxisCombinationCount !== 2268 ||
      distinctScopeAxisKeys.size !== 2268
    ) {
      errors.push(
        `${scope.id}: volledig kruisproduct mist een viewport-/zoom-, theme-, density-, motion-, contrast- of permissioncombinatie.`,
      );
    }
  }
  const fullTupleDigest = createHash("sha256")
    .update(fullTupleRecords.join("\n"))
    .digest("hex");
  if (
    fullRunsPerUnit !== 1260 ||
    fullTupleRecords.length !== 32760 ||
    distinctCriticalScopeAxisKeys.size !== 9072 ||
    fullCartesian?.derivedDistinctScopeAxisCombinationCount !==
      distinctCriticalScopeAxisKeys.size ||
    fullCartesian?.derivedRunCount !== fullTupleRecords.length ||
    fullCartesian?.derivedTupleSetSha256 !== fullTupleDigest
  ) {
    errors.push(
      "Volledige kritieke kruisproduct mist minimaal één concrete testascombinatie of heeft een onjuiste tuple-digest.",
    );
  }

  const pairwise = axisCoverage?.remainingCasePairwise;
  const expectedPairwiseShape = {
    algorithm: "ordered-axis-pair-closure-v1",
    appliesTo: "every-component-capture-case-not-bound-to-a-critical-scope",
    axisPairIteration:
      "axisOrder left-to-right; for every unordered axis pair enumerate left values then right values in declared order",
    otherAxisIndexFormula:
      "(leftValueIndex*17 + rightValueIndex*31 + leftAxisIndex*7 + rightAxisIndex*11 + currentAxisIndex*13 + pairOrdinal) modulo currentAxisDomainLength",
    deduplicationKey: "axis values joined in axisOrder with U+007C",
    baselineSeed: {
      mode: "one-row-per-applicable-viewport-zoom-profile",
      theme: "canonical-light",
      density: "comfortable",
      motion: "no-preference",
      contrastMode: "normal",
      permissionProfile: "allowed",
    },
    requiredPairCoverage:
      "every-value-pair-for-every-unordered-axis-pair-per-case",
  };
  const actualPairwiseShape = {
    algorithm: pairwise?.algorithm,
    appliesTo: pairwise?.appliesTo,
    axisPairIteration: pairwise?.axisPairIteration,
    otherAxisIndexFormula: pairwise?.otherAxisIndexFormula,
    deduplicationKey: pairwise?.deduplicationKey,
    baselineSeed: pairwise?.baselineSeed,
    requiredPairCoverage: pairwise?.requiredPairCoverage,
  };
  if (
    JSON.stringify(actualPairwiseShape) !==
    JSON.stringify(expectedPairwiseShape)
  ) {
    errors.push(
      "Component-statecontract mist het exacte deterministische pairwise-algoritme.",
    );
  }

  function generatePairwiseRows(captureCase) {
    const axisDomains = {
      viewportZoomProfile:
        axisCoverage?.viewportZoomProfileSets?.[captureCase.viewport] ?? [],
      ...globalAxisDomains,
    };
    const rowsByKey = new Map();
    const addRow = (row) => {
      rowsByKey.set(expectedAxisOrder.map((axis) => row[axis]).join("|"), row);
    };
    for (const viewportZoomProfile of axisDomains.viewportZoomProfile) {
      addRow({
        viewportZoomProfile,
        theme: pairwise?.baselineSeed?.theme,
        density: pairwise?.baselineSeed?.density,
        motion: pairwise?.baselineSeed?.motion,
        contrastMode: pairwise?.baselineSeed?.contrastMode,
        permissionProfile: pairwise?.baselineSeed?.permissionProfile,
      });
    }
    for (
      let leftAxisIndex = 0;
      leftAxisIndex < expectedAxisOrder.length;
      leftAxisIndex += 1
    ) {
      for (
        let rightAxisIndex = leftAxisIndex + 1;
        rightAxisIndex < expectedAxisOrder.length;
        rightAxisIndex += 1
      ) {
        const leftAxis = expectedAxisOrder[leftAxisIndex];
        const rightAxis = expectedAxisOrder[rightAxisIndex];
        let pairOrdinal = 0;
        for (
          let leftValueIndex = 0;
          leftValueIndex < axisDomains[leftAxis].length;
          leftValueIndex += 1
        ) {
          for (
            let rightValueIndex = 0;
            rightValueIndex < axisDomains[rightAxis].length;
            rightValueIndex += 1
          ) {
            const row = {};
            for (
              let currentAxisIndex = 0;
              currentAxisIndex < expectedAxisOrder.length;
              currentAxisIndex += 1
            ) {
              const currentAxis = expectedAxisOrder[currentAxisIndex];
              if (currentAxisIndex === leftAxisIndex) {
                row[currentAxis] = axisDomains[currentAxis][leftValueIndex];
              } else if (currentAxisIndex === rightAxisIndex) {
                row[currentAxis] = axisDomains[currentAxis][rightValueIndex];
              } else {
                const derivedIndex =
                  (leftValueIndex * 17 +
                    rightValueIndex * 31 +
                    leftAxisIndex * 7 +
                    rightAxisIndex * 11 +
                    currentAxisIndex * 13 +
                    pairOrdinal) %
                  axisDomains[currentAxis].length;
                row[currentAxis] = axisDomains[currentAxis][derivedIndex];
              }
            }
            addRow(row);
            pairOrdinal += 1;
          }
        }
      }
    }
    return { axisDomains, rows: [...rowsByKey.values()] };
  }

  const remainingCaptureCases = components
    .flatMap((component) => component.captureCases ?? [])
    .filter((captureCase) => !criticalCaptureCaseIds.has(captureCase.id));
  const pairwiseTupleRecords = [];
  let derivedPairCoverageAssertions = 0;
  for (const captureCase of remainingCaptureCases) {
    const { axisDomains, rows } = generatePairwiseRows(captureCase);
    let casePairCoverageAssertions = 0;
    for (
      let leftAxisIndex = 0;
      leftAxisIndex < expectedAxisOrder.length;
      leftAxisIndex += 1
    ) {
      for (
        let rightAxisIndex = leftAxisIndex + 1;
        rightAxisIndex < expectedAxisOrder.length;
        rightAxisIndex += 1
      ) {
        const leftAxis = expectedAxisOrder[leftAxisIndex];
        const rightAxis = expectedAxisOrder[rightAxisIndex];
        for (const leftValue of axisDomains[leftAxis]) {
          for (const rightValue of axisDomains[rightAxis]) {
            casePairCoverageAssertions += 1;
            if (
              !rows.some(
                (row) =>
                  row[leftAxis] === leftValue && row[rightAxis] === rightValue,
              )
            ) {
              errors.push(
                `${captureCase.id}: pairwise-matrix mist ${leftAxis}=${leftValue} × ${rightAxis}=${rightValue}.`,
              );
            }
          }
        }
      }
    }
    for (const viewportZoomProfile of axisDomains.viewportZoomProfile) {
      const seed = pairwise?.baselineSeed ?? {};
      if (
        !rows.some(
          (row) =>
            row.viewportZoomProfile === viewportZoomProfile &&
            row.theme === seed.theme &&
            row.density === seed.density &&
            row.motion === seed.motion &&
            row.contrastMode === seed.contrastMode &&
            row.permissionProfile === seed.permissionProfile,
        )
      ) {
        errors.push(
          `${captureCase.id}: pairwise-matrix mist canonieke viewport-/zoombaseline ${viewportZoomProfile}.`,
        );
      }
    }
    if (rows.length !== 182 || casePairCoverageAssertions !== 192) {
      errors.push(
        `${captureCase.id}: deterministische pairwise-matrix moet exact 182 runs en 192 paarasserties afleiden.`,
      );
    }
    derivedPairCoverageAssertions += casePairCoverageAssertions;
    for (const row of rows) {
      pairwiseTupleRecords.push(
        JSON.stringify([
          captureCase.id,
          ...expectedAxisOrder.map((axis) => row[axis]),
        ]),
      );
    }
  }
  const pairwiseTupleDigest = createHash("sha256")
    .update(pairwiseTupleRecords.join("\n"))
    .digest("hex");
  if (
    remainingCaptureCases.length !== 36 ||
    pairwise?.remainingComponentCaptureCaseCount !== 36 ||
    pairwise?.derivedRowsPerCase !== 182 ||
    pairwise?.derivedPairCoverageAssertionsPerCase !== 192 ||
    derivedPairCoverageAssertions !== 6912 ||
    pairwise?.derivedPairCoverageAssertionCount !==
      derivedPairCoverageAssertions ||
    pairwiseTupleRecords.length !== 6552 ||
    pairwise?.derivedRunCount !== pairwiseTupleRecords.length ||
    pairwise?.derivedTupleSetSha256 !== pairwiseTupleDigest
  ) {
    errors.push(
      "Deterministische pairwise-matrix voor de 36 overige cases is onvolledig of heeft een onjuiste tuple-digest.",
    );
  }

  const combinedTupleDigest = createHash("sha256")
    .update([...fullTupleRecords, ...pairwiseTupleRecords].join("\n"))
    .digest("hex");
  if (
    axisCoverage?.baseViewportZoomRunCount !== derivedExecutionCount ||
    axisCoverage?.derivedRequiredAxisRunCount !==
      fullTupleRecords.length + pairwiseTupleRecords.length ||
    axisCoverage?.derivedRequiredAxisRunCount !== 39312 ||
    axisCoverage?.derivedRequiredTupleSetSha256 !== combinedTupleDigest
  ) {
    errors.push(
      "Component-statecontract moet exact 39.312 verplichte asruns afleiden met de 300 viewport-/zoomruns als subset.",
    );
  }
}

const COMPONENT_STATE_OWNER_SOURCE_POLICY = new Map(
  Object.entries({
    "artifacts/backoffice/src/components/ui/accordion.tsx":
      "accordion-collapsible",
    "artifacts/backoffice/src/components/ui/alert-dialog.tsx": "alert-dialog",
    "artifacts/backoffice/src/components/ui/button.tsx": "button",
    "artifacts/backoffice/src/components/ui/canonical-page-skeletons.tsx":
      "loading",
    "artifacts/backoffice/src/components/ui/checkbox-adapter.tsx": "checkbox",
    "artifacts/backoffice/src/components/ui/checkbox.tsx": "checkbox",
    "artifacts/backoffice/src/components/ui/collapsible.tsx":
      "accordion-collapsible",
    "artifacts/backoffice/src/components/ui/combobox.tsx": "combobox",
    "artifacts/backoffice/src/components/ui/command.tsx": "command-palette",
    "artifacts/backoffice/src/components/ui/dialog.tsx": "dialog",
    "artifacts/backoffice/src/components/ui/drawer.tsx": "detail-sheet",
    "artifacts/backoffice/src/components/ui/dropdown-menu.tsx":
      "row-action-dropdown-menu",
    "artifacts/backoffice/src/components/ui/empty.tsx": "empty",
    "artifacts/backoffice/src/components/ui/fieldgrid-data-view.tsx":
      "data-view-row",
    "artifacts/backoffice/src/components/ui/input.tsx": "input",
    "artifacts/backoffice/src/components/ui/label.tsx": "label",
    "artifacts/backoffice/src/components/ui/popover.tsx": "popover",
    "artifacts/backoffice/src/components/ui/radio-group.tsx": "radio-group",
    "artifacts/backoffice/src/components/ui/select-adapter.tsx": "select",
    "artifacts/backoffice/src/components/ui/select.tsx": "select",
    "artifacts/backoffice/src/components/ui/sheet.tsx": "detail-sheet",
    "artifacts/backoffice/src/components/ui/skeleton.tsx": "loading",
    "artifacts/backoffice/src/components/ui/sonner.tsx": "toast",
    "artifacts/backoffice/src/components/ui/spinner.tsx": "loading",
    "artifacts/backoffice/src/components/ui/switch.tsx": "switch",
    "artifacts/backoffice/src/components/ui/tabs.tsx": "tabs",
    "artifacts/backoffice/src/components/ui/textarea.tsx": "textarea",
    "artifacts/backoffice/src/components/ui/time-range-field.tsx": "date-time",
    "artifacts/backoffice/src/components/ui/toast.tsx": "toast",
    "artifacts/backoffice/src/components/ui/tooltip.tsx": "tooltip",
    "artifacts/backoffice/src/components/tenant-ui/tenant-action-menu.tsx":
      "row-action-dropdown-menu",
    "artifacts/backoffice/src/components/tenant-ui/tenant-confirm-dialog.tsx":
      "alert-dialog",
    "artifacts/backoffice/src/components/tenant-ui/tenant-detail-drawer.tsx":
      "detail-sheet",
    "artifacts/backoffice/src/components/tenant-ui/tenant-detail-responsive-actions.tsx":
      "detail-sheet",
    "artifacts/backoffice/src/components/tenant-ui/tenant-filter-drawer.tsx":
      "filter-sheet",
  }),
);

const COMPONENT_COMPOSITE_SOURCE_POLICY = new Map(
  Object.entries({
    "artifacts/backoffice/src/components/ui/alert.tsx": {
      componentStateIds: ["toast", "error-summary"],
      routes: ["/"],
      contract:
        "Inline waarschuwing combineert de feedbackstatus en blijvende foutcontext van Toast en FormErrorSummary.",
    },
    "artifacts/backoffice/src/components/ui/avatar.tsx": {
      componentStateIds: ["data-view-row", "data-view-card"],
      routes: ["/customers"],
      contract:
        "Avatar, afbeelding en fallback zijn presentatiedelen van dezelfde row/card-entiteitsprojectie.",
    },
    "artifacts/backoffice/src/components/ui/badge.tsx": {
      componentStateIds: ["data-view-row", "data-view-card"],
      routes: ["/assignments"],
      contract:
        "Badge projecteert status in row en card zonder een zelfstandige interactieve lifecycle.",
    },
    "artifacts/backoffice/src/components/ui/breadcrumb.tsx": {
      componentStateIds: ["mobile-nav", "button"],
      routes: ["/customers/[id]"],
      contract:
        "Breadcrumb is een navigatiecompositie met gelabelde links en compacte buttongeometrie.",
    },
    "artifacts/backoffice/src/components/ui/bulk-action-bar.tsx": {
      componentStateIds: ["checkbox", "button", "data-view-row"],
      routes: ["/customers"],
      contract:
        "Bulkacties volgen selectie uit DataView-rijen en gebruiken canonieke checkbox- en buttonstates.",
    },
    "artifacts/backoffice/src/components/ui/button-group.tsx": {
      componentStateIds: ["button"],
      routes: ["/settings"],
      contract:
        "ButtonGroup groepeert Button-controls; alle interactiestates blijven eigendom van Button.",
    },
    "artifacts/backoffice/src/components/ui/card.tsx": {
      componentStateIds: ["data-view-card"],
      routes: ["/customers"],
      contract:
        "Card en zijn slots vormen de structurele onderlaag van de responsive DataView-card.",
    },
    "artifacts/backoffice/src/components/ui/context-menu.tsx": {
      componentStateIds: ["row-action-dropdown-menu"],
      routes: ["/customers"],
      contract:
        "ContextMenu deelt open/close, focus, item- en submenucontracten met het canonieke rijactiemenu.",
    },
    "artifacts/backoffice/src/components/ui/field.tsx": {
      componentStateIds: ["label", "input", "error-summary"],
      routes: ["/customers?create=1"],
      contract:
        "Field-slots componeren label, control, beschrijving en foutterugkoppeling zonder eigen mutatie.",
    },
    "artifacts/backoffice/src/components/ui/form-actions.tsx": {
      componentStateIds: ["button", "toast", "error-summary"],
      routes: ["/customers?create=1"],
      contract:
        "FormActions combineert submit/cancel-controls met pending, succes en foutfeedback.",
    },
    "artifacts/backoffice/src/components/ui/form-grid.tsx": {
      componentStateIds: ["label", "input"],
      routes: ["/customers?create=1"],
      contract:
        "FormGrid bepaalt alleen de responsive geometrie rond gelabelde controls.",
    },
    "artifacts/backoffice/src/components/ui/form-section.tsx": {
      componentStateIds: ["label", "input", "accordion-collapsible"],
      routes: ["/settings"],
      contract:
        "FormSection groepeert gelabelde velden en kan disclosuregedrag van Accordion/Collapsible toepassen.",
    },
    "artifacts/backoffice/src/components/ui/form.tsx": {
      componentStateIds: ["label", "input", "error-summary"],
      routes: ["/customers?create=1"],
      contract:
        "Form-slots verbinden label, control, beschrijving en fout met één toegankelijk validatiecontract.",
    },
    "artifacts/backoffice/src/components/ui/hover-card.tsx": {
      componentStateIds: ["popover", "tooltip"],
      routes: ["/customers"],
      contract:
        "HoverCard gebruikt dezelfde gethematiseerde floating-layer-, focus- en collisionregels als Popover/Tooltip.",
    },
    "artifacts/backoffice/src/components/ui/input-group.tsx": {
      componentStateIds: ["input", "button", "textarea"],
      routes: ["/customers?create=1"],
      contract:
        "InputGroup combineert controls en addons terwijl Input/Textarea/Button hun eigen states behouden.",
    },
    "artifacts/backoffice/src/components/ui/item.tsx": {
      componentStateIds: ["data-view-row", "data-view-card"],
      routes: ["/customers"],
      contract:
        "Item-slots vormen een generieke entiteitsprojectie die als DataView-row of -card wordt ingezet.",
    },
    "artifacts/backoffice/src/components/ui/kbd.tsx": {
      componentStateIds: ["command-palette", "tooltip"],
      routes: ["/"],
      contract:
        "Kbd visualiseert sneltoetsinstructies binnen CommandPalette en Tooltip zonder eigen inputstate.",
    },
    "artifacts/backoffice/src/components/ui/pagination.tsx": {
      componentStateIds: ["button", "data-view-row"],
      routes: ["/customers"],
      contract:
        "Pagination bestuurt de DataView met canonieke link/button-focus-, disabled- en current-page-states.",
    },
    "artifacts/backoffice/src/components/ui/progress.tsx": {
      componentStateIds: ["loading"],
      routes: ["/assignments"],
      contract:
        "Progress is determinate loadingfeedback en valt onder het Loading-statecontract.",
    },
    "artifacts/backoffice/src/components/ui/prompt-dialog.tsx": {
      componentStateIds: ["dialog", "input", "button", "error-summary"],
      routes: ["/settings"],
      contract:
        "PromptDialog composeert Dialog, gelabelde Input, acties en validatiefout zonder parallelle overlayregels.",
    },
    "artifacts/backoffice/src/components/ui/scroll-area.tsx": {
      componentStateIds: ["detail-sheet", "data-view-card"],
      routes: ["/customers/[id]"],
      contract:
        "ScrollArea levert begrensde contentscroll binnen detail-sheet en card zonder paginafocus te verliezen.",
    },
    "artifacts/backoffice/src/components/ui/separator.tsx": {
      componentStateIds: ["tabs", "accordion-collapsible"],
      routes: ["/settings"],
      contract:
        "Separator is een structureel, semantisch scheidingselement binnen disclosure- en tabcomposities.",
    },
    "artifacts/backoffice/src/components/ui/status-badge.tsx": {
      componentStateIds: ["data-view-row", "data-view-card"],
      routes: ["/customers"],
      contract:
        "StatusBadge projecteert dezelfde statusbetekenis in row en card met tekst én kleur.",
    },
    "artifacts/backoffice/src/components/ui/table.tsx": {
      componentStateIds: ["data-view-row"],
      routes: ["/customers"],
      contract:
        "Table en zijn semantische slots zijn de desktoponderlaag van de DataView-rowpresentatie.",
    },
    "artifacts/backoffice/src/components/ui/tag-input.tsx": {
      componentStateIds: ["input", "button", "error-summary"],
      routes: ["/settings"],
      contract:
        "TagInput composeert tekstinvoer en verwijderbuttons onder hetzelfde validatie- en targetcontract.",
    },
    "artifacts/backoffice/src/components/ui/toggle-group.tsx": {
      componentStateIds: ["radio-group", "button"],
      routes: ["/settings"],
      contract:
        "ToggleGroup projecteert enkelvoudige/meervoudige selectie via RadioGroup- en Button-interactiestates.",
    },
    "artifacts/backoffice/src/components/ui/toggle.tsx": {
      componentStateIds: ["button"],
      routes: ["/settings"],
      contract:
        "Toggle is een pressed/unpressed Button-compositie en erft target-, focus- en disabledstates.",
    },
    "artifacts/backoffice/src/components/ui/unsaved-changes-guard.tsx": {
      componentStateIds: ["alert-dialog", "button"],
      routes: ["/customers?create=1"],
      contract:
        "UnsavedChangesGuard presenteert verliesbevestiging uitsluitend via AlertDialog en canonieke acties.",
    },
    "artifacts/backoffice/src/components/tenant-ui/tenant-data-table.tsx": {
      componentStateIds: [
        "data-view-row",
        "data-view-card",
        "checkbox",
        "row-action-dropdown-menu",
      ],
      routes: ["/customers"],
      contract:
        "TenantDataTable composeert desktoprows, mobiele cards, selectie en rijacties uit één dataprojectie.",
    },
    "artifacts/backoffice/src/components/tenant-ui/tenant-detail-layout.tsx": {
      componentStateIds: ["detail-sheet", "tabs", "button"],
      routes: ["/customers/[id]"],
      contract:
        "TenantDetailLayout structureert dossierheader, secties en acties rond detail-, tab- en buttonstates.",
    },
    "artifacts/backoffice/src/components/tenant-ui/tenant-detail-section-nav.tsx":
      {
        componentStateIds: ["tabs", "button"],
        routes: ["/customers/[id]"],
        contract:
          "Sectienavigatie gebruikt tabsemantiek en gelabelde navigatiecontrols voor dossierankers.",
      },
    "artifacts/backoffice/src/components/tenant-ui/tenant-page-header.tsx": {
      componentStateIds: ["mobile-nav", "button"],
      routes: ["/customers"],
      contract:
        "TenantPageHeader combineert breadcrumb/context en primaire acties met responsive navigatiestates.",
    },
    "artifacts/backoffice/src/components/tenant-ui/tenant-page-shell.tsx": {
      componentStateIds: [
        "data-view-row",
        "data-view-card",
        "empty",
        "loading",
      ],
      routes: ["/customers"],
      contract:
        "TenantPageShell/Section bepaalt rustige paginageometrie rond data-, empty- en loadingstates.",
    },
    "artifacts/backoffice/src/components/tenant-ui/tenant-toolbar.tsx": {
      componentStateIds: ["input", "filter-sheet", "button"],
      routes: ["/customers"],
      contract:
        "TenantToolbar composeert zoeken, filters en acties met dezelfde desktop/mobile controls.",
    },
    "artifacts/backoffice/src/components/tenant-ui/tenant-workbench.tsx": {
      componentStateIds: [
        "data-view-row",
        "detail-sheet",
        "command-palette",
        "button",
      ],
      routes: ["/planning"],
      contract:
        "TenantWorkbench combineert commandbar, conflictstrip, werkpaneel en detailcontext zonder state te dupliceren.",
    },
  }),
);

export function expectedComponentSourceClassification(record) {
  if (record.exportKind === "type") {
    return {
      classification: "non-visual",
      nonVisualKind: "type",
      reason: `${record.exportName} is uitsluitend een compile-time ${record.declarationKind}; het exporteert geen runtime DOM, control of zichtbare state.`,
    };
  }
  if (/^use[A-Z]/u.test(record.exportName)) {
    return {
      classification: "non-visual",
      nonVisualKind: "helper",
      reason: `${record.exportName} is een state-/contexthelper zonder eigen DOM; de consumercomponenten bezitten de zichtbare states.`,
    };
  }
  if (/variants?$/iu.test(record.exportName)) {
    return {
      classification: "non-visual",
      nonVisualKind: "variant",
      reason: `${record.exportName} is een class-variantrecept zonder eigen DOM, bediening of focuslifecycle.`,
    };
  }
  const stateOwnerId = COMPONENT_STATE_OWNER_SOURCE_POLICY.get(
    record.sourcePath,
  );
  if (stateOwnerId) {
    return {
      classification: "state-owner",
      componentStateIds: [stateOwnerId],
    };
  }
  const composite = COMPONENT_COMPOSITE_SOURCE_POLICY.get(record.sourcePath);
  if (composite) {
    return {
      classification: "composite",
      componentStateIds: composite.componentStateIds,
      witness: {
        routes: composite.routes,
        contract: composite.contract,
      },
    };
  }
  return null;
}

export function validateComponentSourceCoverage(
  errors,
  root,
  manifest,
  componentStates,
  routesManifest,
) {
  const discovered = discoverComponentNamedExports(root);
  const entries = manifest.exports ?? [];
  const expectedKeys = discovered.map(
    (record) => `${record.sourcePath}#${record.exportName}`,
  );
  const declaredKeys = entries.map(
    (entry) => `${entry.sourcePath}#${entry.exportName}`,
  );
  const duplicateKeys = declaredKeys.filter(
    (key, index) => declaredKeys.indexOf(key) !== index,
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.name !== "Fieldflow Calm component source coverage" ||
    manifest.state !== "CONTRACTED" ||
    JSON.stringify(manifest.sourceRoots) !==
      JSON.stringify(COMPONENT_SOURCE_ROOTS) ||
    manifest.namedExportPolicy !==
      "Direct exported declarations and explicit named export specifiers are included; unnamed export-star declarations are excluded." ||
    manifest.exportCount !== discovered.length ||
    entries.length !== discovered.length
  ) {
    errors.push(
      "Component-sourcecoverage mist canonieke identiteit, bronroots of exportcount.",
    );
  }
  if (
    duplicateKeys.length > 0 ||
    new Set(expectedKeys).size !== expectedKeys.length
  ) {
    errors.push(
      `Component-sourcecoverage bevat dubbele exports: ${[...new Set(duplicateKeys)].join(", ") || "bron-AST"}.`,
    );
  }
  const expectedSet = new Set(expectedKeys);
  const declaredSet = new Set(declaredKeys);
  const missing = expectedKeys.filter((key) => !declaredSet.has(key));
  const stale = declaredKeys.filter((key) => !expectedSet.has(key));
  if (missing.length > 0 || stale.length > 0) {
    errors.push(
      `Component-sourcecoverage wijkt af van AST-regeneratie; missing=${missing.join(",") || "geen"}; stale=${stale.join(",") || "geen"}.`,
    );
  }

  const componentIds = new Set(
    (componentStates.components ?? []).map((component) => component.id),
  );
  const routes = new Set(
    (routesManifest.routes ?? []).map((route) => route.route),
  );
  const discoveredByKey = new Map(
    discovered.map((record) => [
      `${record.sourcePath}#${record.exportName}`,
      record,
    ]),
  );
  const classificationCounts = {
    "state-owner": 0,
    composite: 0,
    "non-visual": 0,
  };

  for (const entry of entries) {
    const key = `${entry.sourcePath}#${entry.exportName}`;
    const actual = discoveredByKey.get(key);
    if (!actual) continue;
    if (
      entry.exportKind !== actual.exportKind ||
      entry.declarationKind !== actual.declarationKind ||
      entry.via !== actual.via
    ) {
      errors.push(`${key}: AST-exportmetadata is stale of onjuist.`);
    }
    const expected = expectedComponentSourceClassification(actual);
    if (!expected) {
      errors.push(
        `${key}: export is niet geclassificeerd door het bronbeleid.`,
      );
      continue;
    }
    const { classification: expectedClassification, ...expectedContract } =
      expected;
    classificationCounts[entry.classification] =
      (classificationCounts[entry.classification] ?? 0) + 1;
    if (
      entry.classification !== expectedClassification ||
      JSON.stringify(entry.classificationContract) !==
        JSON.stringify(expectedContract)
    ) {
      errors.push(
        `${key}: export heeft een onjuiste of verhullende classificatie.`,
      );
      continue;
    }
    if (entry.classification === "state-owner") {
      if (
        entry.classificationContract.componentStateIds.length !== 1 ||
        !componentIds.has(entry.classificationContract.componentStateIds[0])
      ) {
        errors.push(
          `${key}: state-owner verwijst niet exact naar één state-ID.`,
        );
      }
    } else if (entry.classification === "composite") {
      const witness = entry.classificationContract.witness;
      if (
        !Array.isArray(entry.classificationContract.componentStateIds) ||
        entry.classificationContract.componentStateIds.length === 0 ||
        entry.classificationContract.componentStateIds.some(
          (id) => !componentIds.has(id),
        ) ||
        !Array.isArray(witness?.routes) ||
        witness.routes.length === 0 ||
        witness.routes.some(
          (route) => !routes.has(route.split(/[?#]/u, 1)[0]),
        ) ||
        !isNonEmptyString(witness?.contract)
      ) {
        errors.push(
          `${key}: composite mist state-, route- of contractreferenties.`,
        );
      }
    } else if (entry.classification === "non-visual") {
      if (
        !["type", "helper", "variant"].includes(
          entry.classificationContract.nonVisualKind,
        ) ||
        !isNonEmptyString(entry.classificationContract.reason)
      ) {
        errors.push(`${key}: non-visual export mist concrete reden.`);
      }
    } else {
      errors.push(`${key}: onbekende component-sourceclassificatie.`);
    }
  }
  if (
    JSON.stringify(manifest.classificationCounts) !==
    JSON.stringify(classificationCounts)
  ) {
    errors.push("Component-sourcecoverage classificationCounts zijn stale.");
  }
}

export function validateThemeDerivationReference(
  errors,
  packageRoot,
  { executeReference = true } = {},
) {
  const referencePath = resolve(packageRoot, "reference/theme-derivation.mjs");
  const referenceTestPath = resolve(
    packageRoot,
    "reference/theme-derivation.test.mjs",
  );
  const manifest = readJson(
    resolve(packageRoot, "manifests/theme-derivation.json"),
  );
  if (hashJson(manifest) !== THEME_DERIVATION_CONTENT_SHA256) {
    errors.push(
      "Theme-derivation-inhoudsdigest wijkt af; algoritme, fixtures of fail-closed contract zijn niet meer exact.",
    );
  }
  if (
    manifest.componentStateContract?.focus?.css !==
    "0 0 0 2px var(--ff-focus-ring-offset), 0 0 0 5px var(--ff-focus-ring)"
  ) {
    errors.push(
      "Theme-derivation moet exact de 2px offset plus 3px solid focusring gebruiken.",
    );
  }
  const appearance = manifest.appearanceResolutionContract;
  const assets = manifest.assetSelectionContract;
  const pwa = manifest.pwaInstallContract;
  const documentSnapshot = manifest.documentAppearanceSnapshotContract;
  const expectedAppearanceContext = [
    "host",
    "tenantId",
    "themeRevision",
    "entitlement",
    "canUseCustomBranding",
    "tenantThemeOverrideEnabled",
    "whiteLabelPresentationEnabled",
  ];
  if (
    appearance?.productionEntryPoint !== "resolveAppearance" ||
    JSON.stringify(appearance?.internalOnlyEntryPoints) !==
      JSON.stringify(["deriveTheme", "resolveTheme"]) ||
    JSON.stringify(appearance?.contextFieldOrder) !==
      JSON.stringify(expectedAppearanceContext) ||
    !appearance?.trustedContextSource?.includes("canonical host resolver") ||
    !appearance?.trustedContextSource?.includes("theme_revision") ||
    !appearance?.clientAuthority?.startsWith("none;") ||
    JSON.stringify(appearance?.effectiveAppearanceFields) !==
      JSON.stringify([
        "context",
        "contextSha256",
        "rawBrandThemeSha256",
        "assetModesSha256",
        "identity",
        "communication",
        "semanticOutput",
      ]) ||
    !appearance?.identityFields?.includes("logo{mode,url,storagePath}") ||
    !appearance?.communicationFields?.includes("emailSignature") ||
    !appearance?.atomicity?.includes("same verified appearanceSha256") ||
    !appearance?.mismatch?.includes("complete safe-platform fallback")
  ) {
    errors.push(
      "Theme-derivation mist de gesloten, contextgebonden en atomische resolveAppearance-productiegrens.",
    );
  }
  if (
    JSON.stringify(assets?.storageMigration?.modeColumns) !==
      JSON.stringify(["logo_mode", "favicon_mode", "splash_mode"]) ||
    JSON.stringify(assets?.storageMigration?.modeValues) !==
      JSON.stringify(["inherit", "asset", "none"]) ||
    assets?.storageMigration?.revisionColumn !==
      "theme_revision bigint NOT NULL DEFAULT 0" ||
    !assets?.storageMigration?.revisionRule?.includes(
      "increment exactly once",
    ) ||
    !assets?.resolution?.inherit?.includes("effective platform asset") ||
    !assets?.resolution?.asset?.includes("server-owned storage path") ||
    !assets?.resolution?.none?.includes(
      "force effective URL and storagePath to null",
    ) ||
    !assets?.forbidden?.includes("Never infer a mode")
  ) {
    errors.push(
      "Theme-derivation mist expliciete inherit/asset/none-opslag, monotone revision of veilige assetresolutie.",
    );
  }
  const coldStart = manifest.runtimePolicy?.nativeColdStartFallback;
  if (
    JSON.stringify(coldStart) !==
      JSON.stringify({
        nativeStatusBarBackground: "#F8FAFC",
        nativeStatusBarStyle: "Style.Dark",
        nativeSafeAreaBackground: "#F8FAFC",
        source: "fieldgrid-code-platform-fallback",
      }) ||
    !manifest.nativeRuntimeContract?.coldStart?.includes(
      "safePlatformFallback.rawBrandTheme",
    ) ||
    !manifest.nativeRuntimeContract?.cacheIsolation?.includes(
      "host + tenantId + themeRevision",
    )
  ) {
    errors.push(
      "Theme-derivation native cold-start- of tenantcachecontract wijkt af.",
    );
  }
  if (
    !hasExactKeys(pwa, [
      "manifest",
      "scope",
      "generatedAssets",
      "versioning",
      "staticAssetConflict",
      "serviceWorker",
      "responsiveEvidence",
    ]) ||
    pwa?.scope?.customer?.startUrl !== "/klant" ||
    pwa?.scope?.personnel?.startUrl !== "/personeel" ||
    !pwa?.versioning?.includes("themeRevision and appearanceSha256") ||
    !pwa?.serviceWorker?.includes("another host, tenant or revision") ||
    !pwa?.responsiveEvidence?.includes("320/390/768/1440") ||
    !pwa?.responsiveEvidence?.includes("all three asset modes")
  ) {
    errors.push(
      "Theme-derivation mist het host-/tenantgescopeerde responsive PWA-installatiecontract.",
    );
  }
  const requiredDocumentSnapshotFields = [
    "appearanceSha256",
    "effectiveContextSha256",
    "brandName",
    "platformAttributionName",
    "providerAttributionVisible",
    "logoOwnedStoragePath",
    "logoObjectVersion",
    "logoContentSha256",
    "logoMimeType",
    "logoByteLength",
    "pdfPalette.primaryColor",
    "pdfPalette.accentColor",
    "pdfPalette.textColor",
    "pdfPalette.mutedColor",
    "pdfPalette.surfaceColor",
    "documentFooterText",
    "issuedAt",
  ];
  if (
    requiredDocumentSnapshotFields.some(
      (field) => !documentSnapshot?.snapshotFields?.includes(field),
    ) ||
    !documentSnapshot?.readRule?.includes(
      "only from the stored document snapshot",
    ) ||
    !documentSnapshot?.readRule?.includes(
      "verifies contentSha256, MIME and byte length",
    ) ||
    !documentSnapshot?.assetRetention?.includes(
      "cannot be overwritten or deleted",
    ) ||
    !documentSnapshot?.legacyBackfill?.includes(
      "never lazily mutates on GET",
    ) ||
    !manifest.resolutionContract?.runtime?.includes("resolveAppearance") ||
    !manifest.resolutionContract?.atomicity?.includes(
      "one complete appearanceSha256",
    )
  ) {
    errors.push(
      "Theme-derivation mist een zelf-renderbare immutable documentappearance of volledige runtimefallback.",
    );
  }
  const referenceSource = readFileSync(referencePath, "utf8");
  const referenceTests = readFileSync(referenceTestPath, "utf8");
  for (const needle of [
    "export const APPEARANCE_CONTEXT_FIELDS",
    "export const APPEARANCE_ASSET_MODES",
    "export function appearanceContextSha256(",
    "export function appearanceAssetModesSha256(",
    "export function resolveAppearance(",
    "expectedRawBrandThemeSha256",
    "expectedAssetModesSha256",
    "identity: appearanceIdentity(",
    "communication: appearanceCommunication(",
    "semanticOutput: themeResult.semanticOutput",
  ]) {
    if (!referenceSource.includes(needle)) {
      errors.push(
        `Theme-referentie mist productieappearance-invariant: ${needle}.`,
      );
    }
  }
  for (const needle of [
    "complete appearance binds identity, assets, communication and semantics to trusted context",
    "context or raw-hash drift falls back as one complete appearance",
    "missing trusted raw or asset-mode integrity hashes cannot resolve",
    "explicit asset modes distinguish inherit, owned asset and clear",
  ]) {
    if (!referenceTests.includes(needle)) {
      errors.push(
        `Theme-referentietest mist adversarial appearancebewijs: ${needle}.`,
      );
    }
  }
  if (!executeReference) return;
  try {
    execFileSync(process.execPath, [referencePath, "--check"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const details = String(error?.stderr ?? error?.message ?? error)
      .trim()
      .split("\n")
      .slice(0, 3)
      .join(" | ");
    errors.push(
      `Theme-derivationreferentie of fixturehashes zijn ongeldig: ${details}`,
    );
  }
}

function routeReferenceExists(reference, knownRoutes) {
  if (reference === "*") return true;
  if (reference.endsWith("*")) {
    const prefix = reference.slice(0, -1);
    return [...knownRoutes].some((route) => route.startsWith(prefix));
  }
  return knownRoutes.has(reference);
}

function referenceMatchesRoute(reference, route) {
  if (reference === "*") return true;
  if (reference.endsWith("*")) {
    return route.startsWith(reference.slice(0, -1));
  }
  return reference === route;
}

export function validateAcceptance(errors, manifest, knownRoutes, root) {
  const requirements = manifest.requirements ?? [];
  const ids = new Set();
  const categoryCounts = new Map();
  const workPackages = new Set();
  const allowedStates = new Set(manifest.stateModel ?? []);

  if (
    hashJson(lifecycleIndependentContract(manifest, "requirements")) !==
    ACCEPTANCE_CONTRACT_SHA256
  ) {
    errors.push(
      "Acceptancecontract-inhoudsdigest wijkt af; alleen requirementstate en evidence mogen zonder contractherziening veranderen.",
    );
  }

  if (manifest.schemaVersion !== 1) {
    errors.push("acceptance.json schemaVersion moet 1 zijn.");
  }
  if (
    JSON.stringify(manifest.stateModel) !== JSON.stringify(ACCEPTANCE_STATES)
  ) {
    errors.push("Acceptance-statevolgorde wijkt af van het canonieke model.");
  }
  const evidenceContract = manifest.evidenceContract;
  if (
    evidenceContract?.schemaVersion !== 4 ||
    JSON.stringify(evidenceContract?.claimFields) !==
      JSON.stringify(["commit", "index", "releasedCommit"]) ||
    evidenceContract?.indexReferenceFormat !==
      "repository-relative-path#sha256=<64 lowercase hex>" ||
    evidenceContract?.indexSchema?.schemaVersion !== 2 ||
    JSON.stringify(evidenceContract?.indexSchema?.subjectBinding) !==
      JSON.stringify(["subjectId", "headCommit", "authorId", "verification"]) ||
    JSON.stringify(evidenceContract?.indexSchema?.codePathFields) !==
      JSON.stringify(["path", "blobSha256"]) ||
    JSON.stringify(evidenceContract?.indexSchema?.commandFields) !==
      JSON.stringify([
        "id",
        "verification",
        "command",
        "status=passed",
        "exitCode=0",
        "reportPath",
        "reportSha256",
      ]) ||
    JSON.stringify(evidenceContract?.indexSchema?.commandCatalog) !==
      JSON.stringify(EVIDENCE_COMMANDS) ||
    JSON.stringify(evidenceContract?.indexSchema?.artifactKinds) !==
      JSON.stringify(["runtime", "staging"]) ||
    JSON.stringify(evidenceContract?.indexSchema?.artifactFields) !==
      JSON.stringify([
        "path",
        "sha256",
        "mediaType=application/json",
        "reportKind",
      ]) ||
    JSON.stringify(evidenceContract?.indexSchema?.reportFields) !==
      JSON.stringify([
        "schemaVersion",
        "kind",
        "subjectId",
        "headCommit",
        "verification",
        "provenance",
        "coverage",
        "verificationMatrix",
        "assertions",
        "summary",
        "errors",
        "attachments",
      ]) ||
    JSON.stringify(evidenceContract?.indexSchema?.coverageFields) !==
      JSON.stringify([
        "routes",
        "themes",
        "viewports",
        "densities",
        "commandIds",
        "testIds",
      ]) ||
    JSON.stringify(evidenceContract?.indexSchema?.verificationMatrixFields) !==
      JSON.stringify([
        "manifestPath",
        "manifestSha256",
        "verificationPlanRootSha256",
        "requirement",
        "sharedMatrices",
      ]) ||
    JSON.stringify(
      evidenceContract?.indexSchema?.verificationMatrixRequirementFields,
    ) !==
      JSON.stringify([
        "requirementId",
        "tupleCount",
        "tupleIdStreamSha256",
        "tuplePayloadStreamSha256",
        "executedTupleCount",
        "passedTupleCount",
        "failedTupleCount=0",
        "skippedTupleCount=0",
        "notRunTupleCount=0",
        "shards",
      ]) ||
    JSON.stringify(
      evidenceContract?.indexSchema?.verificationMatrixSharedFields,
    ) !==
      JSON.stringify([
        "matrixId",
        "requirementIds",
        "tupleCount",
        "tupleIdStreamSha256",
        "tuplePayloadStreamSha256",
        "executedTupleCount",
        "passedTupleCount",
        "failedTupleCount=0",
        "skippedTupleCount=0",
        "notRunTupleCount=0",
        "shards",
      ]) ||
    JSON.stringify(
      evidenceContract?.indexSchema?.verificationMatrixShardFields,
    ) !==
      JSON.stringify([
        "ordinalStartInclusive",
        "ordinalEndExclusive",
        "tupleCount",
        "tupleIdStreamSha256",
        "tuplePayloadStreamSha256",
        "assertionReportPath",
        "assertionReportSha256",
      ]) ||
    JSON.stringify(
      evidenceContract?.indexSchema?.verificationMatrixAssertionReportFields,
    ) !==
      JSON.stringify([
        "schemaVersion",
        "subjectId",
        "matrixKind",
        "matrixId",
        "headCommit",
        "ordinalStartInclusive",
        "ordinalEndExclusive",
        "assertions",
        "attachments",
      ]) ||
    JSON.stringify(
      evidenceContract?.indexSchema?.verificationMatrixAssertionFields,
    ) !==
      JSON.stringify([
        "testId",
        "tupleId",
        "canonicalTuple",
        "status=passed",
        "assertionIds",
        "attachmentIds",
      ]) ||
    JSON.stringify(evidenceContract?.indexSchema?.errorChannels) !==
      JSON.stringify(EVIDENCE_ERROR_CHANNELS) ||
    JSON.stringify(evidenceContract?.indexSchema?.reviewerFields) !==
      JSON.stringify([
        "id",
        "role",
        "independent=true",
        "selfReview=false",
        "decision=APPROVED",
        "subjectId",
        "headCommit",
        "pullRequestNumber",
        "reviewId",
        "submittedAt",
      ]) ||
    JSON.stringify(evidenceContract?.indexSchema?.reviewerRoles) !==
      JSON.stringify([
        "functional-security",
        "visual-a11y",
        "product-design",
      ]) ||
    JSON.stringify(evidenceContract?.indexSchema?.forbiddenOutcomes) !==
      JSON.stringify(["manual", "NOT_RUN", "skipped"]) ||
    JSON.stringify(evidenceContract?.stateRequirements) !==
      JSON.stringify({
        IMPLEMENTED: ["commit", "index", "codePaths+blobSha256"],
        VERIFIED_LOCAL: [
          "typed requirement-bound commands passed with exitCode 0",
          "machine-readable runtime report+sha256+all root-bound requirement/shared-matrix tuples executed exactly once+zero failures/skips/notRun",
          "verified Git ancestry and successful GitHub Actions provenance",
          "one live independent exact-HEAD APPROVED GitHub review",
        ],
        VERIFIED_STAGING: [
          "machine-readable staging report+sha256+all root-bound requirement/shared-matrix tuples executed exactly once+zero failures/skips/notRun",
          "live functional-security exact-HEAD reviewer",
          "live visual-a11y exact-HEAD reviewer",
        ],
        RELEASED: [
          "releasedCommit equals implementation head",
          "live successful GitHub production deployment",
        ],
      })
  ) {
    errors.push("Acceptance-evidencecontract wijkt af van de gehashte index.");
  }
  if (
    JSON.stringify(manifest.evidenceDimensions?.densities) !==
    JSON.stringify(["compact", "comfortable", "spacious"])
  ) {
    errors.push("Acceptancecontract mist de drie density-evidenceassen.");
  }
  if (requirements.length !== EXPECTED_REQUIREMENT_COUNTS.total) {
    errors.push(
      `Acceptancecontract moet exact ${EXPECTED_REQUIREMENT_COUNTS.total} eisen bevatten, niet ${requirements.length}.`,
    );
  }

  for (const item of requirements) {
    if (!/^FFC-[A-Z0-9]+-\d{3}$/u.test(item.id ?? "") || ids.has(item.id)) {
      errors.push(`Ongeldige of dubbele acceptance-ID: ${item.id}`);
    }
    ids.add(item.id);
    if (!["P0", "P1"].includes(item.priority)) {
      errors.push(`${item.id}: priority moet P0 of P1 zijn.`);
    }
    if (!item.category || !item.requirement || !item.verification) {
      errors.push(`${item.id}: category/requirement/verification ontbreekt.`);
    }
    if (!/^W(?:0\d|1[0-4])$/u.test(item.workPackage ?? "")) {
      errors.push(`${item.id}: ongeldig workPackage ${item.workPackage}.`);
    }
    workPackages.add(item.workPackage);
    if (!allowedStates.has(item.state)) {
      errors.push(`${item.id}: onbekende acceptance-state ${item.state}.`);
    }
    for (const field of [
      "codePaths",
      "tests",
      "runtimeEvidence",
      "commit",
      "index",
      "stagingEvidence",
      "reviewers",
      "releasedCommit",
    ]) {
      if (Object.hasOwn(item, field)) {
        errors.push(`${item.id}: ${field} hoort genest onder evidence.`);
      }
    }
    errors.push(
      ...validateRequirementEvidence(item, { root, verifyFiles: true }),
    );
    if (!Array.isArray(item.routes) || item.routes.length === 0) {
      errors.push(`${item.id}: routes ontbreken.`);
    } else {
      for (const reference of item.routes) {
        if (!routeReferenceExists(reference, knownRoutes)) {
          errors.push(`${item.id}: onbekende routereferentie ${reference}.`);
        }
      }
    }
    if (!Array.isArray(item.themes) || item.themes.length === 0) {
      errors.push(`${item.id}: themes ontbreken.`);
    }
    if (
      JSON.stringify(item.densities) !==
      JSON.stringify(["compact", "comfortable", "spacious"])
    ) {
      errors.push(
        `${item.id}: compact/comfortable/spacious bewijsas ontbreekt.`,
      );
    }
    if (!Array.isArray(item.viewports) || item.viewports.length === 0) {
      errors.push(`${item.id}: viewports ontbreken.`);
    } else {
      for (const viewport of item.viewports) {
        if (!MANDATORY_VIEWPORTS.includes(viewport)) {
          errors.push(`${item.id}: onbekende viewport ${viewport}.`);
        }
      }
    }
    categoryCounts.set(
      item.category,
      (categoryCounts.get(item.category) ?? 0) + 1,
    );
  }

  for (const category of REQUIRED_ACCEPTANCE_CATEGORIES) {
    if (!categoryCounts.has(category)) {
      errors.push(`Acceptancecategorie ontbreekt: ${category}`);
    }
  }
  for (const id of REQUIRED_ACCEPTANCE_IDS) {
    if (!ids.has(id)) {
      errors.push(`Kritieke acceptance-eis ontbreekt: ${id}`);
    }
  }

  const brand013 = requirements.find((item) => item.id === "FFC-BRAND-013");
  const brand019 = requirements.find((item) => item.id === "FFC-BRAND-019");
  const requiredBrand019Themes = [
    "default",
    "light",
    "dark",
    "red",
    "yellow",
    "monochrome",
    "low-contrast",
  ];
  const requiredBrand019Surfaces = [
    "public-website",
    "personnel-capacitor-runtime-chrome",
    "native-android-build-assets",
  ];
  const requiredBrand019RuntimeCases = [
    "light theme resolves contrast-safe runtime chrome",
    "dark theme resolves contrast-safe runtime chrome",
    "low-contrast candidate is rejected without replacing the last safe effective theme",
    "cold start uses the hashed safe platform theme until a verified snapshot resolves",
    "corrupt cache, stale revision or hash mismatch falls back atomically to the hashed safe platform theme",
    "host+tenant+revision cache isolation passes tenant A to tenant B to tenant A without cross-tenant paint",
    "Capacitor StatusBar background, icon style and safe-area canvas switch as one atomic transition",
    "plugin-mock and Android emulator evidence record the same resolved native runtime tuple",
  ];
  if (
    !brand013?.requirement.includes("customer/personnel web portals") ||
    !brand013?.requirement.includes("published public website is excluded") ||
    !brand013?.requirement.includes("WebsiteTheme remains") ||
    /\bpublic portal\b/iu.test(brand013?.requirement ?? "")
  ) {
    errors.push(
      "FFC-BRAND-013 moet webportalen/PWA expliciet dekken en de gepubliceerde website uitsluiten.",
    );
  }
  if (
    brand019?.verification !==
      "unit+capacitor-plugin-mock+emulator+release-review" ||
    JSON.stringify(brand019?.themes) !==
      JSON.stringify(requiredBrand019Themes) ||
    JSON.stringify(brand019?.surfaces) !==
      JSON.stringify(requiredBrand019Surfaces) ||
    JSON.stringify(brand019?.runtimeCases) !==
      JSON.stringify(requiredBrand019RuntimeCases) ||
    !brand019?.requirement.includes("activate atomically") ||
    !brand019?.requirement.includes("host+tenant+revision") ||
    !brand019?.requirement.includes("hashed safe platform theme")
  ) {
    errors.push(
      "FFC-BRAND-019 mist het fail-closed native runtime-, cache-isolatie- of emulatorcontract.",
    );
  }
  const requiredRequirementPhrases = new Map([
    [
      "FFC-SRC-003",
      [
        "explicitly superseded by contracted P0/P1 remediations",
        "FFC-PB-004",
        "server-side tenant, permission, module and lifecycle enforcement",
      ],
    ],
    [
      "FFC-PB-004",
      [
        "One pure shared placement engine",
        "30–480 minutes",
        "sickness/leave/availability",
        "A blocker writes nothing",
      ],
    ],
    [
      "FFC-PB-008",
      [
        "transitions scheduled to plannable",
        "clears scheduledDate/start/end",
        "never changes actual timestamps",
      ],
    ],
    [
      "FFC-PB-013",
      [
        "tenant+actor+mutationId receipt",
        "request hash",
        "retries and restarts",
      ],
    ],
    [
      "FFC-PB-015",
      [
        "before/after record sets",
        "assignment/staffing/interest-response version maps",
        "fresh monotone lifecycle versions",
        "atomically",
      ],
    ],
    [
      "FFC-PB-016",
      [
        "server-derived tenantId/actorUserId",
        "deduplicates by tenantId+revision",
        "high-water mark",
        "applied revision reaches that high-water mark",
        "existing management realtime channel",
      ],
    ],
    [
      "FFC-PB-017",
      [
        "within at most 2000 ms",
        "receipt linearization timestamp",
        "share that hard budget",
      ],
    ],
    [
      "FFC-PB-029",
      ["Google Maps configuration", "enabled planning module", "server-side"],
    ],
    [
      "FFC-BRAND-009",
      ["Now indicator consume tenant brand tokens", "pastel categories"],
    ],
  ]);
  for (const [id, phrases] of requiredRequirementPhrases) {
    const requirement = requirements.find(
      (item) => item.id === id,
    )?.requirement;
    if (phrases.some((phrase) => !requirement?.includes(phrase))) {
      errors.push(
        `${id}: verplichte remediatie-/uitvoerbaarheidsdetails ontbreken.`,
      );
    }
  }
  const a11y010 = requirements.find((item) => item.id === "FFC-A11Y-010");
  if (
    JSON.stringify(a11y010?.themes) !==
    JSON.stringify([
      "default",
      "light",
      "dark",
      "red",
      "yellow",
      "monochrome",
      "low-contrast",
    ])
  ) {
    errors.push(
      "FFC-A11Y-010 moet alle zeven themeprofielen expliciet bewijzen.",
    );
  }
  for (const workPackage of REQUIRED_WORK_PACKAGES) {
    if (!workPackages.has(workPackage)) {
      errors.push(`Geen acceptance-eis gekoppeld aan ${workPackage}.`);
    }
  }

  const p0 = requirements.filter((item) => item.priority === "P0").length;
  const p1 = requirements.filter((item) => item.priority === "P1").length;
  if (
    p0 !== EXPECTED_REQUIREMENT_COUNTS.p0 ||
    p1 !== EXPECTED_REQUIREMENT_COUNTS.p1 ||
    manifest.counts?.requirements !== requirements.length ||
    manifest.counts?.p0 !== p0 ||
    manifest.counts?.p1 !== p1
  ) {
    errors.push("Acceptancecounts komen niet overeen met de items.");
  }
}

function validateRouteWorkPackageCoverage(errors, acceptance, routes) {
  for (const route of routes) {
    const coveredByOwner = (acceptance.requirements ?? []).some(
      (requirement) =>
        requirement.workPackage === route.workPackage &&
        requirement.routes?.some((reference) =>
          referenceMatchesRoute(reference, route.route),
        ),
    );
    if (!coveredByOwner) {
      errors.push(
        `${route.id}: geen route-eis gekoppeld aan eigenaar ${route.workPackage}.`,
      );
    }
  }
}

export function validateTokens(errors, tokens) {
  if (hashJson(tokens) !== TOKENS_CONTENT_SHA256) {
    errors.push(
      "Fieldflow token-inhoudsdigest wijkt af; spacing, geometrie, kleur of responsive waarden zijn niet meer exact.",
    );
  }
  if (tokens.schemaVersion !== 1 || tokens.name !== "Fieldflow Calm") {
    errors.push("Fieldflow tokenidentiteit/schema is ongeldig.");
  }
  if (
    tokens.prototype?.commit !== PROTOTYPE_COMMIT ||
    tokens.prototype?.variant !== "fieldflow"
  ) {
    errors.push(
      "Fieldflow tokenbron wijkt af van de vastgezette prototypecommit.",
    );
  }
  const canonicalFixture = tokens.canonicalVisualFixture;
  const fixtureHash = createHash("sha256")
    .update(JSON.stringify(canonicalFixture?.rawBrandTheme ?? null))
    .digest("hex");
  if (
    canonicalFixture?.id !== "fieldflow-calm-ci-v1" ||
    canonicalFixture?.scope !== "visual-ci-only" ||
    canonicalFixture?.rawBrandThemeSha256 !== fixtureHash ||
    fixtureHash !== CANONICAL_THEME_FIXTURE_SHA256
  ) {
    errors.push("Canonieke Fieldflow CI-themefixture/hash wijkt af.");
  }
  const mappedBrandFields = [
    "brandName",
    "platformName",
    "logoUrl",
    "logoStoragePath",
    "faviconUrl",
    "faviconStoragePath",
    "splashUrl",
    "splashStoragePath",
    "primaryColor",
    "secondaryColor",
    "accentColor",
    "backgroundColor",
    "surfaceColor",
    "textColor",
    "mutedColor",
    "sidebarBackgroundColor",
    "sidebarTextColor",
    "sidebarAccentColor",
    "fontFamily",
    "headingFontFamily",
    "borderRadius",
    "density",
    "emailFooterText",
    "emailSignature",
  ];
  if (
    JSON.stringify(Object.keys(canonicalFixture?.rawBrandTheme ?? {})) !==
      JSON.stringify(mappedBrandFields) ||
    mappedBrandFields.some(
      (field) => !Array.isArray(tokens.brandThemeMapping?.[field]),
    ) ||
    [
      "logoUrl",
      "logoStoragePath",
      "faviconUrl",
      "faviconStoragePath",
      "splashUrl",
      "splashStoragePath",
    ].some((field) => canonicalFixture?.rawBrandTheme?.[field] !== null)
  ) {
    errors.push("Raw BrandTheme naar Fieldflow-tokenmapping is onvolledig.");
  }
  if (
    JSON.stringify(tokens.spacing?.scalePx) !==
    JSON.stringify([4, 8, 12, 16, 20, 24, 28, 32, 40, 48])
  ) {
    errors.push("Spacing scale wijkt af van Fieldflow Calm.");
  }
  if (
    tokens.spacing?.sectionGapPx !== 30 ||
    tokens.spacing?.sectionGapMobilePx !== 22 ||
    tokens.spacing?.clusterGapPx !== 22 ||
    tokens.spacing?.clusterGapMobilePx !== 16 ||
    tokens.spacing?.panelPaddingPx !== 26 ||
    tokens.spacing?.pageGutterMobilePx !== 17 ||
    tokens.spacing?.panelPaddingMobilePx !== 18 ||
    tokens.spacing?.panelRadiusMobilePx !== 16 ||
    tokens.layout?.touchTargetMinPx !== 44
  ) {
    errors.push("Kerngeometry wijkt af van Fieldflow Calm.");
  }
  if (
    JSON.stringify(tokens.responsive?.ranges) !==
      JSON.stringify({
        phone: { minPx: 320, maxPx: 560 },
        tabletPortrait: { minPx: 561, maxPx: 860 },
        compactDesktop: { minPx: 861, maxPx: 1180 },
        desktop: { minPx: 1181, maxPx: 1919 },
        wide: { minPx: 1920 },
      }) ||
    JSON.stringify(tokens.responsive?.mandatoryEvidenceWidthsPx) !==
      JSON.stringify(MANDATORY_VIEWPORTS) ||
    !tokens.responsive?.rules?.phoneAndTabletPortrait?.includes(
      "planboard renders queue cards before the agenda and Plan or Move opens the non-drag wizard; timeline renders only after the explicit Timeline toggle",
    ) ||
    !tokens.responsive?.rules?.compactDesktop?.includes(
      "planboard keeps queue closed in a side Sheet and renders one named locally scrollable canvas",
    ) ||
    tokens.planboard?.dragEnabledAtMinWidthPx !== 861 ||
    JSON.stringify(tokens.planboard?.mobile) !==
      JSON.stringify({
        rangeMaxPx: 860,
        default: "queue-before-agenda",
        alternate: "explicit-toggle-keyboard-timeline",
        nonDragAlternativeRequired: true,
        actions: [
          "plan",
          "move",
          "replace employee",
          "set exact date and time",
          "unassign one employee",
          "release whole assignment",
          "confirm",
          "cancel",
          "undo",
        ],
      })
  ) {
    errors.push(
      "Responsive contract mist deterministische ranges, mobiele spacing of planboard non-drag/timelinegedrag.",
    );
  }
  if (
    tokens.colors?.rules?.focusRingWidthPx !== 3 ||
    tokens.colors?.rules?.focusRingOffsetPx !== 2 ||
    tokens.shadows?.focus !==
      "0 0 0 2px var(--ff-focus-ring-offset), 0 0 0 5px var(--ff-focus-ring)" ||
    tokens.typography?.body?.basePx !== 16 ||
    tokens.typography?.body?.lineHeight !== 1.45 ||
    JSON.stringify(tokens.typography?.body?.canonicalStack) !==
      JSON.stringify(["Aptos", "Segoe UI Variable", "Segoe UI", "sans-serif"])
  ) {
    errors.push("Canonieke Fieldflow-typografie/focusgeometry wijkt af.");
  }
  if (
    tokens.typography?.pageTitle?.desktopWeight !== 620 ||
    tokens.typography?.pageTitle?.desktopLetterSpacingEm !== -0.045 ||
    tokens.typography?.pageTitle?.desktopLineHeight !== 1.03 ||
    tokens.typography?.pageTitle?.mobilePx !== 32 ||
    tokens.typography?.pageTitle?.mobileLineHeight !== 1.05 ||
    tokens.components?.input?.horizontalPaddingPx !== 14
  ) {
    errors.push("Page-title- of inputgeometry wijkt af van de prototypebron.");
  }
  if (
    tokens.layout?.sidebarWidthByRangePx?.compactDesktop861To1180 !== 228 ||
    tokens.layout?.sidebarWidthByRangePx?.desktop1181To1460 !== 228 ||
    tokens.layout?.sidebarWidthByRangePx?.desktop1461To1919 !== 252 ||
    tokens.layout?.sidebarWidthByRangePx?.wide1920Plus !== 252
  ) {
    errors.push("Sidebarbreedte per Fieldflow-breakpoint wijkt af.");
  }
  if (
    tokens.layout?.mobileHeaderPx !== 66 ||
    tokens.layout?.compactContentBreakMaxPx !== 1100 ||
    tokens.layout?.headingMinHeightPx !== 170 ||
    tokens.layout?.headingMinHeightCompactPx !== 204 ||
    tokens.layout?.headingRowGapCompactPx !== 20 ||
    tokens.layout?.headingMinHeightMobilePx !== 148 ||
    tokens.layout?.headingPaddingTopMobilePx !== 31 ||
    tokens.layout?.headingPaddingBottomMobilePx !== 25 ||
    tokens.layout?.metricCardMinHeightMobilePx !== 132 ||
    tokens.layout?.toolbarMinHeightCompactPx !== 116 ||
    tokens.layout?.toolbarRowGapCompactPx !== 10 ||
    tokens.layout?.toolbarColumnGapCompactPx !== 14
  ) {
    errors.push(
      "Desktop/compact/mobile responsive geometry wijkt af van Fieldflow Calm.",
    );
  }
  if (
    JSON.stringify(tokens.responsive?.mandatoryEvidenceWidthsPx) !==
    JSON.stringify(MANDATORY_VIEWPORTS)
  ) {
    errors.push("Verplichte responsive viewports zijn onvolledig.");
  }
  if (
    tokens.planboard?.snapMinutes !== 15 ||
    tokens.planboard?.axes?.horizontal !== "hours" ||
    tokens.planboard?.axes?.vertical !== "employees" ||
    tokens.planboard?.queueCardMinHeightPx !== 142 ||
    tokens.planboard?.compactQueueCardMinHeightPx !== 128 ||
    tokens.planboard?.visibleHourCount !== 11 ||
    tokens.planboard?.referenceTimeCanvasWidthPx !== 1032 ||
    Math.abs(tokens.planboard?.referenceHourWidthPx - 1032 / 11) > 1e-9 ||
    tokens.planboard?.defaultHourWidthPx !==
      tokens.planboard?.referenceHourWidthPx ||
    JSON.stringify(tokens.planboard?.userZoomHourWidthsPx) !==
      JSON.stringify({ compact: 56, normal: 80, detail: 120 })
  ) {
    errors.push("Planbordas of raster wijkt af van Fieldflow Calm.");
  }
  for (const flow of ["queue-to-board", "board-to-board", "board-to-queue"]) {
    if (!tokens.planboard?.dragFlows?.includes(flow)) {
      errors.push(`Planbordflow ontbreekt: ${flow}`);
    }
  }
  if (
    JSON.stringify(Object.keys(tokens.colors?.semantic ?? {})) !==
    JSON.stringify(REQUIRED_SEMANTIC_ROLES)
  ) {
    errors.push(
      "Vaste status-, lock-, live-, conflict- en priorityrollen ontbreken.",
    );
  }
  for (const [name, colors] of Object.entries(tokens.colors?.semantic ?? {})) {
    for (const field of ["background", "border", "foreground", "icon"]) {
      if (!/^#[0-9a-f]{6}$/iu.test(colors?.[field] ?? "")) {
        errors.push(`Semantisch kleurenpaar ${name}.${field} ontbreekt.`);
      }
    }
    if (contrastRatio(colors.foreground, colors.background) < 4.5) {
      errors.push(`Semantische tekstkleur ${name} haalt geen 4.5:1.`);
    }
    if (contrastRatio(colors.icon, colors.background) < 3) {
      errors.push(`Semantische icoonkleur ${name} haalt geen 3:1.`);
    }
    if (contrastRatio(colors.border, colors.background) < 3) {
      errors.push(`Semantische randkleur ${name} haalt geen 3:1.`);
    }
  }
  const canonical = tokens.colors?.canonical;
  for (const background of [
    canonical?.muted,
    canonical?.background,
    canonical?.appBackground,
    canonical?.card,
  ]) {
    if (contrastRatio(canonical?.mutedForeground, background) < 4.5) {
      errors.push(
        "Canonieke muted tekst haalt niet op elk toegestaan oppervlak 4.5:1.",
      );
    }
  }
  for (const [foreground, background, label, threshold] of [
    [canonical?.primaryForeground, canonical?.primary, "primary", 4.5],
    [canonical?.secondaryForeground, canonical?.secondary, "secondary", 4.5],
    [canonical?.accentForeground, canonical?.accent, "accent", 4.5],
    [canonical?.foreground, canonical?.background, "canvas", 4.5],
    [canonical?.text, canonical?.card, "surface", 4.5],
    [canonical?.input, canonical?.card, "input-boundary", 3],
    [canonical?.ring, canonical?.card, "focus-ring", 3],
  ]) {
    if (contrastRatio(foreground, background) < threshold) {
      errors.push(`Canoniek kleurenpaar ${label} haalt ${threshold}:1 niet.`);
    }
  }
  const canonicalSidebarActive = {
    sidebarActiveBackground: "#D9F6E8",
    sidebarActiveHover: "#D9F6E8",
    sidebarActiveText: "#083F35",
    sidebarActiveHoverText: "#083F35",
    sidebarActiveIndicator: "#25B77F",
    sidebarActiveIndicatorHover: "#25B77F",
  };
  if (
    Object.entries(canonicalSidebarActive).some(
      ([field, value]) => canonical?.[field] !== value,
    ) ||
    contrastRatio(
      canonical?.sidebarActiveText,
      canonical?.sidebarActiveBackground,
    ) < 4.5 ||
    contrastRatio(
      canonical?.sidebarActiveHoverText,
      canonical?.sidebarActiveHover,
    ) < 4.5 ||
    [
      canonical?.sidebarBackgroundStart,
      canonical?.sidebarBackgroundMid,
      canonical?.sidebarBackgroundEnd,
    ].some(
      (background) =>
        contrastRatio(canonical?.sidebarActiveBackground, background) < 3 ||
        contrastRatio(canonical?.sidebarActiveHover, background) < 3 ||
        contrastRatio(canonical?.sidebarActiveIndicator, background) < 3 ||
        contrastRatio(canonical?.sidebarActiveIndicatorHover, background) < 3,
    )
  ) {
    errors.push(
      "Canonieke actieve navigatie wijkt af van prototype/contrastcontract.",
    );
  }
  const requiredPlanboardColors = [
    "mint",
    "blue",
    "aqua",
    "peach",
    "yellow",
    "rose",
    "lilac",
    "orange",
  ];
  for (const name of requiredPlanboardColors) {
    const colors = tokens.planboard?.palette?.[name];
    if (
      !colors ||
      contrastRatio(colors.foreground, colors.background) < 4.5 ||
      contrastRatio(colors.border, colors.background) < 3
    ) {
      errors.push(`Planbordpalet ${name} haalt het contrastcontract niet.`);
    }
  }
  if (
    !tokens.customizationBoundary?.tenantControlled?.length ||
    !tokens.customizationBoundary?.structurallyFixed?.length
  ) {
    errors.push("Tenant customization boundary ontbreekt.");
  }
  const density = tokens.density;
  const expectedDensityAxisFields = {
    componentInternalGap: [
      "buttonGapPx",
      "sheetBodyGapPx",
      "sheetFieldsetGapPx",
      "dialogFieldColumnGapPx",
      "dialogFieldRowGapPx",
      "dossierHeroGapPx",
      "miniCardGapPx",
    ],
    controlHeight: ["controlHeightPx"],
    tableRowMinHeight: ["tableRowMinHeightPx"],
    planboardGeometry: [
      "rowHeightPx",
      "blockHeightPx",
      "blockTopPx",
      "queueCardMinHeightPx",
    ],
  };
  const expectedDensityVariants = {
    compact: {
      componentInternalGapPx: {
        buttonGapPx: 7,
        sheetBodyGapPx: 21,
        sheetFieldsetGapPx: 14,
        dialogFieldColumnGapPx: 19,
        dialogFieldRowGapPx: 21,
        dossierHeroGapPx: 23,
        miniCardGapPx: 12,
      },
      controlHeightPx: 44,
      minimumPointerTargetPx: 44,
      tableRowMinHeightPx: 68,
      planboardGeometryPx: {
        rowHeightPx: 78,
        blockHeightPx: 58,
        blockTopPx: 10,
        queueCardMinHeightPx: 128,
      },
    },
    comfortable: {
      componentInternalGapPx: {
        buttonGapPx: 8,
        sheetBodyGapPx: 23,
        sheetFieldsetGapPx: 15,
        dialogFieldColumnGapPx: 21,
        dialogFieldRowGapPx: 23,
        dossierHeroGapPx: 25,
        miniCardGapPx: 13,
      },
      controlHeightPx: 44,
      minimumPointerTargetPx: 44,
      tableRowMinHeightPx: 74,
      planboardGeometryPx: {
        rowHeightPx: 98,
        blockHeightPx: 70,
        blockTopPx: 14,
        queueCardMinHeightPx: 142,
      },
    },
    spacious: {
      componentInternalGapPx: {
        buttonGapPx: 9,
        sheetBodyGapPx: 25,
        sheetFieldsetGapPx: 16,
        dialogFieldColumnGapPx: 23,
        dialogFieldRowGapPx: 25,
        dossierHeroGapPx: 27,
        miniCardGapPx: 14,
      },
      controlHeightPx: 48,
      minimumPointerTargetPx: 44,
      tableRowMinHeightPx: 82,
      planboardGeometryPx: {
        rowHeightPx: 108,
        blockHeightPx: 78,
        blockTopPx: 15,
        queueCardMinHeightPx: 156,
      },
    },
  };
  if (
    density?.canonical !== "comfortable" ||
    JSON.stringify(density?.geometryAxes) !==
      JSON.stringify([
        "componentInternalGap",
        "controlHeight",
        "tableRowMinHeight",
        "planboardGeometry",
      ]) ||
    JSON.stringify(density?.axisFields) !==
      JSON.stringify(expectedDensityAxisFields) ||
    JSON.stringify(density?.fixedAcrossDensities) !==
      JSON.stringify([
        "pageGutter",
        "sectionGap",
        "clusterGap",
        "responsiveBreakpoints",
        "minimumPointerTarget",
        "informationHierarchy",
      ]) ||
    !isNonEmptyString(density?.resolutionRule) ||
    JSON.stringify(density?.variants) !==
      JSON.stringify(expectedDensityVariants)
  ) {
    errors.push(
      "Density wijkt af van de benoemde, toegankelijke geometry-assen.",
    );
  }
}

function validateVisualEvidence(errors, packageRoot, manifest) {
  const visualRoot = resolve(packageRoot, "evidence/visual");
  const declaredFiles = new Set();
  if (
    manifest.capturedFrom?.prototypeCommit !== PROTOTYPE_COMMIT ||
    manifest.capturedFrom?.variant !== "fieldflow"
  ) {
    errors.push("Visuele bron wijkt af van de vastgezette prototypecommit.");
  }
  const normalization = manifest.referenceNormalization;
  const canonicalTheme = normalization?.canonicalThemeStylesheet;
  const canonicalThemePath = resolve(visualRoot, canonicalTheme?.file ?? "");
  if (
    manifest.pixelBaselineReady !== false ||
    manifest.normalizedCaptureContract !== "capture-contract.json" ||
    normalization?.rawCapturesMayIncludeLabChromeOrStaleDemoState !== true ||
    normalization?.labChromeHeightPx?.desktop !== 64 ||
    normalization?.labChromeHeightPx?.mobileMax860 !== 52 ||
    normalization?.implementationMustNotRenderLabChrome !== true ||
    normalization?.normalizedBaselineRequiredBeforePixelGate !== true ||
    canonicalTheme?.file !== "canonical-theme.css" ||
    canonicalTheme?.sha256 !== CANONICAL_THEME_STYLESHEET_SHA256 ||
    canonicalTheme?.fixtureId !== "default" ||
    canonicalTheme?.expectedSemanticOutputSha256 !==
      CANONICAL_THEME_SEMANTIC_SHA256 ||
    canonicalTheme?.expectedResolutionSha256 !==
      CANONICAL_THEME_RESOLUTION_SHA256 ||
    !existsSync(canonicalThemePath) ||
    hashFile(canonicalThemePath) !== CANONICAL_THEME_STYLESHEET_SHA256 ||
    normalization?.referenceStylesheet?.file !==
      "reference-normalization.css" ||
    normalization?.referenceStylesheet?.sha256 !==
      REFERENCE_NORMALIZATION_SHA256 ||
    normalization?.approvedAccessibilityDelta?.length !== 3 ||
    !normalization?.prototypeOnlyElements?.includes(".lab-bar") ||
    !normalization?.prototypeOnlyElements?.includes(".concept-caption")
  ) {
    errors.push(
      "Normalisatiecontract voor prototype-only labchrome ontbreekt.",
    );
  }
  for (const item of manifest.files ?? []) {
    declaredFiles.add(item.file);
    const path = resolve(visualRoot, item.file);
    if (!existsSync(path)) {
      errors.push(`Visuele referentie ontbreekt: ${item.file}`);
      continue;
    }
    if (hashFile(path) !== item.sha256) {
      errors.push(`Hash wijkt af voor visuele referentie: ${item.file}`);
    }
    try {
      const dimensions = readPngDimensions(path);
      if (
        dimensions.width !== item.width ||
        dimensions.height !== item.height
      ) {
        errors.push(`Afmetingen wijken af voor ${item.file}.`);
      }
    } catch (error) {
      errors.push(String(error));
    }
  }
  const actualPngs = readdirSync(visualRoot)
    .filter((file) => file.endsWith(".png"))
    .sort();
  if (actualPngs.length !== 9) {
    errors.push(`Er moeten 9 visuele anchors zijn, niet ${actualPngs.length}.`);
  }
  for (const file of actualPngs) {
    if (!declaredFiles.has(file)) {
      errors.push(`PNG ontbreekt in visual manifest: ${file}`);
    }
  }
  if ((manifest.files ?? []).length !== actualPngs.length) {
    errors.push("Visual manifest en PNG-count verschillen.");
  }
}

function hasExactObjectKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

function captureDriverBinding(contract) {
  return {
    engine: contract.setupDriver?.engine,
    playwrightVersion: contract.environment?.playwrightVersion,
    browserName: contract.environment?.browser?.name,
    browserRevision: contract.environment?.browser?.playwrightRevision,
    browserVersion: contract.environment?.browser?.version,
  };
}

function captureViewportBinding(contract, scenario) {
  const viewport = contract.viewports?.[scenario?.viewport];
  return {
    id: scenario?.viewport,
    width: viewport?.width,
    height: viewport?.height,
    deviceScaleFactor: contract.environment?.deviceScaleFactor,
  };
}

function captureReferenceMode(scenario) {
  return scenario?.viewport === "mobile"
    ? "mobile-responsive-contract"
    : "desktop-canonical-pixel";
}

function expectedMobileEvidenceAssertions(contract, scenario) {
  const gate = contract.normalization?.responsiveContractGate;
  const claims = [
    ...(gate?.transformsByPattern?.[scenario.pattern]?.assertions ?? []),
    ...(gate?.accessibilityAssertions ?? []),
  ];
  return claims.map((claim, index) => ({
    id: `responsive-${String(index + 1).padStart(2, "0")}`,
    claim,
    status: "passed",
  }));
}

export function computeCaptureContractRootSha256(contract) {
  return hashJson(lifecycleIndependentCaptureContract(contract));
}

function captureBindingProjection(binding) {
  return {
    schemaVersion: binding?.schemaVersion,
    scenarioId: binding?.scenarioId,
    prototypeCommit: binding?.prototypeCommit,
    captureContractRootSha256: binding?.captureContractRootSha256,
    runtimeImageDigest: binding?.runtimeImageDigest,
    driver: binding?.driver,
    provenance: binding?.provenance,
    artifacts: binding?.artifacts,
  };
}

export function computeBaselineCaptureBindingSha256(binding) {
  return hashJson(captureBindingProjection(binding));
}

function reviewerAttestationProjection(evidence, reviewer) {
  const approval = reviewer?.approval;
  return {
    scenarioId: evidence?.scenarioId,
    prototypeCommit: evidence?.prototypeCommit,
    captureContractRootSha256:
      evidence?.captureBinding?.captureContractRootSha256,
    runtimeImageDigest: evidence?.captureBinding?.runtimeImageDigest,
    captureBindingSha256: evidence?.captureBinding?.sha256,
    reviewerId: reviewer?.id,
    role: reviewer?.role,
    repository: approval?.repository,
    pullRequestNumber: approval?.pullRequestNumber,
    reviewId: approval?.reviewId,
    reviewedHeadCommit: approval?.reviewedHeadCommit,
    state: approval?.state,
    submittedAt: approval?.submittedAt,
  };
}

export function computeBaselineReviewerAttestationSha256(evidence, reviewer) {
  return hashJson(reviewerAttestationProjection(evidence, reviewer));
}

function expectedCaptureCommonBinding(contract, scenario, contractRootSha256) {
  return {
    scenarioId: scenario.id,
    prototypeCommit: PROTOTYPE_COMMIT,
    captureContractRootSha256: contractRootSha256,
    runtimeImageDigest: contract.environment.runtimeImageDigest.value,
    driver: captureDriverBinding(contract),
    viewport: captureViewportBinding(contract, scenario),
  };
}

function validFiniteRect(rect, minimumWidth = 0, minimumHeight = 0) {
  return (
    hasExactObjectKeys(rect, ["x", "y", "width", "height"]) &&
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width >= minimumWidth &&
    rect.height >= minimumHeight
  );
}

function validateCaptureArtifactBinding(
  errors,
  label,
  artifact,
  expectedBinding,
  artifactType,
) {
  if (
    artifact?.schemaVersion !== 1 ||
    artifact?.artifactType !== artifactType ||
    JSON.stringify(artifact?.binding) !== JSON.stringify(expectedBinding)
  ) {
    errors.push(
      `${label}: ${artifactType} mist de exacte scenario-/contract-/runtime-/driverbinding.`,
    );
    return false;
  }
  return true;
}

function validateBaselineProvenance(errors, label, provenance) {
  const valid =
    hasExactObjectKeys(provenance, [
      "provider",
      "repository",
      "workflowPath",
      "workflowBlobSha256",
      "jobName",
      "jobId",
      "eventName",
      "runId",
      "runAttempt",
      "headCommit",
      "baseCommit",
      "pullRequestNumber",
      "attestationProvider",
    ]) &&
    provenance.provider === "github-actions" &&
    provenance.repository === "veele-services/platform" &&
    provenance.workflowPath ===
      ".github/workflows/fieldflow-calm-visual-baseline.yml" &&
    /^[0-9a-f]{64}$/u.test(provenance.workflowBlobSha256 ?? "") &&
    provenance.jobName === "normalized-baseline" &&
    Number.isInteger(provenance.jobId) &&
    provenance.jobId > 0 &&
    provenance.eventName === "pull_request" &&
    Number.isInteger(provenance.runId) &&
    provenance.runId > 0 &&
    Number.isInteger(provenance.runAttempt) &&
    provenance.runAttempt > 0 &&
    /^[0-9a-f]{40}$/u.test(provenance.headCommit ?? "") &&
    /^[0-9a-f]{40}$/u.test(provenance.baseCommit ?? "") &&
    provenance.baseCommit !== provenance.headCommit &&
    Number.isInteger(provenance.pullRequestNumber) &&
    provenance.pullRequestNumber > 0 &&
    provenance.attestationProvider === "github-artifact-attestations";
  if (!valid) {
    errors.push(`${label}: GitHub Actions-captureprovenance is ongeldig.`);
  }
  return valid;
}

function validateBaselineReviewers(errors, evidence, contractRootSha256) {
  const label = evidence?.scenarioId ?? "onbekend-scenario";
  const expectedRoles = ["product-design", "visual-a11y"];
  const reviewers = evidence?.reviewers;
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u.test(evidence?.authorId ?? "") ||
    !Array.isArray(reviewers) ||
    reviewers.length !== expectedRoles.length
  ) {
    errors.push(
      `${label}: authorId en exact twee getypeerde baseline-reviewers ontbreken.`,
    );
    return;
  }
  const ids = new Set();
  const roles = new Set();
  for (const reviewer of reviewers) {
    const approval = reviewer?.approval;
    const apiUrl = `https://api.github.com/repos/veele-services/platform/pulls/${evidence.provenance?.pullRequestNumber}/reviews/${approval?.reviewId}`;
    const validReviewer =
      hasExactObjectKeys(reviewer, [
        "id",
        "role",
        "independent",
        "selfReview",
        "approval",
      ]) &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u.test(reviewer.id ?? "") &&
      expectedRoles.includes(reviewer.role) &&
      reviewer.independent === true &&
      reviewer.selfReview === false &&
      reviewer.id !== evidence.authorId &&
      !ids.has(reviewer.id) &&
      !roles.has(reviewer.role) &&
      hasExactObjectKeys(approval, [
        "provider",
        "repository",
        "pullRequestNumber",
        "reviewId",
        "state",
        "reviewedHeadCommit",
        "submittedAt",
        "apiUrl",
        "attestationSha256",
      ]) &&
      approval.provider === "github-pull-request-review" &&
      approval.repository === "veele-services/platform" &&
      approval.pullRequestNumber === evidence.provenance?.pullRequestNumber &&
      Number.isInteger(approval.reviewId) &&
      approval.reviewId > 0 &&
      approval.state === "APPROVED" &&
      approval.reviewedHeadCommit === evidence.provenance?.headCommit &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(
        approval.submittedAt ?? "",
      ) &&
      approval.apiUrl === apiUrl &&
      approval.attestationSha256 ===
        computeBaselineReviewerAttestationSha256(evidence, reviewer) &&
      evidence.captureBinding?.captureContractRootSha256 === contractRootSha256;
    if (!validReviewer) {
      errors.push(
        `${label}: reviewer ${reviewer?.id ?? "onbekend"} mist onafhankelijke, GitHub-geverifieerde en capture-gebonden goedkeuring.`,
      );
    }
    if (isNonEmptyString(reviewer?.id)) ids.add(reviewer.id);
    if (isNonEmptyString(reviewer?.role)) roles.add(reviewer.role);
  }
  if (
    ids.size !== expectedRoles.length ||
    JSON.stringify([...roles].sort()) !==
      JSON.stringify([...expectedRoles].sort())
  ) {
    errors.push(
      `${label}: product-design en visual-a11y moeten door twee unieke niet-zelfreviewers zijn goedgekeurd.`,
    );
  }
}

function githubBaselineArtifactAttestationVerifies(path, expected) {
  try {
    const output = execFileSync(
      "gh",
      [
        "attestation",
        "verify",
        path,
        "--repo",
        "veele-services/platform",
        "--signer-workflow",
        "veele-services/platform/.github/workflows/fieldflow-calm-visual-baseline.yml",
        "--deny-self-hosted-runners",
        "--format",
        "json",
      ],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const records = JSON.parse(output);
    return attestationOutputMatches(records, expected);
  } catch {
    return false;
  }
}

export function validateBaselineExternalEvidence(
  errors,
  evidence,
  pngPath,
  {
    root = ROOT,
    apiJson = githubApiJson,
    apiPaginatedJson = githubApiPaginatedJson,
    attestationVerifier = githubBaselineArtifactAttestationVerifies,
  } = {},
) {
  const label = evidence?.scenarioId ?? "onbekend-scenario";
  const provenance = evidence?.provenance;
  if (!validateBaselineProvenance([], label, provenance)) return;
  if (
    !gitCommitExists(root, provenance.baseCommit) ||
    !gitCommitExists(root, provenance.headCommit) ||
    !gitCommitIsAncestor(root, provenance.baseCommit, provenance.headCommit)
  ) {
    errors.push(
      `${label}: baseline-base bestaat niet of is geen ancestor van exact HEAD.`,
    );
  }
  const workflowAtBase = readGitFile(
    root,
    provenance.baseCommit,
    provenance.workflowPath,
  );
  const workflowAtHead = readGitFile(
    root,
    provenance.headCommit,
    provenance.workflowPath,
  );
  if (
    !workflowAtBase ||
    !workflowAtHead ||
    createHash("sha256").update(workflowAtBase).digest("hex") !==
      provenance.workflowBlobSha256 ||
    createHash("sha256").update(workflowAtHead).digest("hex") !==
      provenance.workflowBlobSha256
  ) {
    errors.push(
      `${label}: baselineworkflow moet als identieke trusted blob op PR-base en capture-HEAD bestaan.`,
    );
  }
  const pullRequest = apiJson(
    `repos/veele-services/platform/pulls/${provenance.pullRequestNumber}`,
  );
  if (
    !pullRequest ||
    pullRequest.head?.sha !== provenance.headCommit ||
    pullRequest.base?.sha !== provenance.baseCommit ||
    pullRequest.user?.login !== evidence.authorId
  ) {
    errors.push(
      `${label}: live GitHub-PR bindt baselineauteur/base/head niet exact.`,
    );
  }
  const run = apiJson(
    `repos/veele-services/platform/actions/runs/${provenance.runId}`,
  );
  if (
    !run ||
    run.head_sha !== provenance.headCommit ||
    run.run_attempt !== provenance.runAttempt ||
    run.event !== provenance.eventName ||
    run.path !== provenance.workflowPath ||
    run.repository?.full_name !== provenance.repository ||
    run.conclusion !== "success" ||
    !run.pull_requests?.some(
      (pull) => pull.number === provenance.pullRequestNumber,
    )
  ) {
    errors.push(
      `${label}: live GitHub Actions-basislinerun is niet succesvol of niet aan PR/HEAD gebonden.`,
    );
  }
  const jobs = apiJson(
    `repos/veele-services/platform/actions/runs/${provenance.runId}/jobs?filter=all`,
  );
  const job = jobs?.jobs?.find(
    (candidate) => candidate.id === provenance.jobId,
  );
  if (
    !job ||
    job.name !== provenance.jobName ||
    job.run_attempt !== provenance.runAttempt ||
    job.head_sha !== provenance.headCommit ||
    job.conclusion !== "success"
  ) {
    errors.push(
      `${label}: live normalized-baseline-job is niet succesvol op exact HEAD.`,
    );
  }
  for (const reviewer of evidence.reviewers ?? []) {
    const approval = reviewer?.approval;
    if (!Number.isInteger(approval?.reviewId)) continue;
    const permission = apiJson(
      `repos/veele-services/platform/collaborators/${reviewer.id}/permission`,
    );
    const reviews = apiPaginatedJson(
      `repos/veele-services/platform/pulls/${approval.pullRequestNumber}/reviews?per_page=100`,
    );
    const latestExactHeadReview = (reviews ?? [])
      .filter(
        (candidate) =>
          candidate.user?.login === reviewer.id &&
          candidate.commit_id === approval.reviewedHeadCommit,
      )
      .sort((first, second) => first.id - second.id)
      .at(-1);
    const review = apiJson(
      `repos/veele-services/platform/pulls/${approval.pullRequestNumber}/reviews/${approval.reviewId}`,
    );
    const marker = `FIELDFLOW-BASELINE: scenario=${evidence.scenarioId}; binding=${evidence.captureBinding?.sha256}; role=${reviewer.role}`;
    if (
      !review ||
      !["admin", "maintain", "write"].includes(permission?.permission) ||
      latestExactHeadReview?.id !== approval.reviewId ||
      review.user?.login !== reviewer.id ||
      review.state !== "APPROVED" ||
      review.commit_id !== approval.reviewedHeadCommit ||
      review.submitted_at !== approval.submittedAt ||
      !String(review.body ?? "").includes(marker)
    ) {
      errors.push(
        `${label}: live GitHub-review ${approval.reviewId} mist APPROVED, exact HEAD of capturebinding-/rolattestatie.`,
      );
    }
  }
  if (
    !pngPath ||
    !attestationVerifier(pngPath, {
      sha256: evidence.png?.sha256,
      provenance,
    })
  ) {
    errors.push(
      `${label}: PNG mist een geldige GitHub Artifact Attestation van de trusted baselineworkflow.`,
    );
  }
}

function validateSetupActionArtifact(
  errors,
  contract,
  scenario,
  setupProfile,
  artifact,
  expectedBinding,
) {
  const label = scenario.id;
  const mobile =
    captureReferenceMode(scenario) === "mobile-responsive-contract";
  const mobileEvidence = contract.evidenceContract?.mobileProductionEvidence;
  if (
    !validateCaptureArtifactBinding(
      errors,
      label,
      artifact,
      expectedBinding,
      mobile ? "production-setup-action-log" : "setup-action-log",
    )
  ) {
    return;
  }
  const beforeEachInstructions = mobile
    ? (mobileEvidence?.beforeEach ?? [])
    : contract.normalization.beforeEach;
  const stepDefinitions = mobile
    ? (mobileEvidence?.setupActionsByScenario?.[scenario.id] ?? []).map(
        (claim) => ({ op: "production-assertion", claim }),
      )
    : setupProfile.steps;
  const sentinelDefinitions = mobile
    ? mobileRequiredRegions(contract, scenario).map((value) => ({
        by: "css",
        value,
      }))
    : setupProfile.expectedDomSentinels;
  const expectedBeforeEach = beforeEachInstructions.map(
    (instruction, index) => ({ index, instruction, status: "passed" }),
  );
  const expectedSteps = stepDefinitions.map((definition, index) => ({
    index,
    definition,
    status: "passed",
  }));
  const validSentinels =
    Array.isArray(artifact.sentinels) &&
    artifact.sentinels.length === sentinelDefinitions.length &&
    artifact.sentinels.every(
      (result, index) =>
        hasExactObjectKeys(result, [
          "index",
          "locator",
          "status",
          "matchCount",
        ]) &&
        result.index === index &&
        JSON.stringify(result.locator) ===
          JSON.stringify(sentinelDefinitions[index]) &&
        result.status === "passed" &&
        Number.isInteger(result.matchCount) &&
        result.matchCount > 0,
    );
  if (
    !hasExactObjectKeys(artifact, [
      "schemaVersion",
      "artifactType",
      "binding",
      "profileId",
      "beforeEach",
      "steps",
      "sentinels",
      "workspaceScroll",
      "boardScroll",
      "errors",
    ]) ||
    artifact.profileId !== (mobile ? scenario.id : scenario.setupProfile) ||
    JSON.stringify(artifact.beforeEach) !==
      JSON.stringify(expectedBeforeEach) ||
    JSON.stringify(artifact.steps) !== JSON.stringify(expectedSteps) ||
    !validSentinels ||
    JSON.stringify(artifact.workspaceScroll) !==
      JSON.stringify(scenario.workspaceScroll) ||
    JSON.stringify(artifact.boardScroll) !==
      JSON.stringify(scenario.boardScroll ?? null) ||
    !Array.isArray(artifact.errors) ||
    artifact.errors.length !== 0
  ) {
    errors.push(
      `${label}: setup-action-log bewijst niet exact alle stappen, beforeEach-checks en DOM-sentinels als geslaagd.`,
    );
  }
}

function validateRuntimeErrorArtifact(
  errors,
  contract,
  scenario,
  artifact,
  expectedBinding,
) {
  const label = scenario.id;
  validateCaptureArtifactBinding(
    errors,
    label,
    artifact,
    expectedBinding,
    "runtime-error-log",
  );
  const errorFields =
    contract.evidenceContract.artifactSchemas.runtimeErrorLog.emptyArrays;
  if (
    !hasExactObjectKeys(artifact, [
      "schemaVersion",
      "artifactType",
      "binding",
      ...errorFields,
    ]) ||
    errorFields.some(
      (field) =>
        !Array.isArray(artifact?.[field]) || artifact[field].length !== 0,
    )
  ) {
    errors.push(
      `${label}: runtime-error-log moet alle getypeerde foutkanalen bevatten en leeg zijn.`,
    );
  }
}

function validateGeometryArtifact(
  errors,
  contract,
  scenario,
  artifact,
  expectedBinding,
) {
  const label = scenario.id;
  validateCaptureArtifactBinding(
    errors,
    label,
    artifact,
    expectedBinding,
    "computed-geometry",
  );
  const geometryContract = contract.normalization.pixelGate.geometryComparison;
  const requiredSelectors = [
    ...geometryContract.requiredSelectorsByFormFactor[scenario.viewport],
    ...geometryContract.requiredSelectorsByPattern[scenario.pattern],
  ];
  const measurementsValid =
    Array.isArray(artifact?.measurements) &&
    artifact.measurements.length === requiredSelectors.length &&
    artifact.measurements.every((measurement, index) => {
      if (
        !hasExactObjectKeys(measurement, [
          "selector",
          "referenceRect",
          "capturedRect",
          "deltaPx",
        ]) ||
        measurement.selector !== requiredSelectors[index] ||
        !validFiniteRect(measurement.referenceRect, 0, 0) ||
        !validFiniteRect(measurement.capturedRect, 0, 0) ||
        !hasExactObjectKeys(measurement.deltaPx, ["x", "y", "width", "height"])
      ) {
        return false;
      }
      return ["x", "y", "width", "height"].every((axis) => {
        const computed =
          measurement.capturedRect[axis] - measurement.referenceRect[axis];
        return (
          Number.isFinite(measurement.deltaPx[axis]) &&
          Math.abs(computed - measurement.deltaPx[axis]) < 0.000001 &&
          Math.abs(measurement.deltaPx[axis]) <=
            geometryContract.maximumAbsoluteDeltaPx
        );
      });
    });
  const targetIds = new Set();
  const targetsValid =
    Array.isArray(artifact?.interactiveTargets) &&
    artifact.interactiveTargets.length > 0 &&
    artifact.interactiveTargets.every((target) => {
      const valid =
        hasExactObjectKeys(target, [
          "id",
          "selector",
          "role",
          "name",
          "rect",
        ]) &&
        isNonEmptyString(target.id) &&
        isNonEmptyString(target.selector) &&
        isNonEmptyString(target.role) &&
        isNonEmptyString(target.name) &&
        !targetIds.has(target.id) &&
        validFiniteRect(
          target.rect,
          contract.normalization.portalScopeVerification
            .minimumInteractiveTargetPx,
          contract.normalization.portalScopeVerification
            .minimumInteractiveTargetPx,
        );
      if (isNonEmptyString(target?.id)) targetIds.add(target.id);
      return valid;
    });
  if (
    !hasExactObjectKeys(artifact, [
      "schemaVersion",
      "artifactType",
      "binding",
      "maximumAbsoluteDeltaPx",
      "measurements",
      "allInteractiveTargetsMeasured",
      "interactiveTargetCount",
      "interactiveTargets",
    ]) ||
    artifact.maximumAbsoluteDeltaPx !==
      geometryContract.maximumAbsoluteDeltaPx ||
    !measurementsValid ||
    artifact.allInteractiveTargetsMeasured !== true ||
    !Number.isInteger(artifact.interactiveTargetCount) ||
    artifact.interactiveTargetCount !== artifact.interactiveTargets?.length ||
    !targetsValid
  ) {
    errors.push(
      `${label}: geometrybewijs mist exacte selectors, ≤1px-delta of volledige interactieve doelen van minimaal 44×44px.`,
    );
  }
}

function expectedPortalChecks(contract, scenario) {
  const details =
    scenario.pattern === "wizard"
      ? { component: "Dialog", selector: ".wizard-dialog" }
      : scenario.pattern === "sheet"
        ? { component: "Sheet", selector: ".prototype-sheet" }
        : null;
  if (!details) return [];
  const canonical =
    contract.normalization.canonicalThemeStylesheet.computedVariableSentinels;
  return [
    {
      ...details,
      portalRoot: contract.normalization.portalScopeVerification.portalRoot,
      variables: {
        "--ff-primary": canonical["--ff-primary"],
        "--ff-sidebar-active-bg": canonical["--ff-sidebar-active-bg"],
        "--muted-text": canonical["--ff-text-muted"],
        "--input": canonical["--input"],
      },
    },
  ];
}

function validateStylesArtifact(
  errors,
  contract,
  scenario,
  artifact,
  expectedBinding,
) {
  const label = scenario.id;
  validateCaptureArtifactBinding(
    errors,
    label,
    artifact,
    expectedBinding,
    "computed-styles",
  );
  const expectedStylesheets = [
    {
      file: "canonical-theme.css",
      sha256: CANONICAL_THEME_STYLESHEET_SHA256,
    },
    {
      file: "reference-normalization.css",
      sha256: REFERENCE_NORMALIZATION_SHA256,
    },
  ];
  if (
    !hasExactObjectKeys(artifact, [
      "schemaVersion",
      "artifactType",
      "binding",
      "canonicalThemeStylesheetSha256",
      "referenceStylesheetSha256",
      "semanticOutputSha256",
      "themeResolutionSha256",
      "loadedCaptureStylesheets",
      "fontsReady",
      "resolvedFonts",
      "rootVariables",
      "portalChecks",
      "unexpectedStylesheets",
    ]) ||
    artifact.canonicalThemeStylesheetSha256 !==
      CANONICAL_THEME_STYLESHEET_SHA256 ||
    artifact.referenceStylesheetSha256 !== REFERENCE_NORMALIZATION_SHA256 ||
    artifact.semanticOutputSha256 !== CANONICAL_THEME_SEMANTIC_SHA256 ||
    artifact.themeResolutionSha256 !== CANONICAL_THEME_RESOLUTION_SHA256 ||
    JSON.stringify(artifact.loadedCaptureStylesheets) !==
      JSON.stringify(expectedStylesheets) ||
    artifact.fontsReady !== true ||
    JSON.stringify(artifact.resolvedFonts) !==
      JSON.stringify(contract.environment.fonts.resolvedFiles) ||
    JSON.stringify(artifact.rootVariables) !==
      JSON.stringify(
        contract.normalization.canonicalThemeStylesheet
          .computedVariableSentinels,
      ) ||
    JSON.stringify(artifact.portalChecks) !==
      JSON.stringify(expectedPortalChecks(contract, scenario)) ||
    !Array.isArray(artifact.unexpectedStylesheets) ||
    artifact.unexpectedStylesheets.length !== 0
  ) {
    errors.push(
      `${label}: stylebewijs mist exacte themehashes, fonts, rootvariabelen of body-portalcontrole.`,
    );
  }
}

function validateDomArtifact(
  errors,
  contract,
  scenario,
  setupProfile,
  artifact,
  geometryArtifact,
  expectedBinding,
) {
  const label = scenario.id;
  validateCaptureArtifactBinding(
    errors,
    label,
    artifact,
    expectedBinding,
    "dom-snapshot",
  );
  const viewport = contract.viewports[scenario.viewport];
  const sentinelsValid =
    Array.isArray(artifact?.sentinels) &&
    artifact.sentinels.length === setupProfile.expectedDomSentinels.length &&
    artifact.sentinels.every(
      (sentinel, index) =>
        hasExactObjectKeys(sentinel, ["index", "locator", "matchCount"]) &&
        sentinel.index === index &&
        JSON.stringify(sentinel.locator) ===
          JSON.stringify(setupProfile.expectedDomSentinels[index]) &&
        Number.isInteger(sentinel.matchCount) &&
        sentinel.matchCount > 0,
    );
  const expectedForbiddenSelectors =
    contract.evidenceContract.artifactSchemas.domSnapshot.forbiddenSelectors.map(
      (selector) => ({ selector, count: 0 }),
    );
  const expectedForbiddenNames =
    contract.evidenceContract.artifactSchemas.domSnapshot.forbiddenAccessibleNames.map(
      (name) => ({ name, count: 0 }),
    );
  if (
    !hasExactObjectKeys(artifact, [
      "schemaVersion",
      "artifactType",
      "binding",
      "body",
      "application",
      "sentinels",
      "forbiddenSelectors",
      "forbiddenAccessibleNames",
      "hiddenProductionNodes",
      "interactiveTargetCount",
    ]) ||
    JSON.stringify(artifact.body) !==
      JSON.stringify({ dataConcept: "fieldflow" }) ||
    JSON.stringify(artifact.application) !==
      JSON.stringify({
        selector: contract.normalization.applicationSelector,
        count: 1,
        rect: { x: 0, y: 0, width: viewport.width, height: viewport.height },
        declaredStyle: contract.normalization.applicationStyle,
      }) ||
    !sentinelsValid ||
    JSON.stringify(artifact.forbiddenSelectors) !==
      JSON.stringify(expectedForbiddenSelectors) ||
    JSON.stringify(artifact.forbiddenAccessibleNames) !==
      JSON.stringify(expectedForbiddenNames) ||
    !Array.isArray(artifact.hiddenProductionNodes) ||
    artifact.hiddenProductionNodes.length !== 0 ||
    !Number.isInteger(artifact.interactiveTargetCount) ||
    artifact.interactiveTargetCount <= 0 ||
    artifact.interactiveTargetCount !== geometryArtifact?.interactiveTargetCount
  ) {
    errors.push(
      `${label}: DOM-bewijs mist full-viewport app, exacte sentinels of afwezigheid van labchrome/Herstel demo.`,
    );
  }
}

function mobileRequiredRegions(contract, scenario) {
  return [
    ...(contract.normalization?.responsiveContractGate?.geometryAssertions
      ?.requiredShellRegions ?? []),
    ...(contract.normalization?.responsiveContractGate?.transformsByPattern?.[
      scenario.pattern
    ]?.requiredRegions ?? []),
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function validateMobileGeometryArtifact(
  errors,
  contract,
  scenario,
  artifact,
  expectedBinding,
) {
  const label = scenario.id;
  validateCaptureArtifactBinding(
    errors,
    label,
    artifact,
    expectedBinding,
    "semantic-region-geometry",
  );
  const gate = contract.normalization.responsiveContractGate;
  const limits = gate.geometryAssertions;
  const viewport = contract.viewports[scenario.viewport];
  const requiredRegions = mobileRequiredRegions(contract, scenario);
  const regionMeasurementsValid =
    Array.isArray(artifact?.regionMeasurements) &&
    artifact.regionMeasurements.length === requiredRegions.length &&
    artifact.regionMeasurements.every(
      (measurement, index) =>
        hasExactObjectKeys(measurement, ["selector", "count", "rect"]) &&
        measurement.selector === requiredRegions[index] &&
        measurement.count === 1 &&
        validFiniteRect(measurement.rect) &&
        measurement.rect.x >= 0 &&
        measurement.rect.y >= 0 &&
        measurement.rect.x + measurement.rect.width <= viewport.width + 1 &&
        measurement.rect.y + measurement.rect.height <= viewport.height + 1,
    );
  const targetIds = new Set();
  const targetsValid =
    Array.isArray(artifact?.interactiveTargets) &&
    artifact.interactiveTargets.length > 0 &&
    artifact.interactiveTargets.every((target) => {
      const valid =
        hasExactObjectKeys(target, [
          "id",
          "selector",
          "role",
          "name",
          "rect",
        ]) &&
        isNonEmptyString(target.id) &&
        !targetIds.has(target.id) &&
        isNonEmptyString(target.selector) &&
        isNonEmptyString(target.role) &&
        isNonEmptyString(target.name) &&
        validFiniteRect(
          target.rect,
          limits.minimumInteractiveTargetPx,
          limits.minimumInteractiveTargetPx,
        );
      if (isNonEmptyString(target?.id)) targetIds.add(target.id);
      return valid;
    });
  if (
    !hasExactObjectKeys(artifact, [
      "schemaVersion",
      "artifactType",
      "binding",
      "referenceMode",
      "regionMeasurements",
      "documentHorizontalOverflowPx",
      "allInteractiveTargetsMeasured",
      "interactiveTargetCount",
      "interactiveTargets",
      "minimumAdjacentInteractiveTargetGapPx",
      "minimumAdjacentContainerGapPx",
      "minimumTextToBorderPaddingPx",
      "assertions",
    ]) ||
    artifact.referenceMode !== "mobile-responsive-contract" ||
    !regionMeasurementsValid ||
    !Number.isFinite(artifact.documentHorizontalOverflowPx) ||
    artifact.documentHorizontalOverflowPx < 0 ||
    artifact.documentHorizontalOverflowPx >
      limits.documentHorizontalOverflowTolerancePx ||
    artifact.allInteractiveTargetsMeasured !== true ||
    artifact.interactiveTargetCount !== artifact.interactiveTargets?.length ||
    !targetsValid ||
    artifact.minimumAdjacentInteractiveTargetGapPx <
      limits.minimumAdjacentInteractiveTargetGapPx ||
    artifact.minimumAdjacentContainerGapPx <
      limits.minimumAdjacentContainerGapPx ||
    artifact.minimumTextToBorderPaddingPx <
      limits.minimumTextToBorderPaddingPx ||
    JSON.stringify(artifact.assertions) !==
      JSON.stringify(expectedMobileEvidenceAssertions(contract, scenario))
  ) {
    errors.push(
      `${label}: mobiele semantische geometry mist regio's, overflow-, 44px-, spacing- of transformbewijs.`,
    );
  }
}

function validateMobileDomArtifact(
  errors,
  contract,
  scenario,
  artifact,
  geometryArtifact,
  expectedBinding,
) {
  const label = scenario.id;
  validateCaptureArtifactBinding(
    errors,
    label,
    artifact,
    expectedBinding,
    "production-dom-snapshot",
  );
  const requiredRegions = mobileRequiredRegions(contract, scenario);
  if (
    !hasExactObjectKeys(artifact, [
      "schemaVersion",
      "artifactType",
      "binding",
      "referenceMode",
      "applicationRegionCount",
      "regions",
      "prototypeSelectorMatches",
      "desktopDuplicateRegionMatches",
      "interactiveTargetCount",
      "errors",
    ]) ||
    artifact.referenceMode !== "mobile-responsive-contract" ||
    artifact.applicationRegionCount !== 1 ||
    JSON.stringify(artifact.regions) !==
      JSON.stringify(
        requiredRegions.map((selector) => ({ selector, count: 1 })),
      ) ||
    JSON.stringify(artifact.prototypeSelectorMatches) !==
      JSON.stringify([
        { selector: ".lab-bar", count: 0 },
        { selector: ".concept-caption", count: 0 },
      ]) ||
    !Array.isArray(artifact.desktopDuplicateRegionMatches) ||
    artifact.desktopDuplicateRegionMatches.some(
      (record) =>
        !hasExactObjectKeys(record, ["selector", "count"]) ||
        record.count !== 0,
    ) ||
    artifact.interactiveTargetCount !==
      geometryArtifact?.interactiveTargetCount ||
    !Array.isArray(artifact.errors) ||
    artifact.errors.length !== 0
  ) {
    errors.push(
      `${label}: mobiele productie-DOM mist één app, vereiste regio's of afwezigheid van lab/desktopduplicaten.`,
    );
  }
}

function validateMobileStylesArtifact(
  errors,
  contract,
  scenario,
  artifact,
  expectedBinding,
) {
  const label = scenario.id;
  validateCaptureArtifactBinding(
    errors,
    label,
    artifact,
    expectedBinding,
    "production-computed-styles",
  );
  if (
    !hasExactObjectKeys(artifact, [
      "schemaVersion",
      "artifactType",
      "binding",
      "referenceMode",
      "fontsReady",
      "resolvedFonts",
      "rootVariables",
      "portalChecks",
      "captureOnlyStylesheetsLoaded",
      "errors",
    ]) ||
    artifact.referenceMode !== "mobile-responsive-contract" ||
    artifact.fontsReady !== true ||
    JSON.stringify(artifact.resolvedFonts) !==
      JSON.stringify(contract.environment.fonts.resolvedFiles) ||
    !artifact.rootVariables ||
    typeof artifact.rootVariables !== "object" ||
    Array.isArray(artifact.rootVariables) ||
    Object.keys(artifact.rootVariables).length === 0 ||
    !Array.isArray(artifact.portalChecks) ||
    artifact.portalChecks.some(
      (check) =>
        !hasExactObjectKeys(check, [
          "component",
          "accessibleName",
          "initialFocus",
          "status",
        ]) ||
        !isNonEmptyString(check.component) ||
        !isNonEmptyString(check.accessibleName) ||
        !isNonEmptyString(check.initialFocus) ||
        check.status !== "passed",
    ) ||
    JSON.stringify(artifact.captureOnlyStylesheetsLoaded) !==
      JSON.stringify([]) ||
    !Array.isArray(artifact.errors) ||
    artifact.errors.length !== 0
  ) {
    errors.push(
      `${label}: mobiele productiestijlen missen fonts, tokens, portalcontrole of laden capture-only CSS.`,
    );
  }
}

function validateMobileAxeArtifact(
  errors,
  scenario,
  artifact,
  expectedBinding,
) {
  const label = scenario.id;
  validateCaptureArtifactBinding(
    errors,
    label,
    artifact,
    expectedBinding,
    "axe-report",
  );
  if (
    !hasExactObjectKeys(artifact, [
      "schemaVersion",
      "artifactType",
      "binding",
      "referenceMode",
      "criticalViolations",
      "seriousViolations",
      "violations",
      "incomplete",
    ]) ||
    artifact.referenceMode !== "mobile-responsive-contract" ||
    artifact.criticalViolations !== 0 ||
    artifact.seriousViolations !== 0 ||
    !Array.isArray(artifact.violations) ||
    artifact.violations.some((violation) =>
      ["critical", "serious"].includes(violation?.impact),
    ) ||
    !Array.isArray(artifact.incomplete)
  ) {
    errors.push(
      `${label}: mobiele Axe-output bevat critical/serious of mist typed output.`,
    );
  }
}

function validateMobileInteractionArtifact(
  errors,
  scenario,
  artifact,
  expectedBinding,
  inputMode,
) {
  const label = scenario.id;
  validateCaptureArtifactBinding(
    errors,
    label,
    artifact,
    expectedBinding,
    "interaction-trace",
  );
  if (
    !hasExactObjectKeys(artifact, [
      "schemaVersion",
      "artifactType",
      "binding",
      "referenceMode",
      "inputMode",
      "initialFocusOrTarget",
      "steps",
      "cancelReturnTarget",
      "announcements",
      "dragUsed",
      "errors",
    ]) ||
    artifact.referenceMode !== "mobile-responsive-contract" ||
    artifact.inputMode !== inputMode ||
    !isNonEmptyString(artifact.initialFocusOrTarget) ||
    !Array.isArray(artifact.steps) ||
    artifact.steps.length === 0 ||
    artifact.steps.some(
      (step) =>
        !hasExactObjectKeys(step, ["action", "status"]) ||
        !isNonEmptyString(step.action) ||
        step.status !== "passed",
    ) ||
    !isNonEmptyString(artifact.cancelReturnTarget) ||
    !Array.isArray(artifact.announcements) ||
    artifact.announcements.length === 0 ||
    artifact.announcements.some(
      (announcement) => !isNonEmptyString(announcement),
    ) ||
    artifact.dragUsed !== false ||
    !Array.isArray(artifact.errors) ||
    artifact.errors.length !== 0
  ) {
    errors.push(
      `${label}: mobiele ${inputMode}-trace bewijst bediening, return-focus en non-drag niet exact.`,
    );
  }
}

export function validateBaselineScenarioEvidencePayload(
  contract,
  scenario,
  evidence,
  artifacts,
) {
  const errors = [];
  const label = scenario?.id ?? evidence?.scenarioId ?? "onbekend-scenario";
  if (!scenario) {
    errors.push(`${label}: onbekend baseline-scenario.`);
    return errors;
  }
  const contractRootSha256 = computeCaptureContractRootSha256(contract);
  const expectedBinding = expectedCaptureCommonBinding(
    contract,
    scenario,
    contractRootSha256,
  );
  const setupProfile = contract.setupDriver?.profiles?.[scenario.setupProfile];
  if (!setupProfile) {
    errors.push(`${label}: setup-profiel ontbreekt.`);
    return errors;
  }
  const mobile =
    captureReferenceMode(scenario) === "mobile-responsive-contract";
  const baseEvidenceFields = [
    "scenarioId",
    "prototypeCommit",
    "authorId",
    "provenance",
    "png",
    "domSnapshot",
    "computedGeometry",
    "computedStyles",
    "setupActionLog",
    "runtimeErrorLog",
    "captureBinding",
    "reviewers",
  ];
  if (
    !hasExactObjectKeys(evidence, [
      ...baseEvidenceFields,
      ...(mobile
        ? [
            "referenceMode",
            "headCommit",
            "viewport",
            "transformPattern",
            "responsiveContractSha256",
            "axeReport",
            "keyboardInteractionTrace",
            "touchInteractionTrace",
            "assertions",
            "status",
          ]
        : []),
    ]) ||
    evidence.scenarioId !== scenario.id ||
    evidence.prototypeCommit !== PROTOTYPE_COMMIT ||
    (mobile &&
      (evidence.referenceMode !== "mobile-responsive-contract" ||
        evidence.headCommit !== evidence.provenance?.headCommit ||
        JSON.stringify(evidence.viewport) !==
          JSON.stringify(captureViewportBinding(contract, scenario)) ||
        evidence.transformPattern !== scenario.pattern ||
        evidence.responsiveContractSha256 !==
          hashJson(contract.normalization.responsiveContractGate) ||
        evidence.status !== "passed" ||
        JSON.stringify(evidence.assertions) !==
          JSON.stringify(expectedMobileEvidenceAssertions(contract, scenario))))
  ) {
    errors.push(`${label}: baseline-evidencerecord heeft een ongeldige vorm.`);
  }
  validateBaselineProvenance(errors, label, evidence?.provenance);
  const artifactDigests = {
    png: evidence?.png?.sha256,
    domSnapshot: evidence?.domSnapshot?.sha256,
    computedGeometry: evidence?.computedGeometry?.sha256,
    computedStyles: evidence?.computedStyles?.sha256,
    setupActionLog: evidence?.setupActionLog?.sha256,
    runtimeErrorLog: evidence?.runtimeErrorLog?.sha256,
    ...(mobile
      ? {
          axeReport: evidence?.axeReport?.sha256,
          keyboardInteractionTrace: evidence?.keyboardInteractionTrace?.sha256,
          touchInteractionTrace: evidence?.touchInteractionTrace?.sha256,
        }
      : {}),
  };
  const captureBinding = evidence?.captureBinding;
  if (
    !hasExactObjectKeys(captureBinding, [
      "schemaVersion",
      "scenarioId",
      "prototypeCommit",
      "captureContractRootSha256",
      "runtimeImageDigest",
      "driver",
      "provenance",
      "artifacts",
      "sha256",
    ]) ||
    captureBinding.schemaVersion !== 1 ||
    captureBinding.scenarioId !== scenario.id ||
    captureBinding.prototypeCommit !== PROTOTYPE_COMMIT ||
    captureBinding.captureContractRootSha256 !== contractRootSha256 ||
    captureBinding.runtimeImageDigest !==
      contract.environment.runtimeImageDigest.value ||
    JSON.stringify(captureBinding.driver) !==
      JSON.stringify(captureDriverBinding(contract)) ||
    JSON.stringify(captureBinding.provenance) !==
      JSON.stringify(evidence.provenance) ||
    JSON.stringify(captureBinding.artifacts) !==
      JSON.stringify(artifactDigests) ||
    captureBinding.sha256 !==
      computeBaselineCaptureBindingSha256(captureBinding)
  ) {
    errors.push(
      `${label}: captureBinding koppelt PNG en JSON-artefacten niet aan scenario, contractroot, runtime, driver en CI-run.`,
    );
  }
  validateBaselineReviewers(errors, evidence, contractRootSha256);
  validateSetupActionArtifact(
    errors,
    contract,
    scenario,
    setupProfile,
    artifacts?.setupActionLog,
    expectedBinding,
  );
  validateRuntimeErrorArtifact(
    errors,
    contract,
    scenario,
    artifacts?.runtimeErrorLog,
    expectedBinding,
  );
  if (mobile) {
    validateMobileGeometryArtifact(
      errors,
      contract,
      scenario,
      artifacts?.computedGeometry,
      expectedBinding,
    );
    validateMobileStylesArtifact(
      errors,
      contract,
      scenario,
      artifacts?.computedStyles,
      expectedBinding,
    );
    validateMobileDomArtifact(
      errors,
      contract,
      scenario,
      artifacts?.domSnapshot,
      artifacts?.computedGeometry,
      expectedBinding,
    );
    validateMobileAxeArtifact(
      errors,
      scenario,
      artifacts?.axeReport,
      expectedBinding,
    );
    validateMobileInteractionArtifact(
      errors,
      scenario,
      artifacts?.keyboardInteractionTrace,
      expectedBinding,
      "keyboard",
    );
    validateMobileInteractionArtifact(
      errors,
      scenario,
      artifacts?.touchInteractionTrace,
      expectedBinding,
      "touch",
    );
  } else {
    validateGeometryArtifact(
      errors,
      contract,
      scenario,
      artifacts?.computedGeometry,
      expectedBinding,
    );
    validateStylesArtifact(
      errors,
      contract,
      scenario,
      artifacts?.computedStyles,
      expectedBinding,
    );
    validateDomArtifact(
      errors,
      contract,
      scenario,
      setupProfile,
      artifacts?.domSnapshot,
      artifacts?.computedGeometry,
      expectedBinding,
    );
  }
  return errors;
}

function readCaptureJsonArtifact(errors, label, visualRoot, artifact) {
  const artifactPath = resolve(visualRoot, artifact.path);
  try {
    const payload = JSON.parse(readFileSync(artifactPath, "utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      errors.push(`${label}: ${artifact.path} bevat geen JSON-object.`);
      return null;
    }
    return payload;
  } catch {
    errors.push(`${label}: ${artifact.path} is geen geldige JSON-evidence.`);
    return null;
  }
}

export function validateCaptureContract(
  errors,
  packageRoot,
  contract,
  visualManifest,
) {
  if (
    contract.schemaVersion !== 1 ||
    contract.source?.prototypeCommit !== PROTOTYPE_COMMIT ||
    contract.source?.variant !== "fieldflow"
  ) {
    errors.push("Genormaliseerd capturecontract heeft een ongeldige bron.");
  }
  if (
    JSON.stringify(contract.stateModel) !==
      JSON.stringify(["CONTRACTED", "BASELINE_READY"]) ||
    !contract.stateModel?.includes(contract.state)
  ) {
    errors.push("Capturecontract heeft een ongeldige state/stateModel.");
  }
  if (
    contract.environment?.playwrightVersion !== "1.55.1" ||
    contract.environment?.browser?.name !== "chromium" ||
    contract.environment?.browser?.playwrightRevision !== "1193" ||
    contract.environment?.browser?.version !== "140.0.7339.186" ||
    contract.environment?.deviceScaleFactor !== 1 ||
    contract.environment?.locale !== "nl-NL" ||
    contract.environment?.timezone !== "Europe/Amsterdam" ||
    contract.environment?.colorScheme !== "light" ||
    JSON.stringify(contract.environment?.network) !==
      JSON.stringify({
        unexpectedThirdPartyRequests: "blocked",
        mapTileMasking: "allowed-only-in-explicit-map-scenarios",
      }) ||
    contract.environment?.reducedMotion !== "reduce" ||
    contract.environment?.animations !== "disabled" ||
    contract.environment?.fonts?.readinessPromise !== "document.fonts.ready" ||
    contract.environment?.fonts?.externalRuntimeRequestsAllowed !== false ||
    contract.environment?.clock?.iso8601 !== "2026-09-02T09:42:00+02:00" ||
    contract.environment?.clock?.timezone !== "Europe/Amsterdam"
  ) {
    errors.push("Captureomgeving is niet deterministisch genoeg vastgelegd.");
  }
  if (
    JSON.stringify(contract.normalization?.hideSelectors) !==
      JSON.stringify([".lab-bar", ".concept-caption"]) ||
    JSON.stringify(contract.normalization?.removeControlsByAccessibleName) !==
      JSON.stringify(["Herstel demo"]) ||
    contract.normalization?.applicationSelector !== ".fg-app" ||
    JSON.stringify(contract.normalization?.applicationStyle) !==
      JSON.stringify({ height: "100vh", width: "100vw" })
  ) {
    errors.push(
      "Capture-normalisatie van appvlak en prototypechrome wijkt af.",
    );
  }
  const canonicalTheme = contract.normalization?.canonicalThemeStylesheet;
  const canonicalThemePath = resolve(
    packageRoot,
    "evidence/visual",
    canonicalTheme?.file ?? "",
  );
  const referenceStylesheet = contract.normalization?.referenceStylesheet;
  const referencePath = resolve(
    packageRoot,
    "evidence/visual",
    referenceStylesheet?.file ?? "",
  );
  if (
    canonicalTheme?.file !== "canonical-theme.css" ||
    canonicalTheme?.sha256 !== CANONICAL_THEME_STYLESHEET_SHA256 ||
    canonicalTheme?.fixtureId !== "default" ||
    canonicalTheme?.expectedSemanticOutputSha256 !==
      CANONICAL_THEME_SEMANTIC_SHA256 ||
    canonicalTheme?.expectedResolutionSha256 !==
      CANONICAL_THEME_RESOLUTION_SHA256 ||
    canonicalTheme?.appliedAfterPrototypeStyles !== true ||
    canonicalTheme?.appliedBeforeReferenceStylesheet !== true ||
    canonicalTheme?.selectorScope !== 'body[data-concept="fieldflow"]' ||
    canonicalTheme?.productionMayLoadStylesheet !== false ||
    JSON.stringify(canonicalTheme?.computedVariableSentinels) !==
      JSON.stringify({
        "--ff-primary": "#07554e",
        "--ff-text-muted": "#5d716e",
        "--ff-sidebar-active-bg": "#d9f6e8",
        "--primary": "#07554e",
        "--foreground": "#123532",
        "--muted": "#eef2f0",
        "--line": "#dce7e3",
        "--input": "#7a918c",
      }) ||
    !existsSync(canonicalThemePath) ||
    hashFile(canonicalThemePath) !== CANONICAL_THEME_STYLESHEET_SHA256 ||
    visualManifest.referenceNormalization?.canonicalThemeStylesheet?.sha256 !==
      CANONICAL_THEME_STYLESHEET_SHA256 ||
    visualManifest.referenceNormalization?.canonicalThemeStylesheet
      ?.expectedSemanticOutputSha256 !== CANONICAL_THEME_SEMANTIC_SHA256 ||
    visualManifest.referenceNormalization?.canonicalThemeStylesheet
      ?.expectedResolutionSha256 !== CANONICAL_THEME_RESOLUTION_SHA256 ||
    referenceStylesheet?.file !== "reference-normalization.css" ||
    referenceStylesheet?.sha256 !== REFERENCE_NORMALIZATION_SHA256 ||
    referenceStylesheet?.appliedAfterPrototypeStyles !== true ||
    referenceStylesheet?.appliedAfterCanonicalTheme !== true ||
    referenceStylesheet?.selectorScope !== 'body[data-concept="fieldflow"]' ||
    JSON.stringify(referenceStylesheet?.approvedDeltaTypes) !==
      JSON.stringify([
        "wcag-color-pair-correction",
        "minimum-interactive-target-44px",
        "minimum-legible-component-type",
      ]) ||
    contract.normalization?.pixelGate?.reference !==
      "normalized desktop outputs only" ||
    contract.normalization?.pixelGate?.rawAnchorsEligible !== false ||
    contract.normalization?.pixelGate?.implementationMayRepeatNormalization !==
      false ||
    !existsSync(referencePath) ||
    hashFile(referencePath) !== REFERENCE_NORMALIZATION_SHA256 ||
    visualManifest.referenceNormalization?.referenceStylesheet?.sha256 !==
      REFERENCE_NORMALIZATION_SHA256 ||
    !contract.normalization?.beforeEach?.includes(
      "inject the exact hashed canonical-theme stylesheet after all prototype styles and assert every computed variable sentinel",
    ) ||
    !contract.normalization?.beforeEach?.includes(
      "inject the exact hashed reference stylesheet after canonical-theme.css",
    ) ||
    !contract.normalization?.forbidden?.includes(
      "using a raw audit anchor directly as a pixel baseline",
    ) ||
    contract.normalization?.portalScopeVerification?.portalRoot !==
      'body[data-concept="fieldflow"]' ||
    JSON.stringify(
      contract.normalization?.portalScopeVerification?.requiredOpenComponents,
    ) !== JSON.stringify(["Dialog", "Sheet"]) ||
    contract.normalization?.portalScopeVerification
      ?.minimumInteractiveTargetPx !== 44
  ) {
    errors.push(
      "Gehasht toegankelijkheidsnormalisatiecontract ontbreekt of wijkt af.",
    );
  }
  const pixelGate = contract.normalization?.pixelGate;
  if (
    pixelGate?.screenshotComparison?.engine !== "Playwright toHaveScreenshot" ||
    pixelGate?.screenshotComparison?.threshold !== 0.1 ||
    pixelGate?.screenshotComparison?.maxDiffPixelRatio !== 0.001 ||
    JSON.stringify(pixelGate?.screenshotComparison?.maxDiffPixelsByViewport) !==
      JSON.stringify({ desktop: 1440 }) ||
    pixelGate?.referenceMode !== "desktop-canonical-pixel" ||
    JSON.stringify(pixelGate?.eligibleViewportIds) !==
      JSON.stringify(["desktop"]) ||
    !Array.isArray(pixelGate?.eligibleScenarioIds) ||
    pixelGate.eligibleScenarioIds.length !== 9 ||
    pixelGate?.geometryComparison?.maximumAbsoluteDeltaPx !== 1 ||
    !Array.isArray(
      pixelGate?.geometryComparison?.requiredSelectorsByFormFactor?.desktop,
    ) ||
    Object.hasOwn(
      pixelGate?.geometryComparison?.requiredSelectorsByFormFactor ?? {},
      "mobile",
    ) ||
    JSON.stringify(
      Object.keys(
        pixelGate?.geometryComparison?.requiredSelectorsByPattern ?? {},
      ),
    ) !==
      JSON.stringify([
        "dashboard",
        "list",
        "dossier",
        "planboard",
        "settings",
        "form",
        "wizard",
        "sheet",
      ]) ||
    pixelGate?.maskPolicy?.default !== "none" ||
    pixelGate?.maskPolicy?.scenarioMaskAllowlist?.length !== 0
  ) {
    errors.push(
      "Pixel-/geometrydrempels of maskerbeleid zijn niet exact vastgezet.",
    );
  }
  const responsiveGate = contract.normalization?.responsiveContractGate;
  const mobileEvidenceContract =
    contract.evidenceContract?.mobileProductionEvidence;
  const expectedDesktopScenarioIds = [
    "dashboard-desktop-clean",
    "planboard-desktop-clean",
    "planboard-desktop-post-placement",
    "customer-list-desktop-clean",
    "customer-dossier-desktop-clean",
    "form-desktop-clean",
    "wizard-desktop-step-one",
    "filter-sheet-desktop-open",
    "settings-desktop-clean",
  ];
  const expectedMobileScenarioIds = [
    "dashboard-mobile-clean",
    "planboard-mobile-agenda-clean",
    "planboard-mobile-timeline-post-placement",
    "customer-list-mobile-clean",
    "customer-dossier-mobile-clean",
    "form-mobile-clean",
    "wizard-mobile-step-one",
    "filter-sheet-mobile-open",
    "settings-mobile-clean",
  ];
  const expectedMobileArtifacts = [
    "screenshot-for-human-review",
    "dom-snapshot",
    "semantic-region-geometry",
    "computed-styles",
    "axe-report",
    "keyboard-interaction-trace",
    "touch-interaction-trace",
    "runtime-error-log",
  ];
  const expectedMobileEvidenceFields = [
    "scenarioId",
    "referenceMode",
    "headCommit",
    "viewport",
    "transformPattern",
    "responsiveContractSha256",
    "prototypeCommit",
    "authorId",
    "provenance",
    "png",
    "domSnapshot",
    "computedGeometry",
    "computedStyles",
    "setupActionLog",
    "runtimeErrorLog",
    "axeReport",
    "keyboardInteractionTrace",
    "touchInteractionTrace",
    "captureBinding",
    "reviewers",
    "assertions",
    "status",
  ];
  if (
    JSON.stringify(pixelGate?.eligibleScenarioIds) !==
      JSON.stringify(expectedDesktopScenarioIds) ||
    responsiveGate?.referenceMode !== "mobile-responsive-contract" ||
    JSON.stringify(responsiveGate?.eligibleViewportIds) !==
      JSON.stringify(["mobile"]) ||
    JSON.stringify(responsiveGate?.eligibleScenarioIds) !==
      JSON.stringify(expectedMobileScenarioIds) ||
    responsiveGate?.prototypePixelComparisonAllowed !== false ||
    JSON.stringify(responsiveGate?.requiredProductionArtifacts) !==
      JSON.stringify(expectedMobileArtifacts) ||
    responsiveGate?.geometryAssertions
      ?.documentHorizontalOverflowTolerancePx !== 1 ||
    responsiveGate?.geometryAssertions?.minimumInteractiveTargetPx !== 44 ||
    responsiveGate?.geometryAssertions
      ?.minimumAdjacentInteractiveTargetGapPx !== 8 ||
    responsiveGate?.geometryAssertions?.minimumAdjacentContainerGapPx !== 16 ||
    responsiveGate?.geometryAssertions?.minimumTextToBorderPaddingPx !== 12 ||
    JSON.stringify(Object.keys(responsiveGate?.transformsByPattern ?? {})) !==
      JSON.stringify([
        "dashboard",
        "list",
        "dossier",
        "planboard",
        "settings",
        "form",
        "wizard",
        "sheet",
      ]) ||
    Object.values(responsiveGate?.transformsByPattern ?? {}).some(
      (pattern) =>
        !Array.isArray(pattern.requiredRegions) ||
        pattern.requiredRegions.length === 0 ||
        !Array.isArray(pattern.assertions) ||
        pattern.assertions.length === 0,
    ) ||
    !Array.isArray(responsiveGate?.accessibilityAssertions) ||
    responsiveGate.accessibilityAssertions.length !== 5 ||
    mobileEvidenceContract?.requiredForReferenceMode !==
      "mobile-responsive-contract" ||
    mobileEvidenceContract?.prototypeCaptureBindingIsSufficient !== false ||
    mobileEvidenceContract?.recordsSource !==
      "The nine scenarioEvidence members whose viewport is mobile; a second detached evidence list is forbidden." ||
    JSON.stringify(mobileEvidenceContract?.requiredFields) !==
      JSON.stringify(expectedMobileEvidenceFields) ||
    JSON.stringify(mobileEvidenceContract?.requiredConstants) !==
      JSON.stringify({
        referenceMode: "mobile-responsive-contract",
        status: "passed",
      }) ||
    JSON.stringify(mobileEvidenceContract?.artifactPathTemplates) !==
      JSON.stringify({
        png: "production/{scenarioId}.png",
        domSnapshot: "production/{scenarioId}.dom.json",
        computedGeometry: "production/{scenarioId}.geometry.json",
        computedStyles: "production/{scenarioId}.styles.json",
        setupActionLog: "production/{scenarioId}.setup.json",
        runtimeErrorLog: "production/{scenarioId}.errors.json",
        axeReport: "production/{scenarioId}.axe.json",
        keyboardInteractionTrace: "production/{scenarioId}.keyboard.json",
        touchInteractionTrace: "production/{scenarioId}.touch.json",
      }) ||
    !Array.isArray(mobileEvidenceContract?.beforeEach) ||
    mobileEvidenceContract.beforeEach.length !== 6 ||
    JSON.stringify(
      Object.keys(mobileEvidenceContract?.setupActionsByScenario ?? {}),
    ) !== JSON.stringify(expectedMobileScenarioIds) ||
    Object.values(mobileEvidenceContract?.setupActionsByScenario ?? {}).some(
      (steps) =>
        !Array.isArray(steps) ||
        steps.length === 0 ||
        steps.some((step) => !isNonEmptyString(step)),
    ) ||
    !mobileEvidenceContract?.setupActionsByScenario?.[
      "planboard-mobile-timeline-post-placement"
    ]?.[0]?.includes("explicit Timeline toggle") ||
    mobileEvidenceContract?.semanticSentinelSource !==
      "normalization.responsiveContractGate.geometryAssertions.requiredShellRegions followed by transformsByPattern[scenario.pattern].requiredRegions with first-occurrence deduplication" ||
    JSON.stringify(
      Object.keys(mobileEvidenceContract?.artifactPayloads ?? {}),
    ) !==
      JSON.stringify([
        "setupActionLog",
        "computedGeometry",
        "domSnapshot",
        "computedStyles",
        "axeReport",
        "keyboardInteractionTrace",
        "touchInteractionTrace",
      ])
  ) {
    errors.push(
      "Mobiele contractreferentie mist de exacte 9/9-partitie, transforms, spacing, Axe en keyboard/touch-productiebewijsvorm.",
    );
  }
  if (
    contract.viewports?.desktop?.width !== 1440 ||
    contract.viewports?.desktop?.height !== 1000 ||
    contract.viewports?.mobile?.width !== 390 ||
    contract.viewports?.mobile?.height !== 844
  ) {
    errors.push("Capturecontract mist de canonieke desktop/mobile viewports.");
  }
  const activeInteractionClaims = [
    "active-pointer-drag",
    "active-touch-placement",
    "active-keyboard-placement",
  ];
  const settledPostPlacementClaims = [
    "post-placement-end-state",
    "undo-availability",
  ];
  if (
    JSON.stringify(contract.proofSemantics?.activeInteractionClaims) !==
      JSON.stringify(activeInteractionClaims) ||
    JSON.stringify(contract.proofSemantics?.settledPostPlacementClaims) !==
      JSON.stringify(settledPostPlacementClaims) ||
    contract.proofSemantics?.rule !==
      "A scenario may prove only its explicit proofClaims. A settled post-placement frame occurs after release or confirmation and therefore cannot prove active pointer drag, active touch placement or active keyboard positioning, regardless of the setup input used."
  ) {
    errors.push(
      "Capturecontract mist de scheiding tussen actieve interactie en settled post-placement bewijs.",
    );
  }

  const rawAnchors = new Set(
    (visualManifest.files ?? []).map((item) => item.file),
  );
  const setupDriver = contract.setupDriver;
  const requiredSetupProfiles = [
    "dashboard-clean",
    "planning-clean",
    "planning-place-fg2062",
    "planning-mobile-agenda",
    "planning-mobile-timeline-place-fg2062",
    "customers-clean",
    "customer-dossier-clean",
    "settings-organization-clean",
    "assignment-wizard-step-one",
    "customer-filter-sheet",
  ];
  const allowedSetupLocatorKinds = new Set([
    "role",
    "css",
    "text",
    "aria-label",
    "toast-description",
  ]);
  if (
    setupDriver?.schemaVersion !== 2 ||
    setupDriver?.engine !== "Playwright locator API" ||
    setupDriver?.freshContextPerScenario !== true ||
    JSON.stringify(setupDriver?.operationSchema) !==
      JSON.stringify({
        allowedOps: [
          "assert",
          "navigate",
          "click",
          "focus",
          "press",
          "waitFor",
        ],
        allowedLocatorKinds: [
          "role",
          "css",
          "text",
          "aria-label",
          "toast-description",
        ],
        navigationFormFactors: ["current", "mobile"],
      }) ||
    requiredSetupProfiles.some((profile) => {
      const setup = setupDriver?.profiles?.[profile];
      return (
        !Array.isArray(setup?.steps) ||
        setup.steps.length === 0 ||
        setup.steps.some(
          (step) => !validSetupOperation(step, allowedSetupLocatorKinds),
        ) ||
        !Array.isArray(setup?.expectedDomSentinels) ||
        setup.expectedDomSentinels.length === 0 ||
        setup.expectedDomSentinels.some(
          (sentinel) => !validSetupLocator(sentinel, allowedSetupLocatorKinds),
        )
      );
    })
  ) {
    errors.push("Exact Playwright setupdriver-/sentinelcontract ontbreekt.");
  }
  const wizardProfile = setupDriver?.profiles?.["assignment-wizard-step-one"];
  if (
    JSON.stringify(wizardProfile?.expectedDomSentinels) !==
      JSON.stringify([
        { by: "role", role: "dialog" },
        {
          by: "role",
          role: "heading",
          name: "Nieuwe opdracht",
          exact: true,
        },
        { by: "text", value: "Stap 1 van 5", exact: true },
        { by: "css", value: ".wizard-body" },
      ]) ||
    JSON.stringify(wizardProfile?.steps) !==
      JSON.stringify([
        { op: "navigate", label: "Opdrachten", formFactor: "current" },
        {
          op: "click",
          locator: {
            by: "role",
            role: "button",
            name: "Nieuwe opdracht",
            exact: true,
            within: { by: "css", value: ".workspace-heading" },
          },
        },
      ])
  ) {
    errors.push(
      "Opdrachtwizard-capture moet exact de vijfstaps prototypefixture openen.",
    );
  }
  try {
    const prototypeSource = readJson(
      resolve(packageRoot, "evidence/prototype/source-manifest.json"),
    );
    const archivePath = resolve(
      packageRoot,
      "evidence/prototype",
      prototypeSource.archive.file,
    );
    const member = `${prototypeSource.archive.rootDirectory}/${prototypeSource.canonicalFiles.component}`;
    const prototypeComponent = execFileSync(
      "tar",
      ["-xOzf", archivePath, member],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    if (
      !/view\s*===\s*"assignments"/u.test(prototypeComponent) ||
      !/entity\s*===\s*"opdracht"\s*\?\s*\[\s*"Aanvraag",\s*"Klant & locatie",\s*"Uitvoering",\s*"Planning",\s*"Controle"\s*\]/u.test(
        prototypeComponent,
      ) ||
      !/Stap\s*\{step \+ 1\}\s*van\s*\{steps\.length\}/u.test(
        prototypeComponent,
      )
    ) {
      errors.push(
        "Vastgezette prototypebron bewijst de vijfstaps opdrachtwizard niet.",
      );
    }
  } catch (error) {
    errors.push(
      `Opdrachtwizard kan niet tegen de prototypearchive worden getoetst: ${error}`,
    );
  }
  const placementProfile = setupDriver?.profiles?.["planning-place-fg2062"];
  const placementSteps = placementProfile?.steps ?? [];
  const placementSentinels = placementProfile?.expectedDomSentinels ?? [];
  if (
    !placementSteps.some(
      (step) =>
        step.op === "click" &&
        step.locator?.name === "Plan" &&
        step.locator?.within?.value === "FG-2062",
    ) ||
    !placementSteps.some(
      (step) =>
        step.op === "focus" &&
        step.locator?.role === "gridcell" &&
        step.locator?.name === "Plan Avondsluiting bij Rayan Akachar",
    ) ||
    !placementSteps.some(
      (step) => step.op === "press" && step.key === "Enter" && step.times === 1,
    ) ||
    !placementSteps.some(
      (step) =>
        step.op === "waitFor" &&
        step.locator?.by === "toast-description" &&
        step.locator?.value === "08:00–10:30 · gecontroleerd op overlap",
    ) ||
    !placementSentinels.some(
      (locator) => locator.by === "text" && locator.value === "Ongedaan maken",
    )
  ) {
    errors.push(
      "Canonieke post-placement capturestappen zijn niet deterministisch.",
    );
  }
  const requiredScenarioIds = new Set([
    "dashboard-desktop-clean",
    "dashboard-mobile-clean",
    "planboard-desktop-clean",
    "planboard-desktop-post-placement",
    "planboard-mobile-agenda-clean",
    "planboard-mobile-timeline-post-placement",
    "customer-list-desktop-clean",
    "customer-list-mobile-clean",
    "customer-dossier-desktop-clean",
    "customer-dossier-mobile-clean",
    "form-desktop-clean",
    "form-mobile-clean",
    "wizard-desktop-step-one",
    "wizard-mobile-step-one",
    "filter-sheet-desktop-open",
    "filter-sheet-mobile-open",
    "settings-desktop-clean",
    "settings-mobile-clean",
  ]);
  const expectedPostPlacementProof = new Map([
    [
      "planboard-desktop-post-placement",
      {
        proofClaims: settledPostPlacementClaims,
        excludedProofClaims: activeInteractionClaims,
      },
    ],
    [
      "planboard-mobile-timeline-post-placement",
      {
        proofClaims: settledPostPlacementClaims,
        excludedProofClaims: [
          ...activeInteractionClaims,
          "complete-mobile-non-drag-flow",
        ],
      },
    ],
  ]);
  const seen = new Set();
  const seenOutputs = new Set();
  for (const scenario of contract.scenarios ?? []) {
    if (!scenario.id || seen.has(scenario.id)) {
      errors.push(`Dubbel/ontbrekend capture-scenario: ${scenario.id}.`);
    }
    seen.add(scenario.id);
    if (
      !scenario.pattern ||
      !scenario.viewport ||
      !scenario.state ||
      !scenario.output ||
      !setupDriver?.profiles?.[scenario.setupProfile]
    ) {
      errors.push(`${scenario.id}: capturemetadata is onvolledig.`);
    }
    if (!Object.hasOwn(contract.viewports ?? {}, scenario.viewport)) {
      errors.push(
        `${scenario.id}: onbekende captureviewport ${scenario.viewport}.`,
      );
    }
    if (
      !Number.isFinite(scenario.workspaceScroll?.top) ||
      !Number.isFinite(scenario.workspaceScroll?.left)
    ) {
      errors.push(`${scenario.id}: workspaceScroll moet exact numeriek zijn.`);
    }
    if (scenario.rawAnchor && !rawAnchors.has(scenario.rawAnchor)) {
      errors.push(`${scenario.id}: onbekende rawAnchor ${scenario.rawAnchor}.`);
    }
    if (
      !isSafeRelativePath(
        scenario.output,
        resolve(packageRoot, "evidence/visual"),
      ) ||
      !scenario.output?.startsWith("normalized/")
    ) {
      errors.push(`${scenario.id}: output hoort onder normalized/.`);
    } else if (seenOutputs.has(scenario.output)) {
      errors.push(
        `${scenario.id}: outputpad is niet uniek: ${scenario.output}.`,
      );
    }
    seenOutputs.add(scenario.output);
    if (scenario.boardScroll && !Number.isFinite(scenario.boardScroll.left)) {
      errors.push(`${scenario.id}: boardScroll.left moet exact numeriek zijn.`);
    }
    const expectedProof = expectedPostPlacementProof.get(scenario.id);
    if (
      expectedProof &&
      (JSON.stringify(scenario.proofClaims) !==
        JSON.stringify(expectedProof.proofClaims) ||
        JSON.stringify(scenario.excludedProofClaims) !==
          JSON.stringify(expectedProof.excludedProofClaims) ||
        scenario.proofClaims.some((claim) =>
          activeInteractionClaims.includes(claim),
        ) ||
        activeInteractionClaims.some(
          (claim) => !scenario.excludedProofClaims.includes(claim),
        ))
    ) {
      errors.push(
        `${scenario.id}: settled post-placement mag geen actief drag/touch/keyboardbewijs claimen.`,
      );
    }
  }
  for (const id of requiredScenarioIds) {
    if (!seen.has(id))
      errors.push(`Verplicht capture-scenario ontbreekt: ${id}.`);
  }
  if ((contract.scenarios ?? []).length !== requiredScenarioIds.size) {
    errors.push(
      "Capturecontract moet exact de 18 canonieke pattern-/componentstaten bevatten.",
    );
  }
  const capturedPatterns = new Set(
    (contract.scenarios ?? []).map((scenario) => scenario.pattern),
  );
  for (const pattern of [
    "dashboard",
    "list",
    "dossier",
    "planboard",
    "settings",
    "form",
    "wizard",
    "sheet",
  ]) {
    if (!capturedPatterns.has(pattern)) {
      errors.push(`Capturecontract mist pattern/componentstate ${pattern}.`);
    }
  }
  const requiredEvidenceFields = [
    "png",
    "domSnapshot",
    "computedGeometry",
    "computedStyles",
    "setupActionLog",
    "runtimeErrorLog",
    "authorId",
    "reviewers",
    "prototypeCommit",
    "provenance",
    "captureBinding",
  ];
  const expectedArtifactPathTemplates = {
    png: "{scenario.output}",
    domSnapshot: "normalized/{scenarioId}.dom.json",
    computedGeometry: "normalized/{scenarioId}.geometry.json",
    computedStyles: "normalized/{scenarioId}.styles.json",
    setupActionLog: "normalized/{scenarioId}.setup.json",
    runtimeErrorLog: "normalized/{scenarioId}.errors.json",
  };
  const requiredRuntimeErrorArrays = [
    "consoleErrors",
    "consoleWarnings",
    "pageErrors",
    "requestFailures",
    "httpResponses400Plus",
    "serverErrors",
    "hydrationErrors",
    "unhandledRejections",
    "unexpectedThirdPartyRequests",
  ];
  if (
    contract.evidenceContract?.schemaVersion !== 2 ||
    contract.evidenceContract?.requiredAtState !== "BASELINE_READY" ||
    contract.evidenceContract?.artifactPathBase !== "evidence/visual" ||
    contract.evidenceContract?.contractRoot?.algorithm !== "sha256" ||
    !contract.evidenceContract?.contractRoot?.serialization?.startsWith(
      "JSON.stringify of schemaVersion",
    ) ||
    requiredEvidenceFields.some(
      (field) => !contract.evidenceContract?.perScenarioFields?.[field],
    ) ||
    JSON.stringify(contract.evidenceContract?.perScenarioPathTemplates) !==
      JSON.stringify(expectedArtifactPathTemplates) ||
    JSON.stringify(contract.evidenceContract?.requiredReviewerRoles) !==
      JSON.stringify(["product-design", "visual-a11y"]) ||
    JSON.stringify(contract.evidenceContract?.provenanceSchema) !==
      JSON.stringify({
        provider: "github-actions",
        repository: "veele-services/platform",
        workflowPath: ".github/workflows/fieldflow-calm-visual-baseline.yml",
        workflowBlobSha256:
          "64 lowercase hex characters, identical on PR base and head",
        jobName: "normalized-baseline",
        jobId: "positive integer",
        eventName: "pull_request",
        runId: "positive integer",
        runAttempt: "positive integer",
        headCommit: "40 lowercase hex characters",
        baseCommit: "different 40 lowercase hex ancestor",
        pullRequestNumber: "positive integer",
        attestationProvider: "github-artifact-attestations",
      }) ||
    JSON.stringify(contract.evidenceContract?.reviewerSchema?.roles) !==
      JSON.stringify(["product-design", "visual-a11y"]) ||
    contract.evidenceContract?.reviewerSchema?.independent !== true ||
    contract.evidenceContract?.reviewerSchema?.selfReview !== false ||
    contract.evidenceContract?.reviewerSchema?.approvalProvider !==
      "github-pull-request-review" ||
    contract.evidenceContract?.reviewerSchema?.approvalState !== "APPROVED" ||
    contract.evidenceContract?.artifactSchemas?.commonBinding?.schemaVersion !==
      1 ||
    contract.evidenceContract?.artifactSchemas?.setupActionLog?.artifactType !==
      "setup-action-log" ||
    contract.evidenceContract?.artifactSchemas?.runtimeErrorLog
      ?.artifactType !== "runtime-error-log" ||
    JSON.stringify(
      contract.evidenceContract?.artifactSchemas?.runtimeErrorLog?.emptyArrays,
    ) !== JSON.stringify(requiredRuntimeErrorArrays) ||
    contract.evidenceContract?.artifactSchemas?.computedGeometry
      ?.artifactType !== "computed-geometry" ||
    JSON.stringify(
      contract.evidenceContract?.artifactSchemas?.computedGeometry
        ?.maximumAbsoluteDeltaPxByReferenceMode,
    ) !==
      JSON.stringify({
        "desktop-canonical-pixel": 1,
        "mobile-responsive-contract-internal-consistency": 1,
      }) ||
    contract.evidenceContract?.artifactSchemas?.computedGeometry
      ?.minimumInteractiveTargetPx !== 44 ||
    contract.evidenceContract?.artifactSchemas?.computedStyles?.artifactType !==
      "computed-styles" ||
    contract.evidenceContract?.artifactSchemas?.mobileAxeReport
      ?.artifactType !== "axe-report" ||
    contract.evidenceContract?.artifactSchemas?.mobileAxeReport
      ?.appliesToReferenceMode !== "mobile-responsive-contract" ||
    contract.evidenceContract?.artifactSchemas?.mobileAxeReport
      ?.maximumCriticalViolations !== 0 ||
    contract.evidenceContract?.artifactSchemas?.mobileAxeReport
      ?.maximumSeriousViolations !== 0 ||
    contract.evidenceContract?.artifactSchemas?.mobileInteractionTrace
      ?.artifactType !== "interaction-trace" ||
    JSON.stringify(
      contract.evidenceContract?.artifactSchemas?.mobileInteractionTrace
        ?.requiredInputModes,
    ) !== JSON.stringify(["keyboard", "touch"]) ||
    contract.evidenceContract?.artifactSchemas?.domSnapshot?.artifactType !==
      "dom-snapshot" ||
    JSON.stringify(
      contract.evidenceContract?.artifactSchemas?.domSnapshot
        ?.forbiddenSelectors,
    ) !== JSON.stringify([".lab-bar", ".concept-caption"]) ||
    JSON.stringify(
      contract.evidenceContract?.artifactSchemas?.domSnapshot
        ?.forbiddenAccessibleNames,
    ) !== JSON.stringify(["Herstel demo"])
  ) {
    errors.push("Capturecontract mist verplicht bewijs per baseline-output.");
  }
  if (contract.state === "CONTRACTED") {
    if (
      contract.environment?.runtimeImageDigest?.value !== null ||
      contract.environment?.fonts?.resolvedFiles !== null ||
      contract.evidenceContract?.scenarioEvidence !== null
    ) {
      errors.push(
        "CONTRACTED capturecontract mag geen onbewezen baselinebewijs claimen.",
      );
    }
  }
  if (contract.state === "BASELINE_READY") {
    if (
      !/^sha256:[0-9a-f]{64}$/u.test(
        contract.environment?.runtimeImageDigest?.value ?? "",
      )
    ) {
      errors.push("BASELINE_READY vereist een exacte runtime-image digest.");
    }
    const fontFiles = contract.environment?.fonts?.resolvedFiles;
    if (
      !Array.isArray(fontFiles) ||
      fontFiles.length === 0 ||
      fontFiles.some(
        (font) =>
          !font.family ||
          !font.file ||
          !/^[0-9a-f]{64}$/u.test(font.sha256 ?? ""),
      )
    ) {
      errors.push("BASELINE_READY vereist hashes van alle opgeloste fonts.");
    }
    const scenarioEvidence = contract.evidenceContract?.scenarioEvidence;
    if (
      !Array.isArray(scenarioEvidence) ||
      scenarioEvidence.length !== requiredScenarioIds.size
    ) {
      errors.push(
        "BASELINE_READY vereist exact één evidence-record per scenario.",
      );
    } else {
      const evidenceIds = new Set();
      const evidenceArtifactPaths = new Set();
      const visualRoot = resolve(
        packageRoot,
        contract.evidenceContract.artifactPathBase,
      );
      for (const evidence of scenarioEvidence) {
        if (evidenceIds.has(evidence.scenarioId)) {
          errors.push(
            `${evidence.scenarioId}: dubbel baseline-evidencerecord.`,
          );
        }
        evidenceIds.add(evidence.scenarioId);
        if (
          !seen.has(evidence.scenarioId) ||
          evidence.prototypeCommit !== PROTOTYPE_COMMIT
        ) {
          errors.push(
            `${evidence.scenarioId}: baseline-identiteit/prototypebinding ontbreekt.`,
          );
        }
        const scenario = contract.scenarios.find(
          (candidate) => candidate.id === evidence.scenarioId,
        );
        const parsedArtifacts = {};
        const artifactFields = [
          "png",
          "domSnapshot",
          "computedGeometry",
          "computedStyles",
          "setupActionLog",
          "runtimeErrorLog",
          ...(scenario?.viewport === "mobile"
            ? ["axeReport", "keyboardInteractionTrace", "touchInteractionTrace"]
            : []),
        ];
        for (const field of artifactFields) {
          const artifact = evidence[field];
          const expectedArtifactKeys =
            field === "png"
              ? ["path", "sha256", "width", "height"]
              : ["path", "sha256"];
          const mobilePathTemplate =
            scenario?.viewport === "mobile"
              ? contract.evidenceContract?.mobileProductionEvidence
                  ?.artifactPathTemplates?.[field]
              : null;
          const pathTemplate =
            mobilePathTemplate ?? expectedArtifactPathTemplates[field];
          const expectedPath =
            field === "png" && scenario?.viewport !== "mobile"
              ? scenario?.output
              : pathTemplate?.replace("{scenarioId}", evidence.scenarioId);
          if (
            !hasExactObjectKeys(artifact, expectedArtifactKeys) ||
            !isSafeRelativePath(artifact?.path, visualRoot) ||
            !/^[0-9a-f]{64}$/u.test(artifact?.sha256 ?? "")
          ) {
            errors.push(`${evidence.scenarioId}: ${field} pad/hash ontbreekt.`);
            continue;
          }
          if (artifact.path !== expectedPath) {
            errors.push(
              `${evidence.scenarioId}: ${field} is niet scenario-gebonden (${expectedPath}).`,
            );
          }
          if (evidenceArtifactPaths.has(artifact.path)) {
            errors.push(
              `${evidence.scenarioId}: baseline-artifactpad is niet uniek: ${artifact.path}.`,
            );
          }
          evidenceArtifactPaths.add(artifact.path);
          const artifactPath = resolve(visualRoot, artifact.path);
          if (!existsSync(artifactPath) || !statSync(artifactPath).isFile()) {
            errors.push(`${evidence.scenarioId}: ${field} bestaat niet.`);
          } else if (hashFile(artifactPath) !== artifact.sha256) {
            errors.push(`${evidence.scenarioId}: ${field} filehash wijkt af.`);
          } else if (field !== "png") {
            parsedArtifacts[field] = readCaptureJsonArtifact(
              errors,
              evidence.scenarioId,
              visualRoot,
              artifact,
            );
          }
        }
        errors.push(
          ...validateBaselineScenarioEvidencePayload(
            contract,
            scenario,
            evidence,
            parsedArtifacts,
          ),
        );
        if (
          !Number.isInteger(evidence.png?.width) ||
          !Number.isInteger(evidence.png?.height)
        ) {
          errors.push(`${evidence.scenarioId}: PNG-afmetingen ontbreken.`);
        } else if (scenario) {
          const viewport = contract.viewports[scenario.viewport];
          const expectedPngPath =
            scenario.viewport === "mobile"
              ? contract.evidenceContract.mobileProductionEvidence.artifactPathTemplates.png.replace(
                  "{scenarioId}",
                  scenario.id,
                )
              : scenario.output;
          if (
            evidence.png.path !== expectedPngPath ||
            evidence.png.width !== viewport.width ||
            evidence.png.height !== viewport.height
          ) {
            errors.push(
              `${evidence.scenarioId}: PNG-output/viewport wijkt af.`,
            );
          } else {
            const pngPath = resolve(visualRoot, evidence.png.path);
            if (existsSync(pngPath)) {
              const dimensions = readPngDimensions(pngPath);
              if (
                dimensions.width !== evidence.png.width ||
                dimensions.height !== evidence.png.height
              ) {
                errors.push(
                  `${evidence.scenarioId}: echte PNG-afmeting wijkt af.`,
                );
              }
            }
          }
        }
        const attestedPngPath =
          isSafeRelativePath(evidence.png?.path, visualRoot) &&
          existsSync(resolve(visualRoot, evidence.png.path)) &&
          statSync(resolve(visualRoot, evidence.png.path)).isFile() &&
          hashFile(resolve(visualRoot, evidence.png.path)) ===
            evidence.png.sha256
            ? resolve(visualRoot, evidence.png.path)
            : null;
        validateBaselineExternalEvidence(errors, evidence, attestedPngPath);
      }
      for (const scenarioId of seen) {
        if (!evidenceIds.has(scenarioId)) {
          errors.push(`${scenarioId}: BASELINE_READY evidence ontbreekt.`);
        }
      }
    }
  }
}

function validatePrototypeSource(errors, packageRoot, sourceManifest) {
  const archive = sourceManifest.archive;
  const prototypeRoot = resolve(packageRoot, "evidence/prototype");
  const archivePath = resolve(prototypeRoot, archive?.file ?? "");
  if (
    sourceManifest.schemaVersion !== 1 ||
    sourceManifest.commit !== PROTOTYPE_COMMIT ||
    sourceManifest.tree !== "f151330872f0cd224f197a89fb04c9091235bc8f" ||
    archive?.format !== "tar.gz" ||
    archive?.bytes !== 258513 ||
    archive?.trackedFiles !== 99 ||
    archive?.trackedBytes !== 1351451
  ) {
    errors.push("Prototype-source manifest wijkt af van de vastgezette bron.");
    return;
  }
  if (
    !existsSync(archivePath) ||
    statSync(archivePath).size !== archive.bytes
  ) {
    errors.push(
      "Zelfstandige prototype-sourcearchive ontbreekt of heeft verkeerde omvang.",
    );
    return;
  }
  if (hashFile(archivePath) !== archive.sha256) {
    errors.push("SHA-256 van de prototype-sourcearchive wijkt af.");
  }
  try {
    const listing = execFileSync("tar", ["-tzf", archivePath], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    const root = `${archive.rootDirectory}/`;
    for (const canonicalPath of Object.values(
      sourceManifest.canonicalFiles ?? {},
    )) {
      if (!listing.split("\n").includes(`${root}${canonicalPath}`)) {
        errors.push(`Prototype-archive mist canonieke bron: ${canonicalPath}.`);
      }
    }
  } catch (error) {
    errors.push(`Prototype-archive kan niet worden gelezen: ${error}`);
  }
}

function validateNoUnresolvedMarkers(errors, packageRoot) {
  const forbidden = [/\bTBD\b/iu, /\bWIP\b/iu, /lorem ipsum/iu, /\?\?\?/u];
  const files = REQUIRED_DOCS.filter((file) => file.endsWith(".md"));
  for (const file of files) {
    const content = readFileSync(resolve(packageRoot, file), "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(content)) {
        errors.push(`${file}: onopgeloste marker ${pattern}.`);
      }
    }
  }
}

export function computeNormativeDocsDigest(packageRoot) {
  const serializedDocs = NORMATIVE_DOC_FILES.map(
    (file) => `${file}:${hashFile(resolve(packageRoot, file))}`,
  )
    .sort()
    .join("\n");
  return createHash("sha256").update(serializedDocs).digest("hex");
}

function hashOptionalFile(path) {
  return existsSync(path) && statSync(path).isFile() ? hashFile(path) : null;
}

function listTrustedDependencyInputPaths(root) {
  const output = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".npmrc",
      ".pnpmfile.cjs",
      ".pnpmfile.js",
      "pnpmfile.cjs",
      "pnpmfile.js",
      ":(glob)**/package.json",
      ":(glob)**/.npmrc",
      ":(glob)**/.pnpmfile.cjs",
      ":(glob)**/.pnpmfile.js",
      ":(glob)patches/**",
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return [...new Set(output.split("\0").filter(Boolean))].sort();
}

export function computeTrustedDependencyInputsDigest(root = ROOT) {
  const paths = [
    ...new Set([
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".npmrc",
      ".pnpmfile.cjs",
      ".pnpmfile.js",
      "pnpmfile.cjs",
      "pnpmfile.js",
      ...listTrustedDependencyInputPaths(root),
    ]),
  ].sort();
  const serialization = paths
    .map(
      (path) => `${path}:${hashOptionalFile(resolve(root, path)) ?? "ABSENT"}`,
    )
    .join("\n");
  return createHash("sha256").update(serialization).digest("hex");
}

export function validateCandidateCheckoutSafety(
  errors,
  { root, expectedCommit } = {},
) {
  try {
    if (!/^[0-9a-f]{40}$/u.test(expectedCommit ?? "")) {
      errors.push("Kandidaatcontrole vereist één exacte 40-tekens commit-SHA.");
      return;
    }
    const topLevel = resolve(
      execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    );
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    if (topLevel !== resolve(root) || head !== expectedCommit) {
      errors.push(
        "Kandidaatcheckout is niet exact de opgegeven immutable commit/root.",
      );
    }
    const status = execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    if (status.trim()) {
      errors.push(
        "Kandidaatcheckout bevat gewijzigde of untracked bestanden; filesystemvalidatie is niet immutable.",
      );
    }
    const tree = execFileSync(
      "git",
      ["ls-tree", "-r", "-z", "--full-tree", expectedCommit],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const unsafeEntries = tree
      .split("\0")
      .filter(Boolean)
      .map((entry) => /^(\d+)\s+(\S+)\s+[0-9a-f]+\t(.+)$/u.exec(entry))
      .filter(
        (match) =>
          !match ||
          match[2] !== "blob" ||
          !["100644", "100755"].includes(match[1]),
      )
      .map((match) => match?.[3] ?? "onleesbaar tree-entry");
    if (unsafeEntries.length > 0) {
      errors.push(
        `Kandidaat-Git-tree bevat symlinks, submodules of niet-reguliere blobs: ${unsafeEntries.join(", ")}.`,
      );
    }
  } catch (error) {
    errors.push(
      `Kandidaatcheckout kon niet fail-closed worden gevalideerd: ${error}`,
    );
  }
}

export function computeFieldflowContractDigests({
  root = ROOT,
  packageRoot = resolve(root, "docs/uiux/fieldflow-calm-handoff"),
} = {}) {
  const routes = readJson(resolve(packageRoot, "manifests/routes.json"));
  const inventory = readJson(
    resolve(packageRoot, "manifests/production-inventory.json"),
  );
  const mismatchTraceability = readJson(
    resolve(packageRoot, "manifests/mismatch-traceability.json"),
  );
  const navigationContract = readJson(
    resolve(packageRoot, "manifests/navigation-contract.json"),
  );
  const componentApiContract = readJson(
    resolve(packageRoot, "manifests/component-api-contract.json"),
  );
  const planboardActions = readJson(
    resolve(packageRoot, "manifests/planboard-actions.json"),
  );
  const verificationMatrix = readJson(
    resolve(packageRoot, "manifests/verification-matrix.json"),
  );
  const verificationMatrixSchema = readJson(
    resolve(packageRoot, "reference/verification-matrix.schema.json"),
  );
  const acceptance = readJson(
    resolve(packageRoot, "manifests/acceptance.json"),
  );
  const risks = readJson(resolve(packageRoot, "manifests/risks.json"));
  const tokens = readJson(
    resolve(packageRoot, "manifests/fieldflow-tokens.json"),
  );
  const componentStates = readJson(
    resolve(packageRoot, "manifests/component-states.json"),
  );
  const componentSourceCoverage = readJson(
    resolve(packageRoot, "manifests/component-source-coverage.json"),
  );
  const themeDerivation = readJson(
    resolve(packageRoot, "manifests/theme-derivation.json"),
  );
  const surfaces = readJson(resolve(packageRoot, "manifests/surfaces.json"));
  const visual = readJson(
    resolve(packageRoot, "evidence/visual/manifest.json"),
  );
  const capture = readJson(
    resolve(packageRoot, "evidence/visual/capture-contract.json"),
  );
  const prototypeSource = readJson(
    resolve(packageRoot, "evidence/prototype/source-manifest.json"),
  );
  const packageJson = readJson(resolve(root, "package.json"));
  const productionSource = computeProductionSourceDigest(root, inventory);
  const prototypeArchivePath = resolve(
    packageRoot,
    "evidence/prototype",
    prototypeSource.archive?.file ?? "",
  );
  const visualAnchorSerialization = (visual.files ?? [])
    .map((record) => {
      const path = resolve(packageRoot, "evidence/visual", record.file);
      return `${record.file}:${hashOptionalFile(path) ?? "MISSING"}`;
    })
    .sort()
    .join("\n");

  return {
    routes: hashJson(routes),
    productionInventory: hashJson(inventory),
    mismatchTraceability: hashJson(mismatchTraceability),
    navigationContract: hashJson(navigationContract),
    componentApiContract: hashJson(componentApiContract),
    planboardActions: hashJson(planboardActions),
    verificationMatrix: hashJson(verificationMatrix),
    verificationMatrixSchema: hashJson(verificationMatrixSchema),
    productionSource: productionSource.digest,
    acceptanceContract: hashJson(
      lifecycleIndependentContract(acceptance, "requirements"),
    ),
    risksContract: hashJson(lifecycleIndependentContract(risks, "risks")),
    tokens: hashJson(tokens),
    componentStates: hashJson(componentStates),
    componentSourceCoverage: hashJson(componentSourceCoverage),
    themeDerivation: hashJson(themeDerivation),
    surfaces: hashJson(surfaces),
    visualManifest: hashJson(visual),
    visualAnchorFiles: createHash("sha256")
      .update(visualAnchorSerialization)
      .digest("hex"),
    captureContract: computeCaptureContractRootSha256(capture),
    prototypeSourceManifest: hashJson(prototypeSource),
    prototypeArchive: hashOptionalFile(prototypeArchivePath),
    normativeDocs: computeNormativeDocsDigest(packageRoot),
    canonicalThemeCss: hashOptionalFile(
      resolve(packageRoot, "evidence/visual/canonical-theme.css"),
    ),
    referenceNormalizationCss: hashOptionalFile(
      resolve(packageRoot, "evidence/visual/reference-normalization.css"),
    ),
    themeReferenceImplementation: hashOptionalFile(
      resolve(packageRoot, "reference/theme-derivation.mjs"),
    ),
    themeReferenceTests: hashOptionalFile(
      resolve(packageRoot, "reference/theme-derivation.test.mjs"),
    ),
    validator: hashOptionalFile(resolve(root, CONTRACT_ROOT_VALIDATOR_PATH)),
    primaryTests: hashOptionalFile(resolve(root, CONTRACT_ROOT_TEST_PATH)),
    contractRootOracleTests: hashOptionalFile(
      resolve(root, CONTRACT_ROOT_ORACLE_TEST_PATH),
    ),
    trustedDependencyInputs: computeTrustedDependencyInputsDigest(root),
    trustedRootWorkflow: hashOptionalFile(
      resolve(root, CONTRACT_ROOT_WORKFLOW_PATH),
    ),
    packageCommand: createHash("sha256")
      .update(packageJson.scripts?.[CONTRACT_ROOT_PACKAGE_SCRIPT] ?? "MISSING")
      .digest("hex"),
  };
}

export function computeFieldflowContractRootSha256(manifest) {
  return hashJson({
    schemaVersion: manifest.schemaVersion,
    name: manifest.name,
    algorithm: manifest.algorithm,
    serialization: manifest.serialization,
    trustPolicy: manifest.trustPolicy,
    digests: manifest.digests,
  });
}

export function validateFieldflowContractRoot(
  errors,
  {
    root = ROOT,
    packageRoot = resolve(root, "docs/uiux/fieldflow-calm-handoff"),
    manifest,
    requireExternalTrust = false,
    trustedRoot = process.env.FIELDFLOW_CALM_TRUSTED_ROOT_SHA256,
  } = {},
) {
  if (
    !hasExactKeys(manifest, [
      "schemaVersion",
      "name",
      "algorithm",
      "serialization",
      "trustPolicy",
      "digests",
      "rootSha256",
    ]) ||
    manifest.schemaVersion !== 1 ||
    manifest.name !== "Fieldflow Calm protected contract root" ||
    manifest.algorithm !== "sha256" ||
    manifest.serialization !==
      "SHA-256 of JSON.stringify({schemaVersion,name,algorithm,serialization,trustPolicy,digests}) with the property order stored in this manifest" ||
    JSON.stringify(manifest.trustPolicy) !==
      JSON.stringify(CONTRACT_ROOT_TRUST_POLICY)
  ) {
    errors.push(
      "Fieldflow contract-rootidentiteit of trustpolicy is ongeldig.",
    );
    return;
  }
  const computedDigests = computeFieldflowContractDigests({
    root,
    packageRoot,
  });
  if (JSON.stringify(manifest.digests) !== JSON.stringify(computedDigests)) {
    errors.push(
      "Fieldflow contract-rootdigestvector wijkt af; een normatief manifest, bewijsbron, validator, test, workflow of packagecommand is gewijzigd.",
    );
  }
  const computedRoot = computeFieldflowContractRootSha256(manifest);
  if (
    !/^[0-9a-f]{64}$/u.test(manifest.rootSha256 ?? "") ||
    manifest.rootSha256 !== computedRoot
  ) {
    errors.push("Fieldflow contract-root SHA-256 is ongeldig.");
  }
  if (
    requireExternalTrust &&
    (!/^[0-9a-f]{64}$/u.test(trustedRoot ?? "") ||
      trustedRoot !== manifest.rootSha256)
  ) {
    errors.push(
      "Een gevorderde lifecycleclaim vereist de exact overeenkomende beschermde FIELDFLOW_CALM_TRUSTED_ROOT_SHA256.",
    );
  }
}

function requiresProtectedContractRoot(acceptance, risks, captureContract) {
  return (
    (acceptance.requirements ?? []).some(
      (requirement) => requirement.state !== "CONTRACTED",
    ) ||
    (risks.risks ?? []).some((risk) => risk.state !== "OPEN") ||
    captureContract.state !== "CONTRACTED"
  );
}

function validateCollectionLifecycleTransition(
  errors,
  { label, idField, itemsField, states, base, candidate },
) {
  const baseItems = new Map(
    (base?.[itemsField] ?? []).map((item) => [item[idField], item]),
  );
  for (const candidateItem of candidate?.[itemsField] ?? []) {
    const id = candidateItem[idField];
    const baseItem = baseItems.get(id);
    if (!baseItem) continue;
    const from = states.indexOf(baseItem.state);
    const to = states.indexOf(candidateItem.state);
    if (from < 0 || to < 0 || to < from || to > from + 1) {
      errors.push(
        `${label} ${id}: lifecycle mag niet downgraden of een status overslaan (${baseItem.state} -> ${candidateItem.state}).`,
      );
      continue;
    }
    if (
      to === from &&
      JSON.stringify(candidateItem.evidence ?? null) !==
        JSON.stringify(baseItem.evidence ?? null)
    ) {
      errors.push(
        `${label} ${id}: bewijs mag niet worden vervangen zonder een lifecycletransitie of afzonderlijke rootrotatie/correctie.`,
      );
    }
  }
}

export function validateLifecycleTransition(
  errors,
  { basePackageRoot, candidatePackageRoot } = {},
) {
  try {
    const baseAcceptance = readJson(
      resolve(basePackageRoot, "manifests/acceptance.json"),
    );
    const candidateAcceptance = readJson(
      resolve(candidatePackageRoot, "manifests/acceptance.json"),
    );
    validateCollectionLifecycleTransition(errors, {
      label: "Acceptance-eis",
      idField: "id",
      itemsField: "requirements",
      states: [
        "CONTRACTED",
        "IMPLEMENTED",
        "VERIFIED_LOCAL",
        "VERIFIED_STAGING",
        "RELEASED",
      ],
      base: baseAcceptance,
      candidate: candidateAcceptance,
    });

    const baseRisks = readJson(
      resolve(basePackageRoot, "manifests/risks.json"),
    );
    const candidateRisks = readJson(
      resolve(candidatePackageRoot, "manifests/risks.json"),
    );
    validateCollectionLifecycleTransition(errors, {
      label: "Risico",
      idField: "id",
      itemsField: "risks",
      states: [
        "OPEN",
        "MITIGATED",
        "VERIFIED_LOCAL",
        "VERIFIED_STAGING",
        "CLOSED",
      ],
      base: baseRisks,
      candidate: candidateRisks,
    });

    const baseCapture = readJson(
      resolve(basePackageRoot, "evidence/visual/capture-contract.json"),
    );
    const candidateCapture = readJson(
      resolve(candidatePackageRoot, "evidence/visual/capture-contract.json"),
    );
    const captureStates = ["CONTRACTED", "BASELINE_READY"];
    const from = captureStates.indexOf(baseCapture.state);
    const to = captureStates.indexOf(candidateCapture.state);
    if (from < 0 || to < 0 || to < from || to > from + 1) {
      errors.push(
        `Visuele baseline: lifecycle mag niet downgraden of een status overslaan (${baseCapture.state} -> ${candidateCapture.state}).`,
      );
    } else if (
      to === from &&
      JSON.stringify({
        runtimeImageDigest: candidateCapture.environment?.runtimeImageDigest,
        resolvedFonts: candidateCapture.environment?.fonts?.resolvedFiles,
        scenarioEvidence:
          candidateCapture.evidenceContract?.scenarioEvidence ?? null,
      }) !==
        JSON.stringify({
          runtimeImageDigest: baseCapture.environment?.runtimeImageDigest,
          resolvedFonts: baseCapture.environment?.fonts?.resolvedFiles,
          scenarioEvidence:
            baseCapture.evidenceContract?.scenarioEvidence ?? null,
        })
    ) {
      errors.push(
        "Visuele baseline: bewijsvelden mogen niet worden vervangen zonder CONTRACTED -> BASELINE_READY of afzonderlijke rootrotatie/correctie.",
      );
    }
  } catch (error) {
    errors.push(
      `Lifecycletransitie kon niet fail-closed worden vergeleken: ${error}`,
    );
  }
}

const FIELDFLOW_PACKAGE_PATH = "docs/uiux/fieldflow-calm-handoff";
const ACCEPTANCE_MANIFEST_PATH = `${FIELDFLOW_PACKAGE_PATH}/manifests/acceptance.json`;
const RISKS_MANIFEST_PATH = `${FIELDFLOW_PACKAGE_PATH}/manifests/risks.json`;
const CAPTURE_CONTRACT_PATH = `${FIELDFLOW_PACKAGE_PATH}/evidence/visual/capture-contract.json`;

function readGitJson(root, commit, path, errors, label) {
  const bytes = readGitFile(root, commit, path);
  if (!bytes) {
    errors.push(`${label}: Git-blob ontbreekt op ${commit}: ${path}.`);
    return null;
  }
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")) };
  } catch {
    errors.push(`${label}: Git-blob is geen geldige JSON: ${path}.`);
    return null;
  }
}

function addPromotionEvidencePath(errors, allowedPaths, root, path, label) {
  if (!isSafeEvidencePath(path, root)) {
    errors.push(`${label}: evidencepad is niet veilig: ${path}.`);
    return false;
  }
  allowedPaths.add(path);
  return true;
}

function collectMachineReportClosure(
  errors,
  allowedPaths,
  { root, candidateSha, reportPath, subjectId },
) {
  if (
    !addPromotionEvidencePath(errors, allowedPaths, root, reportPath, subjectId)
  ) {
    return;
  }
  const report = readGitJson(
    root,
    candidateSha,
    reportPath,
    errors,
    subjectId,
  )?.value;
  if (!report) return;
  for (const attachment of report.attachments ?? []) {
    addPromotionEvidencePath(
      errors,
      allowedPaths,
      root,
      attachment?.path,
      subjectId,
    );
  }
  const matrixCoverages = [
    report.verificationMatrix?.requirement,
    ...(report.verificationMatrix?.sharedMatrices ?? []),
  ];
  for (const coverage of matrixCoverages) {
    for (const shard of coverage?.shards ?? []) {
      const shardPath = shard?.assertionReportPath;
      if (
        !addPromotionEvidencePath(
          errors,
          allowedPaths,
          root,
          shardPath,
          subjectId,
        )
      ) {
        continue;
      }
      const shardReport = readGitJson(
        root,
        candidateSha,
        shardPath,
        errors,
        subjectId,
      )?.value;
      for (const attachment of shardReport?.attachments ?? []) {
        addPromotionEvidencePath(
          errors,
          allowedPaths,
          root,
          attachment?.path,
          subjectId,
        );
      }
    }
  }
}

function collectRequirementEvidenceClosure(
  errors,
  allowedPaths,
  { root, candidateSha, item },
) {
  const reference = parseHashedArtifactReference(item.evidence?.index);
  if (
    !reference ||
    !addPromotionEvidencePath(
      errors,
      allowedPaths,
      root,
      reference?.path,
      item.id,
    )
  ) {
    errors.push(`${item.id}: promotion mist een veilige evidence-index.`);
    return;
  }
  const indexRecord = readGitJson(
    root,
    candidateSha,
    reference.path,
    errors,
    item.id,
  );
  if (!indexRecord) return;
  if (
    createHash("sha256").update(indexRecord.bytes).digest("hex") !==
    reference.sha256
  ) {
    errors.push(`${item.id}: promotion evidence-indexhash wijkt af.`);
    return;
  }
  const index = indexRecord.value;
  for (const record of index.codePaths ?? []) {
    const candidateBlob = readGitFile(root, candidateSha, record?.path);
    if (
      !candidateBlob ||
      createHash("sha256").update(candidateBlob).digest("hex") !==
        record?.blobSha256
    ) {
      errors.push(
        `${item.id}: bewezen codeblob ontbreekt of wijkt af op promotion-HEAD D: ${record?.path}.`,
      );
    }
  }
  const reportPaths = new Set([
    ...(index.commands ?? []).map((command) => command?.reportPath),
    ...(index.artifacts?.runtime ?? []).map((artifact) => artifact?.path),
    ...(index.artifacts?.staging ?? []).map((artifact) => artifact?.path),
  ]);
  for (const reportPath of reportPaths) {
    collectMachineReportClosure(errors, allowedPaths, {
      root,
      candidateSha,
      reportPath,
      subjectId: item.id,
    });
  }
}

function collectCaptureEvidenceClosure(
  errors,
  allowedPaths,
  { root, candidateSha, capture },
) {
  const artifactBase = capture.evidenceContract?.artifactPathBase;
  const evidenceRecords = capture.evidenceContract?.scenarioEvidence;
  if (!isNonEmptyString(artifactBase) || !Array.isArray(evidenceRecords)) {
    errors.push("Visuele baselinepromotion mist haar evidenceclosure.");
    return;
  }
  const visualPrefix = `${FIELDFLOW_PACKAGE_PATH}/evidence/visual/`;
  const artifactFields = [
    "png",
    "domSnapshot",
    "computedGeometry",
    "computedStyles",
    "setupActionLog",
    "runtimeErrorLog",
    "axeReport",
    "keyboardInteractionTrace",
    "touchInteractionTrace",
  ];
  for (const evidence of evidenceRecords) {
    for (const field of artifactFields) {
      const artifactPath = evidence?.[field]?.path;
      if (!isNonEmptyString(artifactPath)) continue;
      const repositoryPath = posix.join(
        FIELDFLOW_PACKAGE_PATH,
        artifactBase,
        artifactPath,
      );
      if (
        !repositoryPath.startsWith(visualPrefix) ||
        !isSafeRelativePath(repositoryPath, root) ||
        !/^[A-Za-z0-9._/-]+$/u.test(repositoryPath)
      ) {
        errors.push(
          `${evidence?.scenarioId ?? "Visuele baseline"}: evidencepad is niet veilig: ${artifactPath}.`,
        );
        continue;
      }
      allowedPaths.add(repositoryPath);
      if (!readGitFile(root, candidateSha, repositoryPath)) {
        errors.push(
          `${evidence?.scenarioId ?? "Visuele baseline"}: evidenceblob ontbreekt: ${repositoryPath}.`,
        );
      }
    }
  }
}

function gitDiffNameStatus(root, baseSha, candidateSha) {
  const output = execFileSync(
    "git",
    [
      "diff",
      "--name-status",
      "-z",
      "--no-renames",
      "--no-ext-diff",
      "--no-textconv",
      baseSha,
      candidateSha,
      "--",
    ],
    { cwd: root, maxBuffer: 16 * 1024 * 1024 },
  );
  const fields = output.toString("utf8").split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 2 !== 0) {
    throw new Error("Git name-status-output heeft geen geldige NUL-vorm.");
  }
  const entries = [];
  for (let index = 0; index < fields.length; index += 2) {
    entries.push({ status: fields[index], path: fields[index + 1] });
  }
  return entries;
}

function gitTreeEntry(root, commit, path) {
  try {
    const output = execFileSync(
      "git",
      ["ls-tree", "-z", "--full-tree", commit, "--", path],
      { cwd: root, maxBuffer: 1024 * 1024 },
    ).toString("utf8");
    if (!output) return null;
    const [metadata, entryPath] = output.replace(/\0$/u, "").split("\t", 2);
    const [mode, type, object] = metadata.split(" ");
    return { mode, type, object, path: entryPath };
  } catch {
    return null;
  }
}

function validateHistoricalCommitSurvives(
  errors,
  { root, baseSha, candidateSha, historicalCommit, label },
) {
  const mergeBases = execFileSync(
    "git",
    ["merge-base", "--all", baseSha, historicalCommit],
    { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  if (mergeBases.length !== 1) {
    errors.push(
      `${label}: protected base en historische HEAD hebben niet exact één merge-base.`,
    );
    return;
  }
  for (const entry of gitDiffNameStatus(
    root,
    mergeBases[0],
    historicalCommit,
  )) {
    const historicalEntry = gitTreeEntry(root, historicalCommit, entry.path);
    const candidateEntry = gitTreeEntry(root, candidateSha, entry.path);
    if (JSON.stringify(candidateEntry) !== JSON.stringify(historicalEntry)) {
      errors.push(
        `${label}: historische implementatie- of capturetree uit C is niet byte- en mode-exact aanwezig op promotion-HEAD D: ${entry.path}.`,
      );
    }
  }
}

function changedLifecycleItems(base, candidate, itemsField, idField) {
  const baseItems = new Map(
    (base?.[itemsField] ?? []).map((item) => [item[idField], item]),
  );
  return (candidate?.[itemsField] ?? []).filter((item) => {
    const baseItem = baseItems.get(item[idField]);
    return baseItem && baseItem.state !== item.state;
  });
}

export function validateEvidencePromotion(
  errors,
  { root, baseSha, candidateSha } = {},
) {
  try {
    if (
      !/^[0-9a-f]{40}$/u.test(baseSha ?? "") ||
      !/^[0-9a-f]{40}$/u.test(candidateSha ?? "")
    ) {
      errors.push("Evidencepromotion vereist exacte base- en kandidaat-SHA's.");
      return;
    }
    if (
      !gitCommitExists(root, baseSha) ||
      !gitCommitExists(root, candidateSha) ||
      baseSha === candidateSha ||
      !gitCommitIsAncestor(root, baseSha, candidateSha)
    ) {
      errors.push(
        "Evidencepromotion vereist een bestaande, verschillende base die ancestor is van de kandidaat.",
      );
      return;
    }
    const baseAcceptance = readGitJson(
      root,
      baseSha,
      ACCEPTANCE_MANIFEST_PATH,
      errors,
      "Acceptance",
    )?.value;
    const candidateAcceptance = readGitJson(
      root,
      candidateSha,
      ACCEPTANCE_MANIFEST_PATH,
      errors,
      "Acceptance",
    )?.value;
    const baseRisks = readGitJson(
      root,
      baseSha,
      RISKS_MANIFEST_PATH,
      errors,
      "Risico",
    )?.value;
    const candidateRisks = readGitJson(
      root,
      candidateSha,
      RISKS_MANIFEST_PATH,
      errors,
      "Risico",
    )?.value;
    const baseCapture = readGitJson(
      root,
      baseSha,
      CAPTURE_CONTRACT_PATH,
      errors,
      "Visuele baseline",
    )?.value;
    const candidateCapture = readGitJson(
      root,
      candidateSha,
      CAPTURE_CONTRACT_PATH,
      errors,
      "Visuele baseline",
    )?.value;
    if (
      !baseAcceptance ||
      !candidateAcceptance ||
      !baseRisks ||
      !candidateRisks ||
      !baseCapture ||
      !candidateCapture
    ) {
      return;
    }

    const acceptanceChanges = changedLifecycleItems(
      baseAcceptance,
      candidateAcceptance,
      "requirements",
      "id",
    );
    const riskChanges = changedLifecycleItems(
      baseRisks,
      candidateRisks,
      "risks",
      "id",
    );
    const captureChanged = baseCapture.state !== candidateCapture.state;
    if (
      acceptanceChanges.length === 0 &&
      riskChanges.length === 0 &&
      !captureChanged
    ) {
      return;
    }

    const allowedPaths = new Set();
    if (acceptanceChanges.length > 0) {
      allowedPaths.add(ACCEPTANCE_MANIFEST_PATH);
    }
    if (riskChanges.length > 0) allowedPaths.add(RISKS_MANIFEST_PATH);
    if (captureChanged) allowedPaths.add(CAPTURE_CONTRACT_PATH);
    const validatedHistoricalCommits = new Set();

    for (const item of [...acceptanceChanges, ...riskChanges]) {
      const implementationCommit = item.evidence?.commit;
      const historyValid =
        /^[0-9a-f]{40}$/u.test(implementationCommit ?? "") &&
        implementationCommit !== candidateSha &&
        gitCommitIsAncestor(root, implementationCommit, candidateSha);
      if (!historyValid) {
        errors.push(
          `${item.id}: implementation- of capture-HEAD ${implementationCommit ?? "ontbreekt"} is geen ancestor van promotion-HEAD ${candidateSha}.`,
        );
      } else if (!validatedHistoricalCommits.has(implementationCommit)) {
        validatedHistoricalCommits.add(implementationCommit);
        validateHistoricalCommitSurvives(errors, {
          root,
          baseSha,
          candidateSha,
          historicalCommit: implementationCommit,
          label: item.id,
        });
      }
      collectRequirementEvidenceClosure(errors, allowedPaths, {
        root,
        candidateSha,
        item,
      });
    }

    if (captureChanged) {
      const captureHeads = new Set(
        (candidateCapture.evidenceContract?.scenarioEvidence ?? []).map(
          (evidence) => evidence?.provenance?.headCommit,
        ),
      );
      if (captureHeads.size === 0) {
        errors.push("Visuele baselinepromotion mist een capture-HEAD.");
      }
      for (const captureHead of captureHeads) {
        const historyValid =
          /^[0-9a-f]{40}$/u.test(captureHead ?? "") &&
          captureHead !== candidateSha &&
          gitCommitIsAncestor(root, captureHead, candidateSha);
        if (!historyValid) {
          errors.push(
            `Visuele baseline: implementation- of capture-HEAD ${captureHead ?? "ontbreekt"} is geen ancestor van promotion-HEAD ${candidateSha}.`,
          );
        } else if (!validatedHistoricalCommits.has(captureHead)) {
          validatedHistoricalCommits.add(captureHead);
          validateHistoricalCommitSurvives(errors, {
            root,
            baseSha,
            candidateSha,
            historicalCommit: captureHead,
            label: "Visuele baseline",
          });
        }
      }
      collectCaptureEvidenceClosure(errors, allowedPaths, {
        root,
        candidateSha,
        capture: candidateCapture,
      });
    }

    for (const entry of gitDiffNameStatus(root, baseSha, candidateSha)) {
      if (!["A", "M"].includes(entry.status)) {
        errors.push(
          `Evidencepromotion gebruikt verboden Git-status ${entry.status} voor ${entry.path}.`,
        );
        continue;
      }
      if (!allowedPaths.has(entry.path)) {
        errors.push(
          `Evidencepromotion bevat een niet-toegestaan pad: ${entry.path}.`,
        );
        continue;
      }
      if (gitTreeEntry(root, candidateSha, entry.path)?.mode !== "100644") {
        errors.push(
          `Evidencepromotion vereist een niet-uitvoerbare reguliere blob: ${entry.path}.`,
        );
      }
    }
  } catch (error) {
    errors.push(
      `Evidencepromotion kon niet fail-closed worden gevalideerd: ${error}`,
    );
  }
}

function validateNormativeProseContracts(errors, packageRoot) {
  const discoveredDocs = readdirSync(packageRoot)
    .filter((file) => file.endsWith(".md"))
    .sort();
  if (JSON.stringify(discoveredDocs) !== JSON.stringify(NORMATIVE_DOC_FILES)) {
    errors.push(
      "Normatieve documentset bevat een ontbrekend of onverwacht Markdown-bestand.",
    );
  }
  if (
    computeNormativeDocsDigest(packageRoot) !== NORMATIVE_DOCS_DIGEST_SHA256
  ) {
    errors.push(
      "Normatieve documentdigest wijkt af; ontwerp-, feature-, planbord-, responsive-, runbook- of risicodetails zijn niet meer exact.",
    );
  }
  const designSystem = readFileSync(
    resolve(packageRoot, "01-DESIGNSYSTEEM-EN-COMPONENTEN.md"),
    "utf8",
  );
  if (
    !designSystem.includes(
      "861–1279: alleen canvas inline; library en properties openen elk in hun eigen side Sheet en zijn bij eerste render gesloten",
    ) ||
    !designSystem.includes(
      "≤860: alleen canvas inline; één full-height bottom Sheet met tabs `Secties` en `Eigenschappen` en die Sheet is bij eerste render gesloten, dus ook op de verplichte 768px-portraitfixture",
    ) ||
    /768[–-]1279: canvas centraal/iu.test(designSystem) ||
    /<768: één canvas/iu.test(designSystem)
  ) {
    errors.push(
      "Website Studio-prose moet exact de canonieke ≤860/861–1279 responsivedrempels volgen.",
    );
  }
}

function validateMarkdownLinks(errors, packageRoot) {
  const packagePrefix = `${packageRoot}${sep}`;
  const files = REQUIRED_DOCS.filter((file) => file.endsWith(".md"));
  for (const file of files) {
    const sourcePath = resolve(packageRoot, file);
    const content = readFileSync(sourcePath, "utf8");
    const linkPattern = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
    for (const match of content.matchAll(linkPattern)) {
      const target = match[1];
      if (/^(?:https?:|mailto:|#)/u.test(target)) continue;
      const rawPath = target.split("#", 1)[0];
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(rawPath);
      } catch {
        errors.push(`${file}: ongeldige URL-encoding in link ${target}.`);
        continue;
      }
      const resolvedTarget = resolve(dirname(sourcePath), decodedPath);
      if (
        resolvedTarget !== packageRoot &&
        !resolvedTarget.startsWith(packagePrefix)
      ) {
        errors.push(
          `${file}: pakketlink ontsnapt uit package root: ${target}.`,
        );
      } else if (!existsSync(resolvedTarget)) {
        errors.push(`${file}: lokale link bestaat niet: ${target}.`);
      }
    }
  }
}

export function validateFieldflowHandoff({
  root = ROOT,
  packageRoot = resolve(root, "docs/uiux/fieldflow-calm-handoff"),
  executeReference = true,
} = {}) {
  const errors = [];
  validateRequiredFiles(errors, packageRoot);
  if (errors.length > 0) return errors;

  const routes = readJson(resolve(packageRoot, "manifests/routes.json"));
  const acceptance = readJson(
    resolve(packageRoot, "manifests/acceptance.json"),
  );
  const productionInventory = readJson(
    resolve(packageRoot, "manifests/production-inventory.json"),
  );
  const mismatchTraceability = readJson(
    resolve(packageRoot, "manifests/mismatch-traceability.json"),
  );
  const navigationContract = readJson(
    resolve(packageRoot, "manifests/navigation-contract.json"),
  );
  const componentApiContract = readJson(
    resolve(packageRoot, "manifests/component-api-contract.json"),
  );
  const planboardActions = readJson(
    resolve(packageRoot, "manifests/planboard-actions.json"),
  );
  const verificationMatrix = readJson(
    resolve(packageRoot, "manifests/verification-matrix.json"),
  );
  const verificationMatrixSchema = readJson(
    resolve(packageRoot, "reference/verification-matrix.schema.json"),
  );
  const surfaces = readJson(resolve(packageRoot, "manifests/surfaces.json"));
  const risks = readJson(resolve(packageRoot, "manifests/risks.json"));
  const contractRoot = readJson(
    resolve(packageRoot, "manifests/contract-root.json"),
  );
  const componentStates = readJson(
    resolve(packageRoot, "manifests/component-states.json"),
  );
  const componentSourceCoverage = readJson(
    resolve(packageRoot, "manifests/component-source-coverage.json"),
  );
  const tokens = readJson(
    resolve(packageRoot, "manifests/fieldflow-tokens.json"),
  );
  const visual = readJson(
    resolve(packageRoot, "evidence/visual/manifest.json"),
  );
  const captureContract = readJson(
    resolve(packageRoot, "evidence/visual/capture-contract.json"),
  );
  const prototypeSource = readJson(
    resolve(packageRoot, "evidence/prototype/source-manifest.json"),
  );

  const knownRoutes = validateRoutes(errors, root, routes, productionInventory);
  validateProductionInventory(errors, root, productionInventory, routes);
  validateMismatchTraceability(
    errors,
    mismatchTraceability,
    productionInventory,
    acceptance,
    risks,
  );
  validateNavigationContract(
    errors,
    navigationContract,
    routes,
    productionInventory,
  );
  validateComponentApiContract(errors, {
    root,
    manifest: componentApiContract,
    componentStates,
    routes,
  });
  validatePlanboardActionContract(errors, {
    packageRoot,
    manifest: planboardActions,
    acceptance,
    risks,
  });
  validateVerificationMatrix(errors, {
    packageRoot,
    manifest: verificationMatrix,
    schema: verificationMatrixSchema,
    acceptance,
    routes,
    inventory: productionInventory,
    componentStates,
    risks,
    captureContract,
    surfaces,
  });
  validateAcceptance(errors, acceptance, knownRoutes, root);
  validateRouteWorkPackageCoverage(errors, acceptance, routes.routes ?? []);
  validateSurfaces(errors, root, surfaces, acceptance);
  validateRisks(errors, packageRoot, risks, root);
  validateComponentStates(
    errors,
    root,
    packageRoot,
    componentStates,
    routes,
    acceptance,
    prototypeSource,
  );
  validateComponentSourceCoverage(
    errors,
    root,
    componentSourceCoverage,
    componentStates,
    routes,
  );
  validateThemeDerivationReference(errors, packageRoot, { executeReference });
  validateTokens(errors, tokens);
  validateVisualEvidence(errors, packageRoot, visual);
  validateCaptureContract(errors, packageRoot, captureContract, visual);
  validatePrototypeSource(errors, packageRoot, prototypeSource);
  validateNormativeProseContracts(errors, packageRoot);
  validateFieldflowContractRoot(errors, {
    root,
    packageRoot,
    manifest: contractRoot,
    requireExternalTrust: requiresProtectedContractRoot(
      acceptance,
      risks,
      captureContract,
    ),
  });
  validateNoUnresolvedMarkers(errors, packageRoot);
  validateMarkdownLinks(errors, packageRoot);
  return errors;
}

function runCli() {
  if (process.argv.includes("--verify-contract-root")) {
    const baseShaIndex = process.argv.indexOf("--base-sha");
    const baseSha = baseShaIndex >= 0 ? process.argv[baseShaIndex + 1] : null;
    const candidateIndex = process.argv.indexOf("--candidate-root");
    const candidateArgument =
      candidateIndex >= 0 ? process.argv[candidateIndex + 1] : null;
    const candidateShaIndex = process.argv.indexOf("--candidate-sha");
    const candidateSha =
      candidateShaIndex >= 0 ? process.argv[candidateShaIndex + 1] : null;
    if (
      !/^[0-9a-f]{40}$/u.test(baseSha ?? "") ||
      !isNonEmptyString(candidateArgument) ||
      !/^[0-9a-f]{40}$/u.test(candidateSha ?? "")
    ) {
      process.stderr.write(
        "Fieldflow contract-rootcontrole vereist --base-sha <40-tekens-SHA>, --candidate-root <repository> en --candidate-sha <40-tekens-SHA>.\n",
      );
      process.exitCode = 1;
      return;
    }
    const candidateRoot = resolve(process.cwd(), candidateArgument);
    const candidatePackageRoot = resolve(
      candidateRoot,
      "docs/uiux/fieldflow-calm-handoff",
    );
    const candidateManifestPath = resolve(candidateRoot, CONTRACT_ROOT_PATH);
    if (!existsSync(candidateManifestPath)) {
      process.stderr.write(
        `Fieldflow contract-root ontbreekt in kandidaat: ${candidateManifestPath}.\n`,
      );
      process.exitCode = 1;
      return;
    }
    const trustErrors = [];
    validateCandidateCheckoutSafety(trustErrors, {
      root: candidateRoot,
      expectedCommit: candidateSha,
    });
    if (trustErrors.length === 0) {
      validateFieldflowContractRoot(trustErrors, {
        root: candidateRoot,
        packageRoot: candidatePackageRoot,
        manifest: readJson(candidateManifestPath),
        requireExternalTrust: true,
        trustedRoot: process.env.FIELDFLOW_CALM_TRUSTED_ROOT_SHA256,
      });
    }
    if (trustErrors.length === 0) {
      trustErrors.push(
        ...validateFieldflowHandoff({
          root: candidateRoot,
          packageRoot: candidatePackageRoot,
          executeReference: false,
        }),
      );
    }
    if (trustErrors.length === 0) {
      validateLifecycleTransition(trustErrors, {
        basePackageRoot: PACKAGE_ROOT,
        candidatePackageRoot,
      });
    }
    if (trustErrors.length === 0) {
      validateEvidencePromotion(trustErrors, {
        root: candidateRoot,
        baseSha,
        candidateSha,
      });
    }
    if (trustErrors.length > 0) {
      process.stderr.write(
        [
          `Fieldflow protected contract-root ongeldig (${trustErrors.length}):`,
          ...trustErrors.map((error) => `- ${error}`),
          "",
        ].join("\n"),
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      "Fieldflow protected contract-root, immutable checkout, evidence-only promotiondiff en volledige lifecycle-inhoud komen exact overeen met het extern vertrouwde contract.\n",
    );
    return;
  }
  const errors = validateFieldflowHandoff();
  if (errors.length > 0) {
    process.stderr.write(
      [
        `Fieldflow Calm handoff ongeldig (${errors.length}):`,
        ...errors.map((error) => `- ${error}`),
        "",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }
  const routes = readJson(resolve(PACKAGE_ROOT, "manifests/routes.json"));
  const acceptance = readJson(
    resolve(PACKAGE_ROOT, "manifests/acceptance.json"),
  );
  const visual = readJson(
    resolve(PACKAGE_ROOT, "evidence/visual/manifest.json"),
  );
  const componentSourceCoverage = readJson(
    resolve(PACKAGE_ROOT, "manifests/component-source-coverage.json"),
  );
  const productionInventory = readJson(
    resolve(PACKAGE_ROOT, "manifests/production-inventory.json"),
  );
  const componentStates = readJson(
    resolve(PACKAGE_ROOT, "manifests/component-states.json"),
  );
  const surfaces = readJson(resolve(PACKAGE_ROOT, "manifests/surfaces.json"));
  const risks = readJson(resolve(PACKAGE_ROOT, "manifests/risks.json"));
  const captureContract = readJson(
    resolve(PACKAGE_ROOT, "evidence/visual/capture-contract.json"),
  );
  const routeCapabilities = productionInventory.routes.reduce(
    (count, route) =>
      count + (route.existingProduction?.capabilities?.length ?? 0),
    0,
  );
  const routeActions = productionInventory.routes.reduce(
    (count, route) => count + (route.existingProduction?.actions?.length ?? 0),
    0,
  );
  process.stdout.write(
    `Fieldflow Calm handoffsnapshot geldig: ${routes.routes.length} routes; ${routeCapabilities}+${productionInventory.globalCapabilities.length} capabilities; ${routeActions}+${productionInventory.globalActions.length} acties; ${acceptance.requirements.length} eisen; ${componentStates.componentCount} componentcontracten/${componentStates.caseExecutionMatrix.baseCaptureCaseCount} cases/${componentStates.caseExecutionMatrix.derivedExecutionCount} viewport-/zoomruns als subset/${componentStates.caseExecutionMatrix.axisCoverage.derivedRequiredAxisRunCount} asruns; ${componentSourceCoverage.exportCount} componentexports; ${surfaces.surfaceCount} whitelabeloppervlakken; ${risks.riskCount} risico's; ${captureContract.scenarios.length} baseline-scenario's/${visual.files.length} raw anchors; ${EXPECTED_PRODUCTION_SOURCE_PATH_COUNT} productiebronblobs. Dit is geen implementatie- of releasebewijs.\n`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  runCli();
}

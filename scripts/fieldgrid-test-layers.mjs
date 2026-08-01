#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

export const FIELDGRID_TEST_LAYERS_VERSION = "fieldgrid-test-layers-v1";

export const fieldgridTestLayers = [
  {
    id: "contract-static",
    label: "Contract/static",
    owner: "Platform engineering",
    purpose:
      "Migratievolgorde, testlagenmanifest en runtime fixturecontract blijven expliciet bewaakt.",
    ciCommand:
      "pnpm fieldgrid:migration-order-check:check && pnpm fieldgrid:test-layers:check && pnpm fieldgrid:runtime-safety:fixture-contract",
    requiredTestFiles: [
      "tests/fieldgrid-runtime-safety-fixtures-contract.test.mjs",
    ],
    requiredSignals: ["FG-MIG-ORDER", "FG-TEST-LAYERS", "FG-RUNTIME-FIXTURES"],
  },
  {
    id: "unit-domain",
    label: "Unit/domain",
    owner: "Platform engineering",
    purpose:
      "Pure JavaScript- en TypeScript-domeinregels en contractregels draaien zonder database, browser of provider.",
    ciCommand:
      "pnpm fieldgrid:test:domain-recursive && pnpm fieldgrid:test:domain-typescript && pnpm fieldgrid:test:website-runtime-unit",
    requiredTestFiles: [
      "tests/domain/tenantless-write-invariants-classification.test.mjs",
      "tests/domain/fieldgrid-portal-route-sanitizers.test.ts",
      "tests/domain/fieldgrid-sendgrid-email.test.ts",
    ],
    requiredSignals: ["FG-DOMAIN-CLASSIFICATION", "FG-DOMAIN-TYPESCRIPT"],
  },
  {
    id: "security-source",
    label: "Security source",
    owner: "Platform security",
    purpose:
      "Source guards voor security-invarianten bewaken dat kritieke checks niet uit de harness verdwijnen.",
    ciCommand: "pnpm fieldgrid:test:security-recursive",
    requiredTestFiles: [
      "tests/security/assignment-personnel-tenant-guard-source.test.mjs",
    ],
    requiredSignals: ["FG-ASSIGNMENT-PERSONNEL-GUARD", "FG-RLS-ACTOR-MODEL"],
  },
  {
    id: "postgres17-migration-smoke",
    label: "PostgreSQL 17 migration smoke",
    owner: "Platform engineering",
    purpose:
      "Alle migraties draaien op een lege lokale PostgreSQL 17 database met Supabase-compatibiliteitsshims.",
    ciCommand:
      "pnpm fieldgrid:runtime-safety:setup && pnpm fieldgrid:test:realtime-projection-migration",
    requiredTestFiles: [
      "tests/fieldgrid-runtime-safety-fixtures-contract.test.mjs",
    ],
    requiredSignals: ["FG-PG17-MIGRATION-SMOKE"],
  },
  {
    id: "db-integration-tenant-ab",
    label: "DB integration Tenant A/B",
    owner: "Platform security",
    purpose:
      "Tenant A/B fixtures, database-invarianten en staffing/security-regressies bewijzen parent-scope en privileged write guards.",
    ciCommand:
      "pnpm fieldgrid:runtime-safety:setup && pnpm fieldgrid:runtime-safety:fixtures && pnpm fieldgrid:runtime-safety:db && pnpm fieldgrid:test:db-regressions && pnpm fieldgrid:test:credential-recovery-runtime && pnpm fieldgrid:test:website-runtime && pnpm fieldgrid:test:website-publication-runtime && pnpm fieldgrid:test:website-forms-runtime",
    requiredTestFiles: [
      "tests/security/assignment-personnel-tenant-guard-source.test.mjs",
      "tests/fieldgrid-phase2a-durable-staffing.test.mjs",
      "tests/fieldgrid-phase2c-security-reconciliation.test.mjs",
    ],
    requiredSignals: ["FG-DB-INVARIANT", "FG-TENANT-A-B", "FG-DB-REGRESSION"],
  },
  {
    id: "rls-security",
    label: "Authenticated RLS",
    owner: "Platform security",
    purpose:
      "Authenticated actors gebruiken SET LOCAL ROLE, row_security en JWT GUCs voor tenantgebonden RLS bewijs.",
    ciCommand:
      "pnpm fieldgrid:runtime-safety:setup && pnpm fieldgrid:runtime-safety:fixtures && pnpm fieldgrid:runtime-safety:rls",
    requiredTestFiles: [
      "tests/security/assignment-personnel-tenant-guard-source.test.mjs",
    ],
    requiredSignals: ["FG-AUTHENTICATED-RLS", "FG-MULTI-TENANT-CONTEXT"],
  },
  {
    id: "phase-b-previous-release-database-compatibility",
    label: "Phase-B previous release DB compatibility",
    owner: "Platform security",
    purpose:
      "Rollbackrelease 132e7d0 blijft bruikbaar tegen het post-Phase-B schema via echte lokale PostgreSQL/RLS contractqueries.",
    ciCommand:
      "pnpm fieldgrid:runtime-safety:setup && pnpm fieldgrid:runtime-safety:fixtures && pnpm fieldgrid:runtime-safety:previous-release-compatibility",
    requiredTestFiles: [
      "scripts/fieldgrid-runtime-safety-previous-release-compatibility.mjs",
    ],
    requiredSignals: ["FG-PHASE-B-PREVIOUS-RELEASE-COMPATIBILITY"],
  },
  {
    id: "api-runtime",
    label: "API runtime",
    owner: "Platform engineering",
    purpose:
      "Lokale API runtime bewijst middleware/routegedrag zonder live providers of staging.",
    ciCommand:
      "pnpm fieldgrid:runtime-safety:setup && pnpm fieldgrid:runtime-safety:fixtures && pnpm --filter @workspace/api-server run build && pnpm fieldgrid:runtime-safety:api && pnpm fieldgrid:test:payment-provider-runtime",
    requiredTestFiles: [
      "tests/fieldgrid-runtime-safety-fixtures-contract.test.mjs",
    ],
    requiredSignals: ["FG-API-RUNTIME"],
  },
  {
    id: "security-guards",
    label: "Security guards",
    owner: "Platform engineering",
    purpose:
      "Tenantgrenzen, sessie-scope, RBAC, storage/download guards en auditdenials blijven hard.",
    ciCommand:
      "node --test tests/tenant-permissions.test.mjs tests/fieldgrid-cross-tenant-permissions.test.mjs tests/fieldgrid-document-storage-download-tenant-guard.test.mjs tests/fieldgrid-auth-cookie-scope.test.mjs tests/fieldgrid-backoffice-tenant-isolation-regression.test.mjs tests/fieldgrid-sprint-10-audit-security.test.mjs",
    requiredTestFiles: [
      "tests/tenant-permissions.test.mjs",
      "tests/fieldgrid-cross-tenant-permissions.test.mjs",
      "tests/fieldgrid-document-storage-download-tenant-guard.test.mjs",
      "tests/fieldgrid-auth-cookie-scope.test.mjs",
      "tests/fieldgrid-backoffice-tenant-isolation-regression.test.mjs",
      "tests/fieldgrid-sprint-10-audit-security.test.mjs",
    ],
    requiredSignals: [
      "FG-RBAC-001",
      "FG-DATA-001",
      "FG-STORAGE-001",
      "FG-AUDIT-001",
    ],
  },
  {
    id: "ui-contracttests",
    label: "UI contracttests",
    owner: "Product engineering",
    purpose:
      "Backoffice, portalen, platform-admin en tenant-ready copy houden hun zichtbare contracten vast.",
    ciCommand:
      "node --test tests/fieldgrid-platform-admin-phase-14-final-gate.test.mjs tests/fieldgrid-customer-personnel-phase16-releasegate.test.mjs tests/fieldgrid-notification-content-v1.test.mjs tests/fieldgrid-sprint-15-staging-smoke.test.mjs",
    requiredTestFiles: [
      "tests/fieldgrid-platform-admin-phase-14-final-gate.test.mjs",
      "tests/fieldgrid-customer-personnel-phase16-releasegate.test.mjs",
      "tests/fieldgrid-notification-content-v1.test.mjs",
      "tests/fieldgrid-sprint-15-staging-smoke.test.mjs",
    ],
    requiredSignals: [
      "FG-OPS-008",
      "FG-PLATFORM-001",
      "FG-PORTAL-C-004",
      "FG-PORTAL-P-005",
    ],
  },
  {
    id: "db-migration-smoke",
    label: "DB/migration smoke",
    owner: "Platform engineering",
    purpose:
      "Migratievolgorde, naming, DB runtime-env en lege/staging-copy smoke blijven reproduceerbaar.",
    ciCommand:
      "pnpm fieldgrid:migration-order-check:check && node --test tests/fieldgrid-db-runtime-env.test.mjs tests/fieldgrid-database-autofix.test.mjs tests/fieldgrid-sprint-7-migration-smoke.test.mjs",
    requiredTestFiles: [
      "tests/fieldgrid-db-runtime-env.test.mjs",
      "tests/fieldgrid-database-autofix.test.mjs",
      "tests/fieldgrid-sprint-7-migration-smoke.test.mjs",
    ],
    requiredSignals: ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"],
  },
  {
    id: "live-e2e",
    label: "Live E2E",
    owner: "Platform operations",
    purpose:
      "Staging runtime proof gebruikt echte hosts, run history, storage/download evidence en gate-artifacts.",
    ciCommand:
      "pnpm fieldgrid:sprint15-staging-smoke:run-read-only && pnpm fieldgrid:staging-promotion-gate:strict",
    requiredTestFiles: [
      "tests/fieldgrid-sprint-15-staging-smoke.test.mjs",
      "tests/fieldgrid-platform-admin-phase-14-final-gate.test.mjs",
      "tests/fieldgrid-customer-personnel-phase16-releasegate.test.mjs",
    ],
    requiredSignals: [
      "FG-LIVE-HOST",
      "FG-LIVE-STORAGE",
      "FG-OPS-008",
      "FG-PA-GATE-HOST-FIRST",
    ],
  },
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    check: false,
    json: false,
    help: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case "--check":
        options.check = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function exists(relativePath) {
  try {
    await access(join(repoRoot, relativePath), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function buildFieldgridTestLayersPlan() {
  const layers = [];

  for (const layer of fieldgridTestLayers) {
    const fileChecks = await Promise.all(
      layer.requiredTestFiles.map(async (path) => ({
        path,
        exists: await exists(path),
      })),
    );

    layers.push({
      ...layer,
      missingTestFiles: fileChecks
        .filter((file) => !file.exists)
        .map((file) => file.path),
    });
  }

  return {
    version: FIELDGRID_TEST_LAYERS_VERSION,
    marker: "fieldgrid-phase-4-test-layers",
    destructive: false,
    noTenantMutation: true,
    layers,
    requiredLayerIds: [
      "contract-static",
      "unit-domain",
      "security-source",
      "postgres17-migration-smoke",
      "db-integration-tenant-ab",
      "rls-security",
      "phase-b-previous-release-database-compatibility",
      "api-runtime",
    ],
    packageScripts: {
      "fieldgrid:test:contract-static": fieldgridTestLayers.find(
        (layer) => layer.id === "contract-static",
      )?.ciCommand,
      "fieldgrid:test:unit-domain":
        "pnpm fieldgrid:test:domain-recursive && pnpm fieldgrid:test:domain-typescript && pnpm fieldgrid:test:website-runtime-unit",
      "fieldgrid:test:domain-typescript":
        "pnpm --filter @workspace/db exec tsx --test ../../tests/domain/*.test.ts",
      "fieldgrid:test:website-runtime-unit":
        "pnpm --filter @workspace/website-core test && pnpm --filter @workspace/website-runtime test",
      "fieldgrid:test:security-source":
        "pnpm fieldgrid:test:security-recursive",
      "fieldgrid:test:postgres17-migration-smoke": fieldgridTestLayers.find(
        (layer) => layer.id === "postgres17-migration-smoke",
      )?.ciCommand,
      "fieldgrid:test:db-integration-tenant-ab": fieldgridTestLayers.find(
        (layer) => layer.id === "db-integration-tenant-ab",
      )?.ciCommand,
      "fieldgrid:test:rls-security": fieldgridTestLayers.find(
        (layer) => layer.id === "rls-security",
      )?.ciCommand,
      "fieldgrid:test:phase-b-previous-release-database-compatibility":
        fieldgridTestLayers.find(
          (layer) =>
            layer.id === "phase-b-previous-release-database-compatibility",
        )?.ciCommand,
      "fieldgrid:test:api-runtime": fieldgridTestLayers.find(
        (layer) => layer.id === "api-runtime",
      )?.ciCommand,
      "fieldgrid:test-layers": "node scripts/fieldgrid-test-layers.mjs",
      "fieldgrid:test-layers:check":
        "node scripts/fieldgrid-test-layers.mjs --check",
      "fieldgrid:test:security-recursive":
        "node --test $(find tests/security -name '*.test.mjs' -print | sort)",
      "fieldgrid:test:domain-recursive":
        "node --test $(find tests/domain -name '*.test.mjs' -print | sort)",
      "fieldgrid:test:db-regressions":
        "node -e \"if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for fieldgrid:test:db-regressions')\" && node --test tests/fieldgrid-phase2a-durable-staffing.test.mjs tests/fieldgrid-phase2c-security-reconciliation.test.mjs",
      "fieldgrid:test:security": fieldgridTestLayers.find(
        (layer) => layer.id === "security-guards",
      )?.ciCommand,
      "fieldgrid:test:ui-contracts": fieldgridTestLayers.find(
        (layer) => layer.id === "ui-contracttests",
      )?.ciCommand,
      "fieldgrid:test:db-migration": fieldgridTestLayers.find(
        (layer) => layer.id === "db-migration-smoke",
      )?.ciCommand,
      "fieldgrid:test:live-e2e": fieldgridTestLayers.find(
        (layer) => layer.id === "live-e2e",
      )?.ciCommand,
    },
  };
}

export async function validateFieldgridTestLayersPlan(plan, options = {}) {
  const resolvedPlan = plan ?? (await buildFieldgridTestLayersPlan());
  const errors = [];
  const layerIds = new Set(resolvedPlan.layers.map((layer) => layer.id));

  if (resolvedPlan.destructive)
    errors.push("Testlagenmanifest mag geen destructieve acties uitvoeren.");
  if (!resolvedPlan.noTenantMutation)
    errors.push(
      "Testlagenmanifest moet read-only zijn; live mutaties horen achter aparte confirm-env.",
    );
  if (resolvedPlan.version !== FIELDGRID_TEST_LAYERS_VERSION)
    errors.push("Onverwachte testlagenmanifest versie.");

  for (const requiredLayerId of resolvedPlan.requiredLayerIds) {
    if (!layerIds.has(requiredLayerId))
      errors.push(`Testlagenmanifest mist laag ${requiredLayerId}.`);
  }

  for (const layer of resolvedPlan.layers) {
    if (!layer.owner) errors.push(`${layer.id} mist owner.`);
    if (!layer.purpose) errors.push(`${layer.id} mist purpose.`);
    if (!layer.ciCommand) errors.push(`${layer.id} mist ciCommand.`);
    if (
      !Array.isArray(layer.requiredSignals) ||
      layer.requiredSignals.length === 0
    ) {
      errors.push(`${layer.id} mist requiredSignals.`);
    }
    for (const missingFile of layer.missingTestFiles) {
      errors.push(`${layer.id} verwijst naar ontbrekende test ${missingFile}.`);
    }
  }

  const packageManifest =
    options.packageManifest ??
    JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const packageScripts = packageManifest?.scripts ?? {};
  for (const [scriptName, expectedCommand] of Object.entries(
    resolvedPlan.packageScripts,
  )) {
    if (!(scriptName in packageScripts)) {
      errors.push(`package.json mist script ${scriptName}.`);
    } else if (packageScripts[scriptName] !== expectedCommand) {
      errors.push(
        `package.json script ${scriptName} wijkt af van het testlagenmanifest.`,
      );
    }
  }

  return errors;
}

function usage() {
  return `Fieldgrid test layers

Usage:
  pnpm fieldgrid:test-layers:check
  pnpm fieldgrid:test-layers --json

Layers:
  security-guards, ui-contracttests, db-migration-smoke, live-e2e
`;
}

function printPlan(plan) {
  console.log("Fieldgrid test layers");
  console.log("");
  console.log(`Version: ${plan.version}`);
  console.log(`Layers: ${plan.layers.map((layer) => layer.id).join(", ")}`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(usage());
    return 0;
  }

  const plan = await buildFieldgridTestLayersPlan();
  const errors = await validateFieldgridTestLayersPlan(plan);

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
  }

  if (errors.length > 0) {
    console.error("Fieldgrid test layers contract failed:");
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }

  if (options.check) {
    console.log("Fieldgrid test layers contract is valid.");
    return 0;
  }

  if (!options.json) printPlan(plan);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

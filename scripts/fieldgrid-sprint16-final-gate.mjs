#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

export const SPRINT16_FINAL_GATE_VERSION = "sprint-16-final-gate-v1";
export const FINAL_GATE_REPORT_DIR = "artifacts/final-gate";

export const canonicalStatuses = [
  "done",
  "partial",
  "runtime-proof-open",
  "hardening-open",
  "nice-to-have",
  "post-launch-accepted",
];

export const finalGateRequirements = [
  {
    id: "FG-FINAL-PERFORMANCE",
    label: "Performance review op tenantqueries",
    status: "manual",
    canonStatus: "post-launch-accepted",
    evidence: "EXPLAIN ANALYZE op tenantlijst, direct-ID, dashboardstatistieken, planning en storage/download queries.",
    requiredCommand: "pnpm fieldgrid:sprint16-final-gate:check",
    testIds: ["FG-HOST-001", "FG-DATA-001", "FG-DATA-003", "FG-OPS-003"],
    nextAction: "Leg runtime EXPLAIN-output vast in artifacts/final-gate voordat de eerste externe tenant live gaat.",
  },
  {
    id: "FG-FINAL-SERVICE-ROLE",
    label: "Security review op service-role gebruik",
    status: "warning",
    canonStatus: "post-launch-accepted",
    evidence: "SUPABASE_SERVICE_ROLE_KEY mag alleen server-side voorkomen; geen NEXT_PUBLIC service-role key.",
    requiredCommand: "pnpm fieldgrid:sprint16-final-gate:check",
    testIds: ["FG-PORTAL-C-001", "FG-PORTAL-P-001", "FG-STORAGE-001", "FG-AUDIT-002"],
    nextAction: "Controleer admin clients en service-role Drizzle paden per portalactie met tenant-scope bewijs.",
  },
  {
    id: "FG-FINAL-STAGING-COPY",
    label: "Final staging-copy smoke",
    status: "manual",
    canonStatus: "post-launch-accepted",
    evidence: "Sprint 7 migration smoke runner met empty-database en staging-copy targets.",
    requiredCommand: "pnpm fieldgrid:sprint7-migration-smoke --run --target all",
    testIds: ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"],
    nextAction: "Draai tegen een herstelde staging-copy, niet tegen live staging of productie.",
  },
  {
    id: "FG-FINAL-RUNTIME-PROOF",
    label: "Runtime proof, storage proof en portal acceptance",
    status: "manual",
    canonStatus: "post-launch-accepted",
    evidence: "Sprint 5, 6, 7, 15 scripts leveren statische/runbare contracten; live artifacts blijven vereist.",
    requiredCommand: "pnpm fieldgrid:sprint5-runtime-proof:check && pnpm fieldgrid:sprint6-portal-acceptance:check && pnpm fieldgrid:sprint15-staging-smoke:check",
    testIds: ["FG-HOST-001", "FG-RBAC-001", "FG-STORAGE-002", "FG-PORTAL-C-004", "FG-PORTAL-P-005"],
    nextAction: "Koppel live Playwright/storage/DB artifacts aan de staging smoke run history.",
  },
  {
    id: "FG-FINAL-EXTERNAL-TENANT",
    label: "Eerste externe tenant checklist",
    status: "manual",
    canonStatus: "post-launch-accepted",
    evidence: "docs/fieldgrid-first-external-tenant-checklist.md is het go/no-go contract.",
    requiredCommand: "pnpm fieldgrid:sprint16-final-gate:check",
    testIds: ["FG-OPS-001", "FG-OPS-002", "FG-OPS-008", "FG-PLATFORM-004"],
    nextAction: "Gebruik de checklist als releaseformulier en noteer expliciete owner per manual check.",
  },
];

export const postLaunchExceptions = [
  {
    id: "FG-POST-RUNTIME-E2E",
    label: "Host/RBAC/lifecycle runtime E2E bewijs",
    risk: "P0/P1",
    owner: "Platform engineering",
    canonStatus: "post-launch-accepted",
    acceptedUntil: "Voor eerste externe tenant met productiegegevens",
    targetEvidence: "Playwright + integration artifacts voor Tenant A/B/Veele host, RBAC, lifecycle en direct-ID denials.",
    testIds: ["FG-HOST-001", "FG-LIFE-002", "FG-RBAC-002", "FG-DATA-001"],
    requiresGoNoGoApproval: true,
  },
  {
    id: "FG-POST-STORAGE-PROOF",
    label: "Supabase Storage policy en fysieke backfill proof",
    risk: "P0/P1",
    owner: "Platform engineering",
    canonStatus: "post-launch-accepted",
    acceptedUntil: "Voor externe tenant document/media gebruik",
    targetEvidence: "Tenant-prefixed storage artifact, path-guessing denial en policy/RLS bewijs.",
    testIds: ["FG-STORAGE-001", "FG-STORAGE-002", "FG-STORAGE-006", "FG-STORAGE-007"],
    requiresGoNoGoApproval: true,
  },
  {
    id: "FG-POST-PORTAL-ACCEPTANCE",
    label: "Klantportaal en personeelsapp live acceptance",
    risk: "P0/P1",
    owner: "Portal engineering",
    canonStatus: "post-launch-accepted",
    acceptedUntil: "Voor uitnodiging eerste externe portalgebruiker",
    targetEvidence: "Live Playwright artifacts voor wrong-host, module-off, downloads, media en planning refresh.",
    testIds: ["FG-PORTAL-C-001", "FG-PORTAL-C-004", "FG-PORTAL-P-003", "FG-PORTAL-P-005"],
    requiresGoNoGoApproval: true,
  },
  {
    id: "FG-POST-MIGRATION-SMOKE",
    label: "Lege database en staging-copy migration smoke artifacts",
    risk: "P0/P1",
    owner: "Platform engineering",
    canonStatus: "post-launch-accepted",
    acceptedUntil: "Voor main-to-staging promotie met schemawijziging",
    targetEvidence: "artifacts/migration-smoke JSON voor empty-database en staging-copy.",
    testIds: ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"],
    requiresGoNoGoApproval: true,
  },
  {
    id: "FG-POST-AUDIT-CENTRALIZATION",
    label: "Security/audit centralisatie en denial events",
    risk: "P1",
    owner: "Platform engineering",
    canonStatus: "post-launch-accepted",
    acceptedUntil: "Voor eerste externe tenant security review",
    targetEvidence: "Security dashboard toont support, download, PDF, module-denial en storage-denial events per tenant.",
    testIds: ["FG-AUDIT-001", "FG-AUDIT-002", "FG-AUDIT-004", "FG-OPS-005"],
    requiresGoNoGoApproval: true,
  },
  {
    id: "FG-POST-MATERIAL-INVENTORY",
    label: "Materialen en inventaris productroadmap",
    risk: "P1/P2",
    owner: "Product engineering",
    canonStatus: "post-launch-accepted",
    acceptedUntil: "Na SaaS proof of aparte roadmap",
    targetEvidence: "Module/RBAC/storage/audit tests zodra de volledige module wordt geactiveerd voor externe tenants.",
    testIds: ["FG-MODULE-001", "FG-AUDIT-001"],
    requiresGoNoGoApproval: true,
  },
];

export const supabaseChangelogFindings = [
  {
    date: "2026-06-22",
    finding: "log_connections wordt niet langer standaard aangezet voor nieuwe en bestaande Free/Pro projecten.",
    impact: "Operationele DB-observability moet niet op log_connections als enige bewijs leunen.",
  },
  {
    date: "2026-05-25",
    finding: "pg_graphql 1.6.0 schakelt GraphQL introspection standaard uit.",
    impact: "Geen Sprint 16 schema-impact zolang Fieldgrid niet op publieke pg_graphql introspection leunt.",
  },
  {
    date: "2026-05-12",
    finding: "Supabase support voor Postgres 14 eindigde op 2026-07-01.",
    impact: "Staging/productie Postgres major versie moet onderdeel van de externe tenant gate blijven.",
  },
  {
    date: "2026-04-28",
    finding: "Nieuwe public tabellen worden niet meer automatisch blootgesteld aan Data/GraphQL API.",
    impact: "Nieuwe SQL-tabellen moeten expliciete grants plus RLS krijgen; Sprint 16 voegt geen tabellen toe.",
  },
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    check: false,
    json: false,
    help: false,
    outDir: join(repoRoot, FINAL_GATE_REPORT_DIR),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = () => inlineValue ?? argv[++index];

    switch (flag) {
      case "--check":
        options.check = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--out":
      case "--out-dir":
        options.outDir = resolve(repoRoot, nextValue());
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

async function listSourceFiles(root) {
  const files = [];
  let entries = [];

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;

    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(path)));
      continue;
    }

    if (/\.(ts|tsx|mjs|md)$/u.test(entry.name)) files.push(path);
  }

  return files;
}

export async function collectServiceRoleUsage() {
  const roots = ["artifacts", "lib", "scripts"].map((path) => join(repoRoot, path));
  const files = (await Promise.all(roots.map(listSourceFiles))).flat();
  const usages = [];
  const publicExposureFiles = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const matchesServiceRole = /SUPABASE_SERVICE_ROLE_KEY|service_role|service-role/iu.test(content);
    if (!matchesServiceRole) continue;

    const relativePath = file.slice(repoRoot.length + 1).replace(/\\/gu, "/");
    usages.push(relativePath);

    const looksClientSide =
      /\/client\.(ts|tsx)$/u.test(relativePath) || /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE(?:_KEY)?\s*=/u.test(content);
    if (looksClientSide) publicExposureFiles.push(relativePath);
  }

  return {
    files: usages.sort(),
    publicExposureFiles: publicExposureFiles.sort(),
  };
}

export function buildSprint16FinalGatePlan(serviceRoleReview = { files: [], publicExposureFiles: [] }) {
  return {
    version: SPRINT16_FINAL_GATE_VERSION,
    sprint: 16,
    marker: "fieldgrid-sprint-16-final-external-tenant-gate",
    destructive: false,
    noMigration: true,
    releaseDecision: "conditional-go-with-explicit-post-launch-acceptance",
    canonicalStatuses,
    reportDirectory: FINAL_GATE_REPORT_DIR,
    requirements: finalGateRequirements,
    postLaunchExceptions,
    serviceRoleReview,
    supabaseChangelog: {
      checkedAt: "2026-07-04",
      source: "https://supabase.com/changelog.md",
      findings: supabaseChangelogFindings,
    },
    requiredDocs: [
      "docs/fieldgrid-sprint-16-final-gate.md",
      "docs/fieldgrid-saas-proof-sprint-plan.md",
      "docs/fieldgrid-first-external-tenant-checklist.md",
      "docs/fieldgrid-staging-promotion-checklist.md",
      "docs/fieldgrid-data-classification.md",
      "docs/fieldgrid-cross-tenant-testmatrix.md",
    ],
    requiredCommands: [
      "pnpm fieldgrid:sprint16-final-gate:check",
      "pnpm fieldgrid:sprint7-migration-smoke --run --target all",
      "pnpm fieldgrid:sprint15-staging-smoke:run-read-only",
    ],
  };
}

export function validateSprint16FinalGatePlan(plan = buildSprint16FinalGatePlan()) {
  const errors = [];

  if (plan.destructive) errors.push("Sprint 16 final gate mag niet destructief zijn.");
  if (!plan.noMigration) errors.push("Sprint 16 final gate mag geen migratie toevoegen.");
  if (!plan.canonicalStatuses.includes("post-launch-accepted")) {
    errors.push("Canon mist post-launch-accepted status.");
  }
  if (plan.requirements.length < 5) errors.push("Final gate mist verplichte requirements.");
  if (plan.postLaunchExceptions.length < 6) errors.push("Post-launch register mist geaccepteerde uitzonderingen.");

  for (const requirement of plan.requirements) {
    if (!requirement.id.startsWith("FG-FINAL-")) errors.push(`${requirement.id} gebruikt geen FG-FINAL id.`);
    if (requirement.canonStatus !== "post-launch-accepted") errors.push(`${requirement.id} mist post-launch-accepted status.`);
    if (!requirement.evidence || !requirement.nextAction || !requirement.requiredCommand) {
      errors.push(`${requirement.id} mist evidence, nextAction of command.`);
    }
  }

  for (const exception of plan.postLaunchExceptions) {
    if (!exception.owner) errors.push(`${exception.id} mist owner.`);
    if (!exception.targetEvidence) errors.push(`${exception.id} mist targetEvidence.`);
    if (!Array.isArray(exception.testIds) || exception.testIds.length === 0) errors.push(`${exception.id} mist testIds.`);
    if (exception.risk.includes("P0") || exception.risk.includes("P1")) {
      if (!exception.requiresGoNoGoApproval) errors.push(`${exception.id} P0/P1 uitzondering mist go/no-go approval.`);
    }
  }

  const serviceRoleFiles = plan.serviceRoleReview.files ?? [];
  const publicExposureFiles = plan.serviceRoleReview.publicExposureFiles ?? [];
  if (publicExposureFiles.length > 0) {
    errors.push(`Service-role key lijkt client-side gebruikt: ${publicExposureFiles.join(", ")}`);
  }
  if (!serviceRoleFiles.some((file) => file.endsWith("artifacts/backoffice/src/lib/supabase/admin.ts"))) {
    errors.push("Service-role review mist backoffice admin client.");
  }
  if (!serviceRoleFiles.some((file) => file.endsWith("artifacts/klant-pwa/src/lib/supabase/admin.ts"))) {
    errors.push("Service-role review mist klant-pwa admin client.");
  }
  if (!serviceRoleFiles.some((file) => file.endsWith("artifacts/personeel-pwa/src/lib/supabase/admin.ts"))) {
    errors.push("Service-role review mist personeel-pwa admin client.");
  }

  return errors;
}

function usage() {
  return `Fieldgrid sprint 16 final gate\n\nUsage:\n  pnpm fieldgrid:sprint16-final-gate:check\n  pnpm fieldgrid:sprint16-final-gate --json\n\nSafety:\n  This script is read-only. It adds no migration and performs no tenant mutations.\n`;
}

function printPlan(plan) {
  console.log("Fieldgrid sprint 16 final external tenant gate");
  console.log("");
  console.log(`Version: ${plan.version}`);
  console.log(`Decision: ${plan.releaseDecision}`);
  console.log(`Requirements: ${plan.requirements.length}`);
  console.log(`Post-launch exceptions: ${plan.postLaunchExceptions.length}`);
  console.log(`Service-role files reviewed: ${plan.serviceRoleReview.files.length}`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const serviceRoleReview = await collectServiceRoleUsage();
  const plan = buildSprint16FinalGatePlan(serviceRoleReview);
  const errors = validateSprint16FinalGatePlan(plan);

  if (options.help) {
    console.log(usage());
    return 0;
  }

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
  }

  if (errors.length > 0) {
    console.error("Fieldgrid sprint 16 final gate contract failed:");
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }

  if (options.check) {
    console.log("Fieldgrid sprint 16 final gate contract is valid.");
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

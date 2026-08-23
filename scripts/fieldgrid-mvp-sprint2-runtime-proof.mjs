#!/usr/bin/env node
import { access, readdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

export const MVP_SPRINT2_RUNTIME_PROOF_VERSION =
  "mvp-sprint-2-runtime-proof-v1";
export const MVP_SPRINT2_EVIDENCE_DIR = "artifacts/mvp-sprint2-runtime-proof";

export const mvpSprint2PilotTenant = {
  slug: "field-demo",
  host: "field-demo.staging.fieldgrid.nl",
  ownerEmail: "services@fieldgrid.nl",
  plan: "Enterprise",
  modules: "all",
  mutatingConfirm: "field-demo-only",
};

export const mvpSprint2SourceContracts = [
  {
    path: "scripts/fieldgrid-sprint15-staging-smoke.mjs",
    phrases: [
      "DEFAULT_STAGING_PILOT_TENANT_SLUG",
      "field-demo",
      "field-demo-only",
      "FG-LIVE-HOST",
      "FG-LIVE-CUSTOMER-PORTAL",
      "FG-LIVE-PERSONNEL-PLANNING",
      "FG-LIVE-STORAGE-PDF",
      "runReadOnlySnapshot",
    ],
  },
  {
    path: "scripts/fieldgrid-sprint7-migration-smoke.mjs",
    phrases: [
      "empty-database",
      "staging-copy",
      "FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL",
      "FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL",
      "REQUIRED_REPORT_FIELDS",
    ],
  },
  {
    path: "scripts/fieldgrid-sprint5-runtime-proof.mjs",
    phrases: ["validateSprint5RuntimeProof", "runtime security proof"],
  },
  {
    path: "scripts/fieldgrid-sprint6-portal-acceptance.mjs",
    phrases: ["validateSprint6PortalAcceptance", "portal acceptance"],
  },
  {
    path: "scripts/fieldgrid-platform-admin-final-gate.mjs",
    phrases: [
      "field-demo pilot host-first checks",
      "FG-PA-GATE-NOTIFICATIONS",
      "FIELDGRID_MUTATING_SMOKE_CONFIRM=field-demo-only",
    ],
  },
  {
    path: "lib/db/src/email-service.ts",
    phrases: [
      "sendTemplatedEmail",
      "emailDeliveryLogTable",
      "resolveActiveProvider(normalizedInput.tenantId)",
    ],
  },
  {
    path: "lib/db/src/email-secret-crypto.ts",
    phrases: [
      "FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY",
      "decryptTenantSmtpPassword",
    ],
  },
  {
    path: "lib/db/src/email-templates.ts",
    phrases: [
      "renderEmailTemplatePreview",
      "getTenantTemplateOverride",
      "applyTemplateOverride",
      "platform_email_test",
    ],
  },
  {
    path: "artifacts/backoffice/src/app/actions/platform-notifications.ts",
    phrases: [
      "createPlatformNotificationDispatch",
      "buildRecipients",
      "platform_notification_dispatch_created",
    ],
  },
  {
    path: "docs/fieldgrid-mvp-sprint-2-runtime-proof.md",
    phrases: [
      "MVP Sprint 2",
      "Definition of done",
      "field-demo",
      "FIELDGRID_MUTATING_SMOKE_CONFIRM=field-demo-only",
      "https://github.com/veele-services/platform/actions/runs/28902141188",
    ],
  },
];

export const mvpSprint2RequiredGateIds = [
  "FG-MVP2-MIGRATIONS",
  "FG-MVP2-STAGING-SMOKE",
  "FG-MVP2-LOGIN-HOST",
  "FG-MVP2-TENANT-ISOLATION",
  "FG-MVP2-STORAGE-DOWNLOAD",
  "FG-MVP2-PORTALS",
  "FG-MVP2-NOTIFICATIONS-EMAIL",
  "FG-MVP2-PLATFORM-ADMIN",
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    check: false,
    json: false,
    help: false,
    strictEvidence: false,
    outDir: join(repoRoot, MVP_SPRINT2_EVIDENCE_DIR),
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
      case "--strict":
      case "--strict-evidence":
        options.strictEvidence = true;
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

async function exists(relativePath) {
  try {
    await access(join(repoRoot, relativePath), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function readText(relativePath) {
  return readFile(join(repoRoot, relativePath), "utf8");
}

async function latestJsonArtifact(relativeDir) {
  const directory = join(repoRoot, relativeDir);

  try {
    const filenames = (await readdir(directory))
      .filter((filename) => filename.endsWith(".json"))
      .sort()
      .reverse();
    const filename = filenames[0];
    if (!filename) return null;

    const relativePath = `${relativeDir}/${filename}`;
    const content = await readFile(join(repoRoot, relativePath), "utf8");

    try {
      return {
        path: relativePath,
        parsed: JSON.parse(content),
        readable: true,
      };
    } catch (error) {
      return {
        path: relativePath,
        parsed: null,
        readable: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } catch {
    return null;
  }
}

function manualEvidence(env, prefix) {
  const status = env[`${prefix}_STATUS`]?.trim().toLowerCase() || "";
  const url = env[`${prefix}_URL`]?.trim() || "";
  const summary = env[`${prefix}_SUMMARY`]?.trim() || "";

  if (!status && !url && !summary) return null;

  return {
    status,
    url,
    summary,
  };
}

export async function collectMvpSprint2Evidence(env = process.env) {
  const [stagingSmoke, migrationSmoke, platformAdmin, customerPersonnel] =
    await Promise.all([
      latestJsonArtifact("artifacts/staging-smoke"),
      latestJsonArtifact("artifacts/migration-smoke"),
      latestJsonArtifact("artifacts/platform-admin-final-gate"),
      latestJsonArtifact("outputs/customer-personnel-phase16-releasegate"),
    ]);

  return {
    stagingSmoke,
    migrationSmoke,
    platformAdmin,
    customerPersonnel,
    manual: {
      migrationSmoke: manualEvidence(
        env,
        "FIELDGRID_MVP_SPRINT2_MIGRATION_SMOKE",
      ),
      stagingSmoke: manualEvidence(env, "FIELDGRID_MVP_SPRINT2_STAGING_SMOKE"),
      notificationEmail: manualEvidence(
        env,
        "FIELDGRID_MVP_SPRINT2_NOTIFICATION_EMAIL",
      ),
      storageDownload: manualEvidence(
        env,
        "FIELDGRID_MVP_SPRINT2_STORAGE_DOWNLOAD",
      ),
      platformAdmin: manualEvidence(
        env,
        "FIELDGRID_MVP_SPRINT2_PLATFORM_ADMIN",
      ),
      portalAcceptance: manualEvidence(
        env,
        "FIELDGRID_MVP_SPRINT2_PORTAL_ACCEPTANCE",
      ),
    },
  };
}

function passManual(evidence) {
  return evidence?.status === "pass";
}

function artifactPath(artifact) {
  return artifact?.path ?? null;
}

function migrationSmokeResult(evidence) {
  if (passManual(evidence.manual.migrationSmoke)) {
    return {
      status: "ok",
      evidence:
        evidence.manual.migrationSmoke.summary ||
        `Manual migration-smoke evidence: ${evidence.manual.migrationSmoke.url}`,
    };
  }

  const report = evidence.migrationSmoke?.parsed;
  const results = Array.isArray(report?.results) ? report.results : [];
  const requiredTargets = new Set(["empty-database", "staging-copy"]);
  const passedTargets = new Set(
    results
      .filter((result) => result.readiness === "pass")
      .map((result) => result.target),
  );

  if (
    report?.summary?.status === "pass" &&
    [...requiredTargets].every((target) => passedTargets.has(target))
  ) {
    return {
      status: "ok",
      evidence: `Migration-smoke pass via ${artifactPath(evidence.migrationSmoke)}.`,
    };
  }

  if (evidence.migrationSmoke) {
    return {
      status: "blocked",
      evidence: `Laatste migration-smoke is niet groen: ${artifactPath(evidence.migrationSmoke)}.`,
    };
  }

  return {
    status: "blocked",
    evidence:
      "Geen migration-smoke artifact gevonden voor empty-database en staging-copy.",
  };
}

function stagingSmokeResult(evidence) {
  if (passManual(evidence.manual.stagingSmoke)) {
    return {
      status: "ok",
      evidence:
        evidence.manual.stagingSmoke.summary ||
        `Manual staging-smoke evidence: ${evidence.manual.stagingSmoke.url}`,
    };
  }

  const report = evidence.stagingSmoke?.parsed;
  if (
    report?.status === "pass" &&
    Number(report.httpStatus) >= 200 &&
    Number(report.httpStatus) < 300
  ) {
    return {
      status: "ok",
      evidence: `Read-only staging-smoke pass via ${artifactPath(evidence.stagingSmoke)}.`,
    };
  }

  if (evidence.stagingSmoke) {
    return {
      status: "blocked",
      evidence: `Laatste staging-smoke is niet groen: HTTP ${report?.httpStatus ?? "onbekend"} via ${artifactPath(evidence.stagingSmoke)}.`,
    };
  }

  return {
    status: "blocked",
    evidence: "Geen read-only staging-smoke artifact gevonden.",
  };
}

function dashboardLiveTargetStatus(evidence, targetIds) {
  const dashboard = evidence.stagingSmoke?.parsed?.dashboard;
  const liveSmokes = Array.isArray(dashboard?.liveSmokes)
    ? dashboard.liveSmokes
    : [];

  if (liveSmokes.length === 0) return null;

  const targetSet = new Set(targetIds);
  const relevant = liveSmokes.filter((target) => targetSet.has(target.id));
  if (relevant.length === 0) return null;

  if (
    relevant.every((target) => ["ok", "pass", "passed"].includes(target.status))
  ) {
    return {
      status: "ok",
      evidence: `${relevant.length} live target(s) groen in staging-smoke dashboard.`,
    };
  }

  return {
    status: "blocked",
    evidence: `${relevant.length} live target(s) nog niet groen in staging-smoke dashboard.`,
  };
}

function manualOrLive(evidence, manualKey, liveTargetIds, fallbackEvidence) {
  if (passManual(evidence.manual[manualKey])) {
    return {
      status: "ok",
      evidence:
        evidence.manual[manualKey].summary ||
        `Manual evidence: ${evidence.manual[manualKey].url}`,
    };
  }

  const live = dashboardLiveTargetStatus(evidence, liveTargetIds);
  if (live) return live;

  const staging = stagingSmokeResult(evidence);
  if (staging.status === "blocked") {
    return {
      status: "manual",
      evidence: fallbackEvidence,
    };
  }

  return {
    status: "manual",
    evidence: fallbackEvidence,
  };
}

function platformAdminStatus(evidence) {
  if (passManual(evidence.manual.platformAdmin)) {
    return {
      status: "ok",
      evidence:
        evidence.manual.platformAdmin.summary ||
        `Manual platform-admin evidence: ${evidence.manual.platformAdmin.url}`,
    };
  }

  if (evidence.platformAdmin?.parsed) {
    return {
      status: "manual",
      evidence: `Platform-admin artifact aanwezig: ${artifactPath(evidence.platformAdmin)}.`,
    };
  }

  return {
    status: "manual",
    evidence:
      "Platform-admin final gate is contractmatig aanwezig; live owner/admin/support bewijs moet aan artifacts/platform-admin-final-gate worden gekoppeld.",
  };
}

export function buildMvpSprint2GateItems(evidence) {
  const migration = migrationSmokeResult(evidence);
  const staging = stagingSmokeResult(evidence);
  const loginHost = manualOrLive(
    evidence,
    "stagingSmoke",
    ["FG-LIVE-HOST"],
    "Login en host-first routing vereisen een geldige platform-admin staging smoke sessie.",
  );
  const isolation = manualOrLive(
    evidence,
    "stagingSmoke",
    ["FG-LIVE-HOST", "FG-LIVE-MODULES", "FG-LIVE-REGIONS"],
    "Tenant-isolatie blijft gekoppeld aan Sprint 5/6 contracten en live host/direct-ID bewijs.",
  );
  const storage = manualOrLive(
    evidence,
    "storageDownload",
    ["FG-LIVE-STORAGE-PDF"],
    "Storage/download audit vereist live signed URL success, wrong-tenant denial en auditlog.",
  );
  const portals = manualOrLive(
    evidence,
    "portalAcceptance",
    ["FG-LIVE-CUSTOMER-PORTAL", "FG-LIVE-PERSONNEL-PLANNING"],
    "Klant- en personeelsportal proof vereist geauthenticeerde portal sessies of dashboard live target evidence.",
  );
  const notifications = passManual(evidence.manual.notificationEmail)
    ? {
        status: "ok",
        evidence:
          evidence.manual.notificationEmail.summary ||
          `Manual notification/e-mail evidence: ${evidence.manual.notificationEmail.url}`,
      }
    : {
        status: "manual",
        evidence:
          "Lokale template, override, provider en dispatch tests zijn groen; live sandbox dispatch per tenant moet nog als artifact worden gekoppeld.",
      };
  const platformAdmin = platformAdminStatus(evidence);

  return [
    {
      id: "FG-MVP2-MIGRATIONS",
      label: "Migration smoke empty en staging-copy",
      owner: "Platform engineering / DevOps",
      status: migration.status,
      command: "pnpm fieldgrid:sprint7-migration-smoke --run --target all",
      evidence: migration.evidence,
      nextAction:
        "Bewaar de GitHub Actions run of het JSON-artifact bij elke staging promotie.",
      testIds: ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"],
      blocksMvp: true,
    },
    {
      id: "FG-MVP2-STAGING-SMOKE",
      label: "Read-only staging smoke dashboard",
      owner: "Platform operations",
      status: staging.status,
      command: "pnpm fieldgrid:sprint15-staging-smoke:run-read-only",
      evidence: staging.evidence,
      nextAction:
        "Gebruik een verse FIELDGRID_STAGING_SMOKE_COOKIE of bearer voor staging.",
      testIds: ["FG-OPS-008", "FG-LIVE-HOST", "FG-LIVE-STORAGE-PDF"],
      blocksMvp: true,
    },
    {
      id: "FG-MVP2-LOGIN-HOST",
      label: "Login en host-first routing",
      owner: "Platform engineering",
      status: loginHost.status,
      command:
        "Playwright smoke voor staging.fieldgrid.nl/platform en field-demo.staging.fieldgrid.nl",
      evidence: loginHost.evidence,
      nextAction:
        "Leg owner login, tenant host resolutie en unknown-host denial vast.",
      testIds: ["FG-HOST-001", "FG-HOST-002", "FG-HOST-003", "FG-HOST-004"],
      blocksMvp: true,
    },
    {
      id: "FG-MVP2-TENANT-ISOLATION",
      label: "Tenant isolatie en direct-ID denial",
      owner: "Platform engineering",
      status: isolation.status,
      command:
        "pnpm fieldgrid:sprint5-runtime-proof:check && live direct-ID/wrong-host smoke",
      evidence: isolation.evidence,
      nextAction:
        "Bewijs dat field-demo geen data van een andere tenant kan lezen via host, switcher of direct-ID.",
      testIds: ["FG-DATA-001", "FG-RBAC-002", "FG-MODULE-005"],
      blocksMvp: true,
    },
    {
      id: "FG-MVP2-STORAGE-DOWNLOAD",
      label: "Document-storage/download audit",
      owner: "Platform engineering",
      status: storage.status,
      command: "Live document/PDF download smoke met auditlog controle",
      evidence: storage.evidence,
      nextAction:
        "Bewijs eigen signed URL success, cross-tenant denial en tenantgebonden auditregel.",
      testIds: ["FG-STORAGE-001", "FG-STORAGE-002", "FG-AUDIT-001"],
      blocksMvp: true,
    },
    {
      id: "FG-MVP2-PORTALS",
      label: "Customer/personnel portal acceptance",
      owner: "Portal engineering",
      status: portals.status,
      command: "pnpm fieldgrid:customer-personnel-final-gate:strict",
      evidence: portals.evidence,
      nextAction:
        "Draai customer en personnel portal screenshots met storage-state en concrete detailroutes.",
      testIds: [
        "FG-PORTAL-C-001",
        "FG-PORTAL-C-004",
        "FG-PORTAL-P-001",
        "FG-PORTAL-P-005",
      ],
      blocksMvp: true,
    },
    {
      id: "FG-MVP2-NOTIFICATIONS-EMAIL",
      label: "Notificatie/e-mail end-to-end sandbox",
      owner: "Support operations / Platform engineering",
      status: notifications.status,
      command:
        "Sandbox dispatch per tenant: template render, tenant override, dispatch history, email_delivery_log en audit",
      evidence: notifications.evidence,
      nextAction:
        "Voer een interne field-demo dispatch/testmail uit en herstel tijdelijke template overrides.",
      testIds: ["FG-AUDIT-001", "FG-PLATFORM-005", "FG-PORTAL-C-004"],
      blocksMvp: true,
    },
    {
      id: "FG-MVP2-PLATFORM-ADMIN",
      label: "Platform-admin owner/admin/support smoke",
      owner: "Platform engineering",
      status: platformAdmin.status,
      command: "pnpm fieldgrid:platform-admin-final-gate:strict",
      evidence: platformAdmin.evidence,
      nextAction:
        "Leg owner, admin en support rolgedrag vast inclusief support-only denials.",
      testIds: ["FG-PLATFORM-001", "FG-PLATFORM-002", "FG-SUPPORT-001"],
      blocksMvp: true,
    },
  ];
}

export async function buildMvpSprint2RuntimeProofPlan(options = {}) {
  const evidence = await collectMvpSprint2Evidence(options.env ?? process.env);
  const gateItems = buildMvpSprint2GateItems(evidence);
  const blocking = gateItems.filter(
    (item) => item.blocksMvp && item.status === "blocked",
  );
  const manual = gateItems.filter(
    (item) => item.blocksMvp && item.status === "manual",
  );
  const strictEvidence = Boolean(options.strictEvidence);

  return {
    version: MVP_SPRINT2_RUNTIME_PROOF_VERSION,
    sprint: "MVP Sprint 2",
    marker: "fieldgrid-mvp-sprint-2-runtime-proof",
    destructive: false,
    noTenantMutation: true,
    strictEvidence,
    pilotTenant: mvpSprint2PilotTenant,
    status:
      blocking.length > 0
        ? "blocked"
        : manual.length > 0
          ? "manual-evidence-open"
          : "ok",
    decision:
      blocking.length > 0 || (strictEvidence && manual.length > 0)
        ? "no-go"
        : manual.length > 0
          ? "conditional-go-with-owners"
          : "ready",
    gateItems,
    evidence,
    sourceContracts: mvpSprint2SourceContracts,
    evidenceDirectories: [
      "artifacts/staging-smoke",
      "artifacts/migration-smoke",
      "artifacts/platform-admin-final-gate",
      "outputs/customer-personnel-phase16-releasegate",
      MVP_SPRINT2_EVIDENCE_DIR,
    ],
    requiredCommands: [
      "pnpm fieldgrid:mvp-sprint2-runtime-proof:check",
      "pnpm fieldgrid:sprint15-staging-smoke:run-read-only",
      "pnpm fieldgrid:sprint7-migration-smoke --run --target all",
      "pnpm fieldgrid:platform-admin-final-gate:strict",
      "pnpm fieldgrid:customer-personnel-final-gate:strict",
    ],
    requiredDocs: [
      "docs/fieldgrid-mvp-sprint-2-runtime-proof.md",
      "docs/fieldgrid-first-external-tenant-checklist.md",
      "docs/fieldgrid-staging-promotion-checklist.md",
    ],
  };
}

export async function validateMvpSprint2RuntimeProofPlan(plan) {
  const errors = [];
  const gateIds = new Set(plan.gateItems.map((item) => item.id));

  if (plan.version !== MVP_SPRINT2_RUNTIME_PROOF_VERSION) {
    errors.push("Onverwachte MVP Sprint 2 runtime proof versie.");
  }
  if (plan.destructive)
    errors.push("MVP Sprint 2 gate mag niet destructief zijn.");
  if (!plan.noTenantMutation)
    errors.push("MVP Sprint 2 gate moet read-only zijn.");
  if (plan.pilotTenant.slug !== "field-demo")
    errors.push("Pilottenant moet field-demo zijn.");
  if (plan.pilotTenant.mutatingConfirm !== "field-demo-only") {
    errors.push("Mutating confirm moet field-demo-only zijn.");
  }

  for (const id of mvpSprint2RequiredGateIds) {
    if (!gateIds.has(id)) errors.push(`MVP Sprint 2 gate mist ${id}.`);
  }

  for (const item of plan.gateItems) {
    if (!item.owner) errors.push(`${item.id} mist owner.`);
    if (!item.command) errors.push(`${item.id} mist command.`);
    if (!item.evidence) errors.push(`${item.id} mist evidence.`);
    if (!item.nextAction) errors.push(`${item.id} mist nextAction.`);
    if (!Array.isArray(item.testIds) || item.testIds.length === 0) {
      errors.push(`${item.id} mist testIds.`);
    }
    if (!["ok", "manual", "blocked"].includes(item.status)) {
      errors.push(`${item.id} heeft onbekende status ${item.status}.`);
    }
  }

  for (const contract of plan.sourceContracts) {
    if (!(await exists(contract.path))) {
      errors.push(`Bronbestand ontbreekt: ${contract.path}.`);
      continue;
    }

    const content = await readText(contract.path);
    for (const phrase of contract.phrases) {
      if (!content.includes(phrase))
        errors.push(`${contract.path} mist "${phrase}".`);
    }
  }

  if (plan.strictEvidence) {
    for (const item of plan.gateItems.filter(
      (candidate) => candidate.blocksMvp,
    )) {
      if (item.status !== "ok") {
        errors.push(
          `Strict evidence blokkeert op ${item.id}: ${item.evidence}`,
        );
      }
    }
  }

  return errors;
}

function usage() {
  return `Fieldgrid MVP Sprint 2 runtime proof

Usage:
  pnpm fieldgrid:mvp-sprint2-runtime-proof:check
  pnpm fieldgrid:mvp-sprint2-runtime-proof --json
  pnpm fieldgrid:mvp-sprint2-runtime-proof:strict

Environment for manual evidence:
  FIELDGRID_MVP_SPRINT2_MIGRATION_SMOKE_STATUS=pass
  FIELDGRID_MVP_SPRINT2_MIGRATION_SMOKE_URL=https://...
  FIELDGRID_MVP_SPRINT2_STAGING_SMOKE_STATUS=pass
  FIELDGRID_MVP_SPRINT2_NOTIFICATION_EMAIL_STATUS=pass

Safety:
  This gate is read-only and never mutates tenant data.
`;
}

function printPlan(plan) {
  console.log("Fieldgrid MVP Sprint 2 runtime proof");
  console.log("");
  console.log(`Version: ${plan.version}`);
  console.log(`Pilot tenant: ${plan.pilotTenant.slug}`);
  console.log(`Decision: ${plan.decision}`);
  console.log(`Status: ${plan.status}`);
  console.log(`Gate items: ${plan.gateItems.length}`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(usage());
    return 0;
  }

  const plan = await buildMvpSprint2RuntimeProofPlan({
    strictEvidence: options.strictEvidence,
  });
  const errors = await validateMvpSprint2RuntimeProofPlan(plan);

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
  }

  if (errors.length > 0) {
    console.error("Fieldgrid MVP Sprint 2 runtime proof failed:");
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }

  if (options.check) {
    console.log("Fieldgrid MVP Sprint 2 runtime proof contract is valid.");
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

#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

export const PLATFORM_ADMIN_FINAL_GATE_VERSION = "platform-admin-final-gate-v1";
export const PLATFORM_ADMIN_FINAL_GATE_REPORT_DIR = "artifacts/platform-admin-final-gate";

const requiredGateIds = [
  "FG-PA-GATE-ROLES",
  "FG-PA-GATE-HOST-FIRST",
  "FG-PA-GATE-ENTERPRISE-CUSTOM-DOMAIN",
  "FG-PA-GATE-NON-ENTERPRISE-DENIAL",
  "FG-PA-GATE-CADDY-ASK",
  "FG-PA-GATE-LIFECYCLE",
  "FG-PA-GATE-SUBSCRIPTION-DOWNGRADE",
  "FG-PA-GATE-TICKETS",
  "FG-PA-GATE-NOTIFICATIONS",
  "FG-PA-GATE-AUDIT-EXPORT",
  "FG-PA-GATE-MOBILE-SCREENSHOTS",
  "FG-PA-GATE-BUILD-TYPECHECK",
];

export const platformAdminReleaseGateItems = [
  {
    id: "FG-PA-GATE-ROLES",
    label: "Runtime tests voor platform owner/admin/support",
    owner: "Platform engineering",
    status: "manual",
    persona: "owner/admin/support",
    host: "admin.fieldgrid.nl",
    route: "/platform, /platform/security, /platform/users",
    requiredCommand: "Run platform owner/admin/support Playwright smoke met drie ingelogde accounts.",
    evidence: "Screenshots en traces bewijzen platform owner, admin en support rolgedrag inclusief support-only denials.",
    testIds: ["FG-PLATFORM-001", "FG-PLATFORM-002", "FG-PLATFORM-003", "FG-SUPPORT-001"],
    blocksRelease: true,
    nextAction: "Voeg artifacts toe onder artifacts/platform-admin-final-gate/roles.",
  },
  {
    id: "FG-PA-GATE-HOST-FIRST",
    label: "field-demo pilot host-first checks",
    owner: "Platform engineering",
    status: "manual",
    persona: "tenant-pilot",
    host: "field-demo.fieldgrid.nl",
    route: "/, /klant, /personeel",
    requiredCommand: "Playwright host-first smoke voor field-demo plus wrong-host denial.",
    evidence: "Browser traces bewijzen dat hostcontext leidend is en cross-tenant direct-id toegang faalt.",
    testIds: ["FG-HOST-001", "FG-HOST-002", "FG-HOST-003", "FG-DATA-001"],
    blocksRelease: true,
    nextAction: "Noteer de run-id in het go/no-go formulier.",
  },
  {
    id: "FG-PA-GATE-ENTERPRISE-CUSTOM-DOMAIN",
    label: "Enterprise custom-domain staging test",
    owner: "Platform engineering",
    status: "manual",
    persona: "enterprise",
    host: "enterprise custom domain",
    route: "/admin",
    requiredCommand: "Voeg Enterprise custom domain toe, verifieer DNS/TLS en open tenant via dat domein.",
    evidence: "tenant_domains status, DNS/TLS check artifact en browser screenshot op custom domain.",
    testIds: ["FG-HOST-006", "FG-PLATFORM-004", "FG-OPS-008"],
    blocksRelease: true,
    nextAction: "Gebruik een staging custom domain met TXT-verificatie en Caddy on-demand TLS.",
  },
  {
    id: "FG-PA-GATE-NON-ENTERPRISE-DENIAL",
    label: "Non-Enterprise custom-domain denial",
    owner: "Platform engineering",
    status: "manual",
    persona: "non-enterprise",
    host: "starter/professional tenant",
    route: "/platform/tenants/:tenantId?tab=domains",
    requiredCommand: "Probeer custom domain toe te voegen op non-Enterprise tenant en bevestig server-side denial.",
    evidence: "UI-disabled screenshot, server action denial en audit-event.",
    testIds: ["FG-HOST-006", "FG-PLATFORM-005", "FG-AUDIT-001"],
    blocksRelease: true,
    nextAction: "Leg de denied action vast met Starter of Professional tenant.",
  },
  {
    id: "FG-PA-GATE-CADDY-ASK",
    label: "Caddy ask endpoint staging test",
    owner: "Platform engineering",
    status: "manual",
    persona: "platform",
    host: "api/internal",
    route: "/internal/caddy/ask-domain",
    requiredCommand: "curl ask-domain voor verified Enterprise, pending, disabled, non-Enterprise en onbekend domein.",
    evidence: "Statusmatrix: 200 alleen voor verified/active Enterprise domain; alle andere requests 403.",
    testIds: ["FG-HOST-006", "FG-OPS-008", "FG-AUDIT-004"],
    blocksRelease: true,
    nextAction: "Draai vanaf VPS of CI met interne API URL.",
  },
  {
    id: "FG-PA-GATE-LIFECYCLE",
    label: "Tenant lifecycle smoke",
    owner: "Platform engineering",
    status: "manual",
    persona: "platform",
    host: "admin.fieldgrid.nl",
    route: "/platform/tenants/:tenantId",
    requiredCommand: "Suspend/reactivate/archive/retry smoke op field-demo met rollback.",
    evidence: "Marker-scoped mutating smoke met cleanup en audit-events.",
    testIds: ["FG-LIFE-001", "FG-LIFE-002", "FG-PLATFORM-004"],
    blocksRelease: true,
    nextAction: "Voer alleen uit met FIELDGRID_MUTATING_SMOKE_CONFIRM=field-demo-only.",
  },
  {
    id: "FG-PA-GATE-SUBSCRIPTION-DOWNGRADE",
    label: "Subscription downgrade smoke",
    owner: "Platform engineering",
    status: "manual",
    persona: "platform",
    host: "admin.fieldgrid.nl",
    route: "/platform/subscriptions",
    requiredCommand: "Downgrade Enterprise naar Professional/Starter en bevestig disabled_plan voor custom domains.",
    evidence: "Subscription update artifact, disabled custom-domain status en audit-event.",
    testIds: ["FG-OPS-003", "FG-HOST-006", "FG-AUDIT-001"],
    blocksRelease: true,
    nextAction: "Gebruik demo Enterprise tenant en herstel het plan na de smoke.",
  },
  {
    id: "FG-PA-GATE-TICKETS",
    label: "Ticket lifecycle smoke",
    owner: "Support operations",
    status: "manual",
    persona: "support",
    host: "admin.fieldgrid.nl",
    route: "/platform/tickets",
    requiredCommand: "Maak platformticket, voeg interne notitie toe, wijzig status/SLA en sluit ticket.",
    evidence: "Ticketdetail screenshot en platform_ticket_* audit-events.",
    testIds: ["FG-SUPPORT-001", "FG-SUPPORT-004", "FG-AUDIT-001"],
    blocksRelease: true,
    nextAction: "Draai met supportaccount en bevestig owner/admin toegang.",
  },
  {
    id: "FG-PA-GATE-NOTIFICATIONS",
    label: "Meldingen smoke",
    owner: "Support operations",
    status: "manual",
    persona: "admin",
    host: "admin.fieldgrid.nl",
    route: "/platform/notifications",
    requiredCommand: "Maak template dispatch voor specifieke tenant owners en controleer ontvangersnapshot.",
    evidence: "Recipient preview, dispatch history en platform_notification_dispatch_created audit-event.",
    testIds: ["FG-PORTAL-C-004", "FG-AUDIT-001", "FG-PLATFORM-005"],
    blocksRelease: true,
    nextAction: "Gebruik interne stagingtemplate en verstuur niet naar productieadressen.",
  },
  {
    id: "FG-PA-GATE-AUDIT-EXPORT",
    label: "Audit export smoke",
    owner: "Platform engineering",
    status: "manual",
    persona: "admin",
    host: "admin.fieldgrid.nl",
    route: "/api/platform/security/export",
    requiredCommand: "Download CSV met tenant, actor, severity en supportGrant filters.",
    evidence: "CSV artifact met expected headers en gefilterde auditregels.",
    testIds: ["FG-AUDIT-001", "FG-AUDIT-002", "FG-AUDIT-004"],
    blocksRelease: true,
    nextAction: "Controleer dat metadata geen cross-tenant data lekt.",
  },
  {
    id: "FG-PA-GATE-MOBILE-SCREENSHOTS",
    label: "Mobile screenshots",
    owner: "Platform engineering",
    status: "manual",
    persona: "ci",
    host: "admin.fieldgrid.nl",
    route: "/platform, /platform/tenants, tenantdetail, domains, tickets, security",
    requiredCommand: "pnpm fieldgrid:platform-phase13-visual-smoke",
    evidence: "390px, 768px en 1440px screenshots plus phase13-visual-smoke.json.",
    testIds: ["FG-OPS-008", "FG-PLATFORM-001"],
    blocksRelease: true,
    nextAction: "Draai met FIELDGRID_PLATFORM_PHASE13_COOKIE en tenant detail path.",
  },
  {
    id: "FG-PA-GATE-BUILD-TYPECHECK",
    label: "Build en typecheck volledig groen",
    owner: "Platform engineering",
    status: "manual",
    persona: "ci",
    host: "CI",
    route: "workspace",
    requiredCommand: "pnpm run typecheck && pnpm -r --if-present run build",
    evidence: "CI job op Node 24 met schone pnpm install.",
    testIds: ["FG-OPS-008"],
    blocksRelease: true,
    nextAction: "Blokkeer release als typecheck of build faalt.",
  },
];

export const platformAdminOpenExceptions = [
  {
    id: "FG-PA-EXCEPTION-RUNTIME-ARTIFACTS",
    label: "Live runtime artifacts ontbreken in repository",
    severity: "P0",
    owner: "Platform engineering",
    acceptedUntil: "Voor promotie van main naar staging en voor eerste productie-tenant",
    targetEvidence: "artifacts/platform-admin-final-gate met role, host-first, lifecycle, subscription en domain smoke JSON.",
    goNoGoRequired: true,
  },
  {
    id: "FG-PA-EXCEPTION-MOBILE-ARTIFACTS",
    label: "Mobile screenshots moeten per release opnieuw worden vastgelegd",
    severity: "P1",
    owner: "Platform engineering",
    acceptedUntil: "Voor releasecandidate markering",
    targetEvidence: "artifacts/platform-mobile-polish/phase13-visual-smoke.json plus screenshots.",
    goNoGoRequired: true,
  },
];

export const sourceContracts = [
  {
    path: "artifacts/backoffice/src/app/actions/platform-smoke.ts",
    phrases: ["buildPlatformAdminReleaseGate", "platformAdminReleaseGate", "FG-PA-GATE-ROLES"],
  },
  {
    path: "artifacts/backoffice/src/app/actions/platform-smoke.types.ts",
    phrases: ["PlatformAdminReleaseGate", "PlatformAdminReleaseGateItem", "PlatformAdminReleaseGateException"],
  },
  {
    path: "artifacts/backoffice/src/app/(platform)/platform/staging-smoke/page.tsx",
    phrases: ["Platform-admin release gate", "Open uitzonderingen", "dashboard.platformAdminReleaseGate"],
  },
  {
    path: "lib/db/src/custom-domains.ts",
    phrases: ["isCustomDomainAllowedForCaddy", "canTenantUseCustomDomains", "ROUTABLE_TENANT_DOMAIN_STATUSES"],
  },
  {
    path: "artifacts/api-server/src/routes/caddy.ts",
    phrases: ["/internal/caddy/ask-domain", "res.status(allowed ? 200 : 403).end()"],
  },
  {
    path: "artifacts/backoffice/src/app/actions/platform-tenants.ts",
    phrases: ["disabled_plan", "tenant_domain_dns_checked", "tenant_subscription_updated"],
  },
  {
    path: "artifacts/backoffice/src/app/actions/platform-tickets.ts",
    phrases: ["createPlatformTicket", "addPlatformTicketNote", "platform_ticket_updated"],
  },
  {
    path: "artifacts/backoffice/src/app/actions/platform-notifications.ts",
    phrases: ["createPlatformNotificationDispatch", "buildRecipients", "platform_notification_dispatch_created"],
  },
  {
    path: "artifacts/backoffice/src/app/api/platform/security/export/route.ts",
    phrases: ["fieldgrid-security-audit", "text/csv", "severity", "denial_type"],
  },
  {
    path: "scripts/fieldgrid-platform-admin-phase13-visual-smoke.mjs",
    phrases: ["mobile-390", "tablet-768", "desktop-1440", "horizontalOverflow"],
  },
  {
    path: "docs/fieldgrid-platform-admin-phase-14-final-gate.md",
    phrases: ["Go/no-go checklist", "FG-PA-GATE-CADDY-ASK", "post-launch accepted"],
  },
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    check: false,
    json: false,
    strictEvidence: false,
    help: false,
    outDir: join(repoRoot, PLATFORM_ADMIN_FINAL_GATE_REPORT_DIR),
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

async function readText(relativePath) {
  return readFile(join(repoRoot, relativePath), "utf8");
}

async function listJsonFiles(relativePath) {
  try {
    return (await readdir(join(repoRoot, relativePath))).filter((filename) => filename.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

export async function collectPlatformAdminGateEvidence() {
  const [finalGate, mobilePolish, stagingSmoke, migrationSmoke] = await Promise.all([
    listJsonFiles(PLATFORM_ADMIN_FINAL_GATE_REPORT_DIR),
    listJsonFiles("artifacts/platform-mobile-polish"),
    listJsonFiles("artifacts/staging-smoke"),
    listJsonFiles("artifacts/migration-smoke"),
  ]);

  return {
    finalGate,
    mobilePolish,
    stagingSmoke,
    migrationSmoke,
  };
}

export async function buildPlatformAdminFinalGatePlan(options = {}) {
  const evidence = await collectPlatformAdminGateEvidence();

  return {
    version: PLATFORM_ADMIN_FINAL_GATE_VERSION,
    phase: 14,
    marker: "fieldgrid-platform-admin-final-gate-v1",
    branch: "codex/platform-admin-final-gate-v1",
    destructive: false,
    noMigration: true,
    releaseDecision: options.strictEvidence ? "blocked-until-runtime-artifacts-exist" : "conditional-go-with-explicit-go-no-go",
    reportDirectory: PLATFORM_ADMIN_FINAL_GATE_REPORT_DIR,
    gateItems: platformAdminReleaseGateItems,
    openExceptions: platformAdminOpenExceptions,
    sourceContracts,
    evidence,
    strictEvidence: Boolean(options.strictEvidence),
    requiredCommands: [
      "pnpm fieldgrid:platform-admin-final-gate:check",
      "pnpm run typecheck && pnpm -r --if-present run build",
      "pnpm fieldgrid:platform-phase13-visual-smoke",
      "pnpm fieldgrid:sprint15-staging-smoke:run-read-only",
      "pnpm fieldgrid:sprint7-migration-smoke --run --target all",
    ],
    requiredDocs: [
      "docs/fieldgrid-platform-admin-roadmap.md",
      "docs/fieldgrid-platform-admin-phase-14-final-gate.md",
      "docs/fieldgrid-first-external-tenant-checklist.md",
      "docs/fieldgrid-staging-promotion-checklist.md",
    ],
  };
}

export async function validatePlatformAdminFinalGatePlan(plan) {
  const errors = [];

  if (plan.destructive) errors.push("Platform-admin final gate mag geen destructieve acties uitvoeren.");
  if (!plan.noMigration) errors.push("Platform-admin final gate mag geen migratie toevoegen.");
  if (plan.version !== PLATFORM_ADMIN_FINAL_GATE_VERSION) errors.push("Onverwachte platform-admin final gate versie.");

  const ids = new Set(plan.gateItems.map((item) => item.id));
  for (const id of requiredGateIds) {
    if (!ids.has(id)) errors.push(`Release gate mist ${id}.`);
  }

  for (const item of plan.gateItems) {
    if (!item.owner) errors.push(`${item.id} mist owner.`);
    if (!item.requiredCommand) errors.push(`${item.id} mist requiredCommand.`);
    if (!item.evidence) errors.push(`${item.id} mist evidence.`);
    if (!item.nextAction) errors.push(`${item.id} mist nextAction.`);
    if (!item.blocksRelease) errors.push(`${item.id} moet release blokkeren tot bewijs gekoppeld is.`);
    if (!Array.isArray(item.testIds) || item.testIds.length === 0) errors.push(`${item.id} mist testIds.`);
  }

  for (const exception of plan.openExceptions) {
    if (!exception.owner) errors.push(`${exception.id} mist owner.`);
    if (!exception.acceptedUntil) errors.push(`${exception.id} mist acceptedUntil.`);
    if (!exception.targetEvidence) errors.push(`${exception.id} mist targetEvidence.`);
    if (!exception.goNoGoRequired) errors.push(`${exception.id} mist go/no-go eis.`);
  }

  for (const contract of plan.sourceContracts) {
    let source = "";
    try {
      source = await readText(contract.path);
    } catch {
      errors.push(`Bronbestand ontbreekt: ${contract.path}.`);
      continue;
    }

    for (const phrase of contract.phrases) {
      if (!source.includes(phrase)) errors.push(`${contract.path} mist "${phrase}".`);
    }
  }

  const packageJson = await readText("package.json");
  if (!packageJson.includes("fieldgrid:platform-admin-final-gate")) errors.push("package.json mist fieldgrid:platform-admin-final-gate.");
  if (!packageJson.includes("fieldgrid:platform-admin-final-gate:check")) errors.push("package.json mist fieldgrid:platform-admin-final-gate:check.");

  if (plan.strictEvidence) {
    if (plan.evidence.finalGate.length === 0) errors.push("Strict evidence mist artifacts/platform-admin-final-gate JSON.");
    if (!plan.evidence.mobilePolish.includes("phase13-visual-smoke.json")) errors.push("Strict evidence mist phase13-visual-smoke.json.");
    if (plan.evidence.stagingSmoke.length === 0) errors.push("Strict evidence mist artifacts/staging-smoke JSON.");
    if (plan.evidence.migrationSmoke.length === 0) errors.push("Strict evidence mist artifacts/migration-smoke JSON.");
  }

  return errors;
}

function usage() {
  return `Fieldgrid platform-admin final gate

Usage:
  pnpm fieldgrid:platform-admin-final-gate:check
  pnpm fieldgrid:platform-admin-final-gate --json
  pnpm fieldgrid:platform-admin-final-gate --strict-evidence

Safety:
  This script is read-only. It adds no migration and performs no tenant mutations.
`;
}

function printPlan(plan) {
  console.log("Fieldgrid platform-admin final gate");
  console.log("");
  console.log(`Version: ${plan.version}`);
  console.log(`Release decision: ${plan.releaseDecision}`);
  console.log(`Gate items: ${plan.gateItems.length}`);
  console.log(`Open exceptions: ${plan.openExceptions.length}`);
  console.log(`Report directory: ${plan.reportDirectory}`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(usage());
    return 0;
  }

  const plan = await buildPlatformAdminFinalGatePlan({ strictEvidence: options.strictEvidence });
  const errors = await validatePlatformAdminFinalGatePlan(plan);

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
  }

  if (errors.length > 0) {
    console.error("Fieldgrid platform-admin final gate contract failed:");
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }

  if (options.check) {
    console.log("Fieldgrid platform-admin final gate contract is valid.");
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

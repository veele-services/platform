#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const requiredAssignmentStatuses = [
  "requested",
  "review",
  "quote_preparation",
  "awaiting_approval",
  "approved",
  "plannable",
  "scheduled",
  "seen",
  "en_route",
  "in_progress",
  "not_completed",
  "completed",
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
];

const requiredTransitions = {
  scheduled: ["seen", "en_route", "in_progress", "plannable"],
  seen: ["en_route", "in_progress", "scheduled"],
  en_route: ["in_progress", "scheduled"],
  in_progress: ["completed", "not_completed"],
  completed: ["report_submitted"],
};

const sourceContracts = [
  {
    path: "artifacts/backoffice/src/lib/planning/day-map-feature.ts",
    phrases: [
      'import "server-only"',
      'PLANNING_DAY_MAP_FEATURE_KEY = "planning_day_map_enabled"',
      'PLANNING_DAY_MAP_ENV_VAR = "FIELDGRID_PLANNING_DAY_MAP_ENABLED"',
      "PLANNING_DAY_MAP_ENABLED_BY_DEFAULT = false",
      "isPlanningDayMapEnabled",
    ],
    forbiddenPhrases: ["NEXT_PUBLIC"],
  },
  {
    path: "artifacts/backoffice/src/app/(dashboard)/planning/page.tsx",
    phrases: [
      "PlanningBoardView",
      "PlanningDayView",
      "PlanningMonthView",
      'hasPermission("planning", "read")',
      'hasPermission("planning", "write")',
      'href={`/planning?date=${date}`}',
      'href={`/planning?day=${date}`}',
      'href={`/planning?month=${date.slice(0, 7)}`}',
    ],
  },
  {
    path: "artifacts/personeel-pwa/src/actions/assignments.ts",
    phrases: [
      'newStatus === "en_route"',
      "updateValues.enRouteAt = current.enRouteAt ?? now",
      "firstEnRouteTrigger",
      "isNull(assignmentsTable.enRouteAt)",
      'newStatus === "en_route" && firstEnRouteTrigger',
      'eventKey: "assignment_en_route"',
      'audience: "customer"',
      'return setAssignmentStatus(assignmentId, "en_route")',
    ],
  },
  {
    path: "artifacts/backoffice/src/lib/process-status.ts",
    phrases: [
      'value: "en_route", label: "Onderweg"',
      'value: "in_progress", label: "In uitvoering"',
      'value: "completed", label: "Afgerond"',
    ],
  },
  {
    path: "docs/fieldgrid-live-day-map-phase1-baseline.md",
    phrases: [
      "Feature flag",
      "Planningroutes",
      "Statusflow baseline",
      "Personeels-PWA statusacties",
      "Geen runtime UI gewijzigd",
    ],
  },
  {
    path: "docs/research-live-day-map-route-buffering.md",
    phrases: [
      "Regressievrij uitvoeringsplan - 10 volledig uitvoerbare fases",
      "Fase 1 - Baseline, feature flag en regressiehek",
    ],
  },
  {
    path: "package.json",
    phrases: [
      "fieldgrid:live-day-map-phase1",
      "fieldgrid-live-day-map-phase1-baseline.mjs",
    ],
  },
];

function parseArgs(argv = process.argv.slice(2)) {
  return {
    check: argv.includes("--check"),
    json: argv.includes("--json"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function usage() {
  return `Fieldgrid live day map phase 1 baseline

Usage:
  pnpm fieldgrid:live-day-map-phase1
  pnpm fieldgrid:live-day-map-phase1:check
`;
}

async function readText(relativePath) {
  return readFile(join(repoRoot, relativePath), "utf8");
}

function parseQuotedStrings(value) {
  return [...value.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
}

function extractArray(source, constName) {
  const match = source.match(
    new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as\\s+const`, "u"),
  );
  return match ? parseQuotedStrings(match[1]) : [];
}

function extractTransition(source, status) {
  const match = source.match(new RegExp(`(?:^|\\n)\\s*${status}:\\s*\\[([^\\]]*)\\]`, "u"));
  return match ? parseQuotedStrings(match[1]) : [];
}

function arraysEqual(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

async function validateSourceContracts() {
  const errors = [];

  for (const contract of sourceContracts) {
    let source = "";
    try {
      source = await readText(contract.path);
    } catch {
      errors.push(`Bronbestand ontbreekt: ${contract.path}`);
      continue;
    }

    for (const phrase of contract.phrases ?? []) {
      if (!source.includes(phrase)) {
        errors.push(`${contract.path} mist verplichte baseline phrase: ${phrase}`);
      }
    }

    for (const phrase of contract.forbiddenPhrases ?? []) {
      if (source.includes(phrase)) {
        errors.push(`${contract.path} bevat verboden phrase voor fase 1: ${phrase}`);
      }
    }
  }

  return errors;
}

async function validateAssignmentStatusBaseline() {
  const errors = [];
  const source = await readText("lib/db/src/schema/assignments.ts");
  const statuses = extractArray(source, "ASSIGNMENT_STATUSES");

  if (!arraysEqual(statuses, requiredAssignmentStatuses)) {
    errors.push(
      `ASSIGNMENT_STATUSES wijkt af. Verwacht ${requiredAssignmentStatuses.join(", ")}; kreeg ${statuses.join(", ")}.`,
    );
  }

  for (const [status, expectedTargets] of Object.entries(requiredTransitions)) {
    const actualTargets = extractTransition(source, status);
    if (!arraysEqual(actualTargets, expectedTargets)) {
      errors.push(
        `Transitie ${status} wijkt af. Verwacht ${expectedTargets.join(", ")}; kreeg ${actualTargets.join(", ")}.`,
      );
    }
  }

  return errors;
}

async function validatePersonnelPortalStatusBaseline() {
  const errors = [];
  const source = await readText("artifacts/personeel-pwa/src/actions/assignments.ts");

  for (const [status, expectedTargets] of Object.entries({
    plannable: ["scheduled", "en_route", "in_progress"],
    scheduled: ["seen", "en_route", "in_progress"],
    seen: ["en_route", "in_progress"],
    en_route: ["in_progress"],
    in_progress: ["completed", "not_completed"],
  })) {
    const actualTargets = extractTransition(source, status);
    if (!arraysEqual(actualTargets, expectedTargets)) {
      errors.push(
        `Personeels-PWA transitie ${status} wijkt af. Verwacht ${expectedTargets.join(", ")}; kreeg ${actualTargets.join(", ")}.`,
      );
    }
  }

  return errors;
}

async function validateFixture() {
  const errors = [];
  const fixtureUrl = pathToFileURL(join(repoRoot, "tests/fixtures/fieldgrid-live-day-map-baseline.mjs"));
  const { liveDayMapBaselineFixture: fixture } = await import(fixtureUrl.href);

  if (fixture.version !== "fieldgrid-live-day-map-phase1-baseline-v1") {
    errors.push("Baseline fixture heeft een onverwachte versie.");
  }
  if (!fixture.tenant?.id) errors.push("Baseline fixture mist tenant.");
  if (!fixture.customer?.tenantId) errors.push("Baseline fixture mist klant.");
  if (!fixture.object?.customerId) errors.push("Baseline fixture mist object.");
  if (!Array.isArray(fixture.personnel) || fixture.personnel.length === 0) {
    errors.push("Baseline fixture mist personeel.");
  }
  if (!Array.isArray(fixture.assignments) || fixture.assignments.length < 4) {
    errors.push("Baseline fixture mist geplande opdrachten.");
  }
  if (!Array.isArray(fixture.assignmentPersonnel) || fixture.assignmentPersonnel.length < fixture.assignments.length) {
    errors.push("Baseline fixture mist personeel-opdracht koppelingen.");
  }

  const assignmentStatuses = new Set(fixture.assignments.map((assignment) => assignment.status));
  for (const status of ["scheduled", "en_route", "in_progress", "completed"]) {
    if (!assignmentStatuses.has(status)) errors.push(`Baseline fixture mist status ${status}.`);
  }

  for (const assignment of fixture.assignments ?? []) {
    if (!assignment.scheduledDate || !assignment.scheduledStart || !assignment.scheduledEnd) {
      errors.push(`Baseline assignment ${assignment.id ?? "(zonder id)"} mist planningdatum/tijd.`);
    }
    if (assignment.tenantId !== fixture.tenant.id) {
      errors.push(`Baseline assignment ${assignment.id} heeft verkeerde tenant.`);
    }
  }

  return errors;
}

export async function buildPhase1BaselineReport() {
  const [sourceErrors, assignmentErrors, pwaErrors, fixtureErrors] = await Promise.all([
    validateSourceContracts(),
    validateAssignmentStatusBaseline(),
    validatePersonnelPortalStatusBaseline(),
    validateFixture(),
  ]);
  const errors = [...sourceErrors, ...assignmentErrors, ...pwaErrors, ...fixtureErrors];

  return {
    version: "fieldgrid-live-day-map-phase1-baseline-gate-v1",
    status: errors.length > 0 ? "blocked" : "ok",
    destructive: false,
    runtimeUiChanged: false,
    featureFlagDefault: false,
    sourceContracts: sourceContracts.map((contract) => contract.path),
    requiredAssignmentStatuses,
    requiredTransitions,
    errors,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const report = await buildPhase1BaselineReport();

  if (options.json) console.log(JSON.stringify(report, null, 2));

  if (report.errors.length > 0) {
    console.error("Fieldgrid live day map phase 1 baseline failed:");
    for (const error of report.errors) console.error(`- ${error}`);
    return 1;
  }

  if (options.check) {
    console.log("Fieldgrid live day map phase 1 baseline contract is valid.");
    return 0;
  }

  console.log("Fieldgrid live day map phase 1 baseline");
  console.log(`Status: ${report.status}`);
  console.log(`Feature flag default: ${report.featureFlagDefault ? "aan" : "uit"}`);
  console.log("Planning board/day/month and assignment status flow are protected.");
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

#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const migrationPath =
  "lib/db/migrations/20260709120000_live_day_map_passive_datamodel.sql";

const sourceContracts = [
  {
    path: "lib/db/src/schema/customers.ts",
    phrases: [
      'latitude:     numeric("latitude"',
      'longitude:    numeric("longitude"',
      'geocodingStatus:   varchar("geocoding_status"',
      'geocodingConfidence: numeric("geocoding_confidence"',
    ],
  },
  {
    path: "lib/db/src/schema/objects.ts",
    phrases: [
      'latitude:    numeric("latitude"',
      'longitude:   numeric("longitude"',
      'geocodingStatus:   varchar("geocoding_status"',
      'geocodingConfidence: numeric("geocoding_confidence"',
    ],
  },
  {
    path: "lib/db/src/schema/personnel.ts",
    phrases: [
      "PERSONNEL_VEHICLE_TYPES",
      '"moped_or_scooter"',
      '"public_transport"',
      'vehicleType:  varchar("vehicle_type"',
    ],
  },
  {
    path: "lib/db/src/schema/organization-settings.ts",
    phrases: [
      'routeProvider: varchar("route_provider"',
      'routeBufferMinutesCar: integer("route_buffer_minutes_car"',
      'routeBufferMinutesPublicTransport: integer("route_buffer_minutes_public_transport"',
      'routeCacheTtlHours: integer("route_cache_ttl_hours"',
    ],
  },
  {
    path: "lib/db/src/schema/planning-routes.ts",
    phrases: [
      "assignmentRouteCacheTable",
      "assignmentRouteContextsTable",
      '"assignment_route_cache"',
      '"assignment_route_contexts"',
      "PlanningRouteSnapStatus",
      "PersonnelVehicleType",
    ],
  },
  {
    path: "lib/db/src/schema/index.ts",
    phrases: ['export * from "./planning-routes";'],
  },
  {
    path: migrationPath,
    phrases: [
      "ALTER TABLE public.customers",
      "ADD COLUMN IF NOT EXISTS latitude numeric(9, 6)",
      "ALTER TABLE public.personnel",
      "ADD COLUMN IF NOT EXISTS vehicle_type varchar(40) NOT NULL DEFAULT 'car'",
      "CREATE TABLE IF NOT EXISTS public.assignment_route_cache",
      "CREATE TABLE IF NOT EXISTS public.assignment_route_contexts",
      "ALTER TABLE public.assignment_route_cache ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE public.assignment_route_contexts ENABLE ROW LEVEL SECURITY",
      "REVOKE ALL PRIVILEGES ON TABLE public.assignment_route_cache FROM anon, authenticated",
      "REVOKE ALL PRIVILEGES ON TABLE public.assignment_route_contexts FROM anon, authenticated",
    ],
  },
  {
    path: "docs/fieldgrid-live-day-map-phase2-datamodel.md",
    phrases: [
      "Passief datamodel",
      "assignment_route_cache",
      "assignment_route_contexts",
      "Directe Data API privileges",
    ],
  },
  {
    path: "package.json",
    phrases: [
      "fieldgrid:live-day-map-phase2",
      "fieldgrid-live-day-map-phase2-datamodel.mjs",
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
  return `Fieldgrid live day map phase 2 datamodel

Usage:
  pnpm fieldgrid:live-day-map-phase2
  pnpm fieldgrid:live-day-map-phase2:check
`;
}

async function readText(relativePath) {
  return readFile(join(repoRoot, relativePath), "utf8");
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

    for (const phrase of contract.phrases) {
      if (!source.includes(phrase)) {
        errors.push(`${contract.path} mist verplichte fase-2 phrase: ${phrase}`);
      }
    }
  }

  return errors;
}

async function validateMigrationSafety() {
  const errors = [];
  const migration = await readText(migrationPath);

  const forbiddenPhrases = [
    "NEXT_PUBLIC",
    "DROP TABLE",
    "DROP COLUMN",
    "TRUNCATE",
    "DELETE FROM public.assignments",
    "UPDATE public.assignments",
  ];

  for (const phrase of forbiddenPhrases) {
    if (migration.includes(phrase)) {
      errors.push(`${migrationPath} bevat verboden regressiephrase: ${phrase}`);
    }
  }

  if (!migration.includes("No existing planning, assignment status or notification flow is changed here.")) {
    errors.push(`${migrationPath} mist expliciete no-runtime-regression toelichting.`);
  }

  return errors;
}

export async function buildPhase2DatamodelReport() {
  const [sourceErrors, migrationErrors] = await Promise.all([
    validateSourceContracts(),
    validateMigrationSafety(),
  ]);
  const errors = [...sourceErrors, ...migrationErrors];

  return {
    version: "fieldgrid-live-day-map-phase2-datamodel-gate-v1",
    status: errors.length > 0 ? "blocked" : "ok",
    destructive: false,
    runtimeUiChanged: false,
    routeTablesDirectClientAccess: "revoked",
    migration: migrationPath,
    sourceContracts: sourceContracts.map((contract) => contract.path),
    errors,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const report = await buildPhase2DatamodelReport();

  if (options.json) console.log(JSON.stringify(report, null, 2));

  if (report.errors.length > 0) {
    console.error("Fieldgrid live day map phase 2 datamodel failed:");
    for (const error of report.errors) console.error(`- ${error}`);
    return 1;
  }

  if (options.check) {
    console.log("Fieldgrid live day map phase 2 datamodel contract is valid.");
    return 0;
  }

  console.log("Fieldgrid live day map phase 2 datamodel");
  console.log(`Status: ${report.status}`);
  console.log("Passive route datamodel and direct API hardening are present.");
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

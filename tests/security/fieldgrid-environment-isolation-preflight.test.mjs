import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertDistinctProjectFingerprints,
  projectIdentityFingerprint,
  runCli,
  supabaseProjectRefFromDatabaseUrl,
  supabaseProjectRefFromPublicUrl,
  validateEnvironmentIsolation,
} from "../../scripts/fieldgrid-environment-isolation-preflight.mjs";

const stagingProject = "olyfmekyqozxrbrwwszu";
const productionProject = "abcdefghijklmnopqrst";

function environment(
  target,
  projectRef = target === "staging" ? stagingProject : productionProject,
) {
  return {
    APP_ENV: target,
    TARGET_ENVIRONMENT: target,
    APP_URL:
      target === "staging"
        ? "https://staging.fieldgrid.nl"
        : "https://app.fieldgrid.nl",
    DATABASE_URL: `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    EXPECTED_SUPABASE_PROJECT_REF: projectRef,
  };
}

test("Supabase direct and pooler identities are normalized", () => {
  assert.equal(
    supabaseProjectRefFromDatabaseUrl(
      `postgresql://postgres:secret@db.${stagingProject}.supabase.co:5432/postgres`,
    ),
    stagingProject,
  );
  assert.equal(
    supabaseProjectRefFromDatabaseUrl(
      `postgresql://postgres.${stagingProject}:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
    ),
    stagingProject,
  );
  assert.equal(
    supabaseProjectRefFromPublicUrl(`https://${stagingProject}.supabase.co`),
    stagingProject,
  );
});

test("each environment validates its own app and database identity", () => {
  assert.equal(
    validateEnvironmentIsolation(environment("staging")).environment,
    "staging",
  );
  assert.equal(
    validateEnvironmentIsolation(environment("production")).environment,
    "production",
  );

  assert.throws(
    () =>
      validateEnvironmentIsolation({
        ...environment("staging"),
        APP_URL: "https://app.fieldgrid.nl",
      }),
    /APP_URL/u,
  );
  assert.throws(
    () =>
      validateEnvironmentIsolation({
        ...environment("production"),
        NEXT_PUBLIC_SUPABASE_URL: `https://${stagingProject}.supabase.co`,
      }),
    /different projects/u,
  );
  assert.throws(
    () =>
      validateEnvironmentIsolation({
        ...environment("staging"),
        NEXT_PUBLIC_SITE_URL: "https://veeleservices.fieldgrid.nl",
      }),
    /opposite environment/u,
  );
  assert.throws(
    () =>
      validateEnvironmentIsolation({
        ...environment("staging"),
        FIELDGRID_RECOVERY_ALLOWED_ORIGINS:
          "https://veeleservices.staging.fieldgrid.nl,https://veeleservices.fieldgrid.nl",
      }),
    /opposite environment/u,
  );
  assert.throws(
    () =>
      validateEnvironmentIsolation({
        ...environment("production"),
        FIELDGRID_CUSTOM_EXPECTED_HOST: "veeleservices.staging.fieldgrid.nl",
      }),
    /opposite environment/u,
  );
});

test("expected and forbidden project identities fail closed", () => {
  assert.throws(
    () =>
      validateEnvironmentIsolation({
        ...environment("staging"),
        EXPECTED_SUPABASE_PROJECT_REF: productionProject,
      }),
    /expected environment project/u,
  );
  assert.throws(
    () =>
      validateEnvironmentIsolation({
        ...environment("production", stagingProject),
        FORBIDDEN_SUPABASE_PROJECT_REF: stagingProject,
      }),
    /forbidden opposite environment/u,
  );
});

test("expected project identity is mandatory", () => {
  const fixture = environment("production");
  delete fixture.EXPECTED_SUPABASE_PROJECT_REF;
  assert.throws(
    () => validateEnvironmentIsolation(fixture),
    /EXPECTED_SUPABASE_PROJECT_REF is required/u,
  );
});

test("cross-environment comparison rejects identical projects", () => {
  const staging = projectIdentityFingerprint(stagingProject);
  const production = projectIdentityFingerprint(productionProject);
  assert.equal(assertDistinctProjectFingerprints(staging, production), true);
  assert.throws(
    () => assertDistinctProjectFingerprints(staging, staging),
    /same database project/u,
  );
  assert.throws(
    () => assertDistinctProjectFingerprints("", production),
    /missing or invalid/u,
  );
});

test("GitHub output contains only the project fingerprint", (t) => {
  const directory = mkdtempSync(
    join(tmpdir(), "fieldgrid-environment-isolation-"),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const outputPath = join(directory, "github-output");
  const env = {
    ...environment("staging"),
    GITHUB_OUTPUT: outputPath,
  };

  runCli(["--validate", "--emit-github-output"], env);
  const output = readFileSync(outputPath, "utf8");
  assert.match(output, /^project_fingerprint=[a-f0-9]{64}\n$/u);
  assert.doesNotMatch(output, new RegExp(stagingProject, "u"));
  assert.doesNotMatch(output, /secret/u);
});

test("workflow exposes environment secrets only from exact main", () => {
  const workflow = readFileSync(
    ".github/workflows/environment-isolation-preflight.yml",
    "utf8",
  );
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /persist-credentials: false/u);
});

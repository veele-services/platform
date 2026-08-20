import assert from "node:assert/strict";
import test from "node:test";
import { assertSmtpCredentialBackfillTarget } from "../../scripts/fieldgrid-smtp-credential-backfill.mts";

const stagingProject = "stagingprojectref1234";
const productionProject = "productionproject123";

function remoteEnvironment(
  environment: "staging" | "production",
  projectRef: string,
): Record<string, string> {
  return {
    APP_ENV: environment,
    TARGET_ENVIRONMENT: environment,
    DATABASE_URL: `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co/`,
    EXPECTED_SUPABASE_PROJECT_REF: projectRef,
    GITHUB_REF_NAME: environment,
  };
}

test("SMTP backfill apply accepts only an exact isolated staging target", () => {
  assert.doesNotThrow(() =>
    assertSmtpCredentialBackfillTarget(
      "apply",
      remoteEnvironment("staging", stagingProject),
    ),
  );
  assert.throws(
    () =>
      assertSmtpCredentialBackfillTarget(
        "apply",
        remoteEnvironment("production", productionProject),
      ),
    /restricted to the isolated staging environment/u,
  );
  assert.throws(
    () =>
      assertSmtpCredentialBackfillTarget("apply", {
        DATABASE_URL:
          "postgresql://postgres:secret@127.0.0.1:5432/fieldgrid_test",
        APP_ENV: "local",
        TARGET_ENVIRONMENT: "local",
      }),
    /restricted to the isolated staging environment/u,
  );
});

test("SMTP backfill check is read-only on isolated production", () => {
  assert.doesNotThrow(() =>
    assertSmtpCredentialBackfillTarget(
      "check",
      remoteEnvironment("production", productionProject),
    ),
  );
});

test("SMTP backfill apply rejects a non-staging ref", () => {
  const environment = remoteEnvironment("staging", stagingProject);
  environment.GITHUB_REF_NAME = "main";
  assert.throws(
    () => assertSmtpCredentialBackfillTarget("apply", environment),
    /requires the staging ref/u,
  );
});

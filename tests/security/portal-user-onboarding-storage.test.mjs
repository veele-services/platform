import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../lib/db/migrations/20260721130000_portal_user_onboarding.sql",
    import.meta.url,
  ),
  "utf8",
);

test("onboarding drafts and preferences are private server-only tenant data", () => {
  for (const table of [
    "portal_onboarding_sessions",
    "portal_onboarding_step_completions",
    "portal_notification_preferences",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`,
        "u",
      ),
    );
    assert.match(
      migration,
      new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`, "u"),
    );
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`,
        "u",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\\.${table} TO service_role`,
        "u",
      ),
    );
  }
  assert.match(
    migration,
    /tenant_id uuid NOT NULL REFERENCES public\.tenants\(id\)/u,
  );
  assert.match(migration, /UNIQUE \(tenant_id, user_id, portal, category\)/u);
  assert.match(
    migration,
    /FOREIGN KEY \(session_id, tenant_id\)[\s\S]*REFERENCES public\.portal_onboarding_sessions\(id, tenant_id\)/u,
  );
});

test("onboarding actions derive tenant and user identity on the server", () => {
  for (const portal of ["personeel", "klant"]) {
    const actions = readFileSync(
      new URL(
        `../../artifacts/${portal}-pwa/src/actions/onboarding.ts`,
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(actions, /auth\.getUser\(\)/u);
    assert.match(
      actions,
      portal === "personeel"
        ? /requireCurrentPersonnelPortalTenantId\(\)/u
        : /requireCurrentCustomerPortalTenantId\(\)/u,
    );
    assert.doesNotMatch(
      actions,
      /input\.tenantId|input\.userId|input\.sessionId/u,
    );
    assert.match(actions, /requestedStepIndex/u);
    assert.match(actions, /requestedStepIndex > currentStepIndex/u);
    assert.match(actions, /session\.completedSteps\.includes\(input\.step\)/u);
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../lib/db/migrations/20260731170000_portal_user_onboarding.sql",
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
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS portal_onboarding_session_identity_idx[\s\S]*\(tenant_id, user_id, portal, subject_id\)/u,
  );
  assert.match(migration, /revision integer NOT NULL DEFAULT 1/u);
  assert.match(
    migration,
    /portal_onboarding_status varchar\(40\) NOT NULL/u,
  );
  assert.match(
    migration,
    /CREATE TRIGGER personnel_portal_onboarding_subject_cleanup[\s\S]*AFTER DELETE ON public\.personnel/u,
  );
  assert.match(
    migration,
    /CREATE TRIGGER customer_user_portal_onboarding_subject_cleanup[\s\S]*AFTER DELETE ON public\.customer_users/u,
  );
  assert.match(
    migration,
    /DELETE FROM public\.portal_onboarding_sessions[\s\S]*tenant_id = OLD\.tenant_id[\s\S]*subject_id = OLD\.id/u,
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
    if (portal === "personeel") {
      assert.match(actions, /auth\.getUser\(\)/u);
      assert.match(actions, /requireCurrentPersonnelPortalTenantId\(\)/u);
    } else {
      assert.match(actions, /getMyCustomerIdentity\(\)/u);
      assert.match(
        actions,
        /eq\(customerUsersTable\.id, selectedIdentity\.customerUserId\)/u,
      );
      assert.match(
        actions,
        /eq\(customerUsersTable\.tenantId, selectedIdentity\.tenantId\)/u,
      );
    }
    assert.doesNotMatch(
      actions,
      /input\.tenantId|input\.userId|input\.sessionId/u,
    );
    assert.match(actions, /requestedStepIndex/u);
    assert.match(actions, /requestedStepIndex > currentStepIndex/u);
    assert.match(actions, /session\.completedSteps\.includes\(input\.step\)/u);
    assert.match(actions, /eq\(portalOnboardingSessionsTable\.subjectId,/u);
    assert.match(
      actions,
      /ne\(portalOnboardingSessionsTable\.status, "completed"\)/u,
    );
  }
});

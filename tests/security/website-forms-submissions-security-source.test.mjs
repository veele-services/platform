import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("Phase 6 form storage is tenant-bound, server-only and append-only", () => {
  const migration = read(
    "lib/db/migrations/20260721260000_website_forms_submissions.sql",
  );
  for (const table of [
    "website_forms",
    "website_form_submissions",
    "website_form_submission_events",
    "website_form_rate_limits",
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
      new RegExp(
        `REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`,
        "u",
      ),
    );
  }
  assert.match(migration, /FOREIGN KEY \(tenant_id, site_id, form_id\)/u);
  assert.match(
    migration,
    /UNIQUE \(tenant_id, site_id, id\)[\s\S]*website_form_submissions_form_fk/u,
  );
  assert.match(
    migration,
    /website_form_submissions_idempotency_idx[\s\S]*tenant_id, form_id, idempotency_hash/u,
  );
  assert.match(migration, /request_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/u);
  assert.match(migration, /events are append-only/u);
  assert.match(
    migration,
    /converted customer must belong to the submission tenant/u,
  );
  assert.match(migration, /website submission redaction is irreversible/u);
  assert.match(migration, /FROM anon, authenticated/u);
});

test("public submission processing derives tenancy from the verified host", () => {
  const service = read("lib/db/src/website-form-service.ts");
  assert.match(service, /resolveWebsiteDeliveryByHost\(input\.host\)/u);
  assert.match(service, /resolution\.website/u);
  assert.match(service, /createHmac\("sha256", secret\)/u);
  assert.match(service, /WEBSITE_FORM_HASH_SECRET/u);
  assert.match(service, /consumeRateLimit/u);
  assert.match(
    service,
    /ON CONFLICT \(tenant_id, form_id, idempotency_hash\)/u,
  );
  assert.match(service, /constantTimeEqual/u);
  assert.match(service, /snapshot\.forms\.find/u);
  assert.match(service, /formRow\.status !== "published"/u);
  assert.doesNotMatch(
    service,
    /INSERT[\s\S]{0,300}(?:ip_address|user_agent)/iu,
  );
});

test("the public API bounds bodies, rejects cross-site posts and logs no payload", () => {
  const route = read("artifacts/api-server/src/routes/website-forms.ts");
  const logger = read("artifacts/api-server/src/lib/logger.ts");
  assert.match(route, /MAX_BODY_BYTES = 32 \* 1024/u);
  assert.match(route, /sec-fetch-site"\) === "cross-site"/u);
  assert.match(
    route,
    /normalizeWebsiteRequestHost\(new URL\(origin\)\.host\)/u,
  );
  assert.match(route, /Idempotency-Key|idempotency-key/u);
  assert.match(route, /_companyWebsite/u);
  assert.match(route, /Cache-Control", "no-store"/u);
  assert.doesNotMatch(route, /req\.log\.[^(]*\([^)]*(?:body|data|payload)/iu);
  assert.doesNotMatch(logger, /req\.body/u);
});

test("lead conversion is explicit, tenant-scoped and idempotent", () => {
  const service = read("lib/db/src/website-form-service.ts");
  const actions = read("artifacts/backoffice/src/app/actions/website-forms.ts");
  assert.match(
    service,
    /FROM public\.website_form_submissions[\s\S]*tenant_id = \$1[\s\S]*FOR UPDATE/u,
  );
  assert.match(service, /if \(submission\.customer_id\)[\s\S]*created: false/u);
  assert.match(service, /'lead', true/u);
  assert.match(service, /converted_to_lead/u);
  assert.match(actions, /requirePermission\("website_submissions", "write"\)/u);
  assert.match(actions, /requirePermission\("customers", "write"\)/u);
});

test("the public-form HMAC secret is required by preflight and reaches the API runtime", () => {
  const preflight = read("scripts/fieldgrid-phase2e-staging-preflight.mjs");
  const preflightWorkflow = read(
    ".github/workflows/phase2e-staging-preflight.yml",
  );
  const deployWorkflow = read(".github/workflows/deploy.yml");
  assert.match(preflight, /"WEBSITE_FORM_HASH_SECRET"/u);
  assert.match(
    preflightWorkflow,
    /WEBSITE_FORM_HASH_SECRET:\s*\$\{\{\s*secrets\.WEBSITE_FORM_HASH_SECRET\s*\}\}/u,
  );
  assert.match(
    deployWorkflow,
    /WEBSITE_FORM_HASH_SECRET:\s*\$\{\{\s*secrets\.WEBSITE_FORM_HASH_SECRET\s*\}\}/u,
  );
  assert.match(
    deployWorkflow,
    /printf 'WEBSITE_FORM_HASH_SECRET=%s\\n' "\$WEBSITE_FORM_HASH_SECRET"/u,
  );
});

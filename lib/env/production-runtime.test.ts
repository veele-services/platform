import { describe, expect, it } from "vitest";
import { assertProductionRuntime } from "./production-runtime";

import { productionRuntimeFixture } from "../../tests/fixtures/production-env";

describe("production runtime fails closed before provider or database use", () => {
  it("accepts the complete fixed production runtime", () => expect(() => assertProductionRuntime(productionRuntimeFixture())).not.toThrow());
  it.each([
    { APP_URL: "https://staging.fieldgrid.nl" }, { HOSTNAME: "0.0.0.0" }, { PORT: "3301" },
    { CLAMAV_ENABLED: "false" }, { CLAMAV_SOCKET: "/tmp/clamd.sock" },
    { MOLLIE_API_KEY: "test_FICTITIOUS-staging-only" }, { MOLLIE_WEBHOOK_URL: "https://staging.fieldgrid.nl/api/mollie/webhook" },
    { SUPABASE_SEND_EMAIL_HOOK_SECRET: "v1,whsec_c2hvcnQ=" }, { SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY: "malformed" },
    { ADMIN_API_SECRET: "" }, { NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "invalid" }, { VAPID_PRIVATE_KEY: "" }, { VAPID_PUBLIC_KEY: "different" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co" },
    { GOOGLE_ROUTES_ENABLED: "true" }, { MAIL_MARKETING_ENABLED: "true" }, { OPENROUTESERVICE_API_KEY: "" },
  ])("rejects incomplete or conflicting configuration without logging input: %o", patch => {
    expect(() => assertProductionRuntime({ ...productionRuntimeFixture(), ...patch })).toThrow();
  });
});

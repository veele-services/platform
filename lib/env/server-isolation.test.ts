import { afterEach, expect, it, vi } from "vitest";
import { currentProductionRef, forbiddenProductionRef } from "./staging-database";
import { productionRuntimeFixture } from "../../tests/fixtures/production-env";

vi.mock("server-only", () => ({}));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it.each([forbiddenProductionRef, currentProductionRef])("refuses staging startup on a production project even if API URLs and expected ref agree: %s", async ref => {
  const env = { ...productionRuntimeFixture(), DEPLOY_TARGET: "staging", APP_ENV: "development", APP_URL: "https://staging.fieldgrid.nl", PORT: "3301", EXPECTED_SUPABASE_PROJECT_REF: ref, SUPABASE_URL: `https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, MOLLIE_API_KEY: "test_FICTITIOUS", MOLLIE_WEBHOOK_URL: "https://staging.fieldgrid.nl/api/mollie/webhook" };
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const { getServerEnv } = await import("./server");
  expect(() => getServerEnv()).toThrow(/forbidden|FORBIDDEN/);
});

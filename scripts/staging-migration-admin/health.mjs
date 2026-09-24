import { setTimeout as delay } from "node:timers/promises";

import { proveRuntimeHealth } from "../fieldgrid-runtime-health-proof.mjs";
import { requireThat } from "./contract.mjs";

const ENDPOINTS = Object.freeze([
  {
    service: "backoffice",
    url: "https://staging.fieldgrid.nl/admin/healthz",
  },
  {
    service: "personnel",
    url: "https://staging.fieldgrid.nl/personeel/healthz",
  },
  {
    service: "customer",
    url: "https://staging.fieldgrid.nl/klant/healthz",
  },
  {
    service: "api",
    url: "https://staging.fieldgrid.nl/api/healthz",
  },
]);

export async function verifyRestoredStagingHealth({
  expectedSha,
  attempts = 12,
  retryMilliseconds = 5000,
  probe = proveRuntimeHealth,
  wait = delay,
} = {}) {
  requireThat(/^[0-9a-f]{40}$/u.test(expectedSha), "HEALTH_SHA_INVALID");
  requireThat(
    Number.isInteger(attempts) && attempts >= 1 && attempts <= 12,
    "HEALTH_RETRY_INVALID",
  );
  requireThat(
    Number.isInteger(retryMilliseconds) &&
      retryMilliseconds >= 0 &&
      retryMilliseconds <= 5000,
    "HEALTH_RETRY_INVALID",
  );
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      for (const endpoint of ENDPOINTS) {
        probe({
          url: endpoint.url,
          environment: "staging",
          sha: expectedSha,
          service: endpoint.service,
          timeout: "5",
        });
      }
      return { endpointCount: ENDPOINTS.length, releaseSha: expectedSha };
    } catch {
      if (attempt === attempts) break;
      await wait(retryMilliseconds);
    }
  }
  requireThat(false, "RESTORED_STAGING_HEALTH_FAILED");
}

import { test, expect } from "@playwright/test";

test("built application proves real scanner readiness through its own runtime", async ({ request }) => {
  const response = await request.get("/api/healthz");
  expect(response.status()).toBe(200);
  const health = await response.json();
  expect(health).toMatchObject({ status: "ok", environment: "local", database: "ready", scanner: "ready" });
  expect(JSON.stringify(health)).not.toContain("/socket/");
  const mismatch = await request.get("/api/healthz?release=not-the-running-release");
  expect(mismatch.status()).toBe(409);
});

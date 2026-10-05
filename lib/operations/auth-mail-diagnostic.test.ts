import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { authMailDiagnosticConfiguration, diagnoseAuthMail } from "./auth-mail-diagnostic";

const ref = "abcdefghijklmnopqrst", release = "a".repeat(40);
const marker = "PRIVATE-TEST-SECRET-NOT-FOR-LOGS-2026";
const key = Buffer.from(marker);
const env = {
  GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/main", DEPLOY_TARGET: "staging", APP_ENV: "development",
  APP_URL: "https://staging.fieldgrid.nl", RELEASE_SHA: release,
  EXPECTED_SUPABASE_PROJECT_REF: ref, FORBIDDEN_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw",
  SUPABASE_URL: `https://${ref}.supabase.co`,
  MIGRATION_DATABASE_URL: `postgresql://postgres:${marker}@db.${ref}.supabase.co:5432/postgres?sslmode=require`,
  SUPABASE_SEND_EMAIL_HOOK_SECRET: `v1,whsec_${key.toString("base64")}`,
};
const healthy = () => Response.json({ status: "ok", environment: "staging", database: "ready", scanner: "ready", release });
function harness() {
  const db = { connect: vi.fn().mockResolvedValue(undefined), query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue(undefined) };
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(healthy()).mockResolvedValueOnce(new Response(marker, { status: 401 })).mockResolvedValueOnce(new Response(marker, { status: 400 }));
  const log = vi.fn(), database = vi.fn(() => db);
  return { db, fetch, log, database };
}

describe("read-only staging Auth-mail diagnostics", () => {
  it.each([
    { GITHUB_ACTIONS: "false" }, { GITHUB_REF: "refs/heads/staging" }, { GITHUB_REF: "refs/pull/1/merge" },
    { APP_URL: "https://evil.invalid" }, { RELEASE_SHA: "abc123" }, { DEPLOY_TARGET: "production" },
    { EXPECTED_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw" }, { FORBIDDEN_SUPABASE_PROJECT_REF: "" },
    { SUPABASE_URL: "https://ckdtiuemeygrnujjibnw.supabase.co" },
    { MIGRATION_DATABASE_URL: env.MIGRATION_DATABASE_URL + "&host=evil.invalid" },
    { MIGRATION_DATABASE_URL: env.MIGRATION_DATABASE_URL.replace(":5432/", ":6543/") },
    { SUPABASE_SEND_EMAIL_HOOK_SECRET: "bad" },
  ])("fails before requests or connections when guards change: %j", async changed => {
    const h = harness();
    await expect(diagnoseAuthMail({ ...env, ...changed }, h)).rejects.toThrow("configuration");
    expect(h.fetch).not.toHaveBeenCalled(); expect(h.database).not.toHaveBeenCalled(); expect(h.log).not.toHaveBeenCalled();
  });

  it("removes URI TLS overrides so the explicit verified CA configuration wins", () => {
    expect(new URL(authMailDiagnosticConfiguration(env).connectionString).search).toBe("");
    const runner = readFileSync(new URL("../../scripts/diagnose-auth-mail.ts", import.meta.url), "utf8");
    expect(runner).toContain("rejectUnauthorized: true"); expect(runner).toContain("default_transaction_read_only=on");
    expect(runner).toContain('client.on("error", () => undefined)');
  });

  it.each([new Response(null, { status: 302, headers: { location: "https://evil.invalid" } }), Response.json({ status: "ok", environment: "staging", release: "b".repeat(40) })])("stops on unhealthy or redirected releases without following URLs", async response => {
    const h = harness(); h.fetch.mockReset().mockResolvedValueOnce(response);
    await expect(diagnoseAuthMail(env, h)).rejects.toThrow("health");
    expect(h.fetch).toHaveBeenCalledTimes(1); expect(h.fetch.mock.calls[0][1]?.redirect).toBe("manual"); expect(h.database).not.toHaveBeenCalled();
  });

  it("sends only invalid empty payloads, signs exact bytes and queries aggregates in a read-only transaction", async () => {
    const h = harness(); expect(await diagnoseAuthMail(env, h)).toBe(true);
    expect(h.fetch).toHaveBeenCalledTimes(3);
    for (const [url, init] of h.fetch.mock.calls.slice(1)) {
      expect(String(url)).toBe("https://staging.fieldgrid.nl/api/email/auth");
      expect(init).toMatchObject({ method: "POST", body: "{}", redirect: "manual", credentials: "omit", cache: "no-store" });
      const headers = new Headers(init?.headers); expect(headers.has("authorization")).toBe(false); expect(headers.has("cookie")).toBe(false);
    }
    const headers = new Headers(h.fetch.mock.calls[2][1]?.headers);
    expect(headers.get("webhook-signature")).toBe(`v1,${createHmac("sha256", key).update(`${headers.get("webhook-id")}.${headers.get("webhook-timestamp")}.{}`).digest("base64")}`);
    expect(h.db.query.mock.calls[0][0]).toBe("begin transaction isolation level repeatable read read only");
    expect(h.db.query.mock.calls.at(-1)?.[0]).toBe("rollback");
    for (const [sql] of h.db.query.mock.calls.slice(1, -1)) {
      expect(sql.trim()).toMatch(/^select /); expect(sql).not.toMatch(/\b(insert|update|delete|commit|email_auth_context|email_transport\s*\()\b/i);
    }
    expect(JSON.stringify(h.log.mock.calls)).not.toContain(marker); expect(JSON.stringify(h.log.mock.calls)).not.toContain(key.toString("base64"));
  });

  it("reports signature mismatch but still collects fixed read-only counts", async () => {
    const h = harness(); h.fetch.mockReset().mockResolvedValueOnce(healthy()).mockResolvedValue(new Response(null, { status: 401 }));
    expect(await diagnoseAuthMail(env, h)).toBe(false); expect(h.database).toHaveBeenCalledOnce(); expect(h.log).toHaveBeenCalledWith("probe_signed: 401");
  });

  it("never relays database errors and always rolls back/closes", async () => {
    const h = harness(); h.db.query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error(marker));
    await expect(diagnoseAuthMail(env, h)).rejects.toThrow("tijdens database");
    expect(h.db.query).toHaveBeenLastCalledWith("rollback"); expect(h.db.end).toHaveBeenCalledOnce(); expect(JSON.stringify(h.log.mock.calls)).not.toContain(marker);
  });

  it("rejects unexpected fields and unsafe labels before logging result rows", async () => {
    const h = harness(); h.db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ window_minutes: 60, state: "done", count: "1", recipient: marker }] });
    await expect(diagnoseAuthMail(env, h)).rejects.toThrow("database"); expect(JSON.stringify(h.log.mock.calls)).not.toContain(marker);
  });

  it("prints only validated counts and removes raw network failures", async () => {
    const h = harness(); h.fetch.mockReset().mockResolvedValueOnce(healthy()).mockRejectedValue(new Error(marker));
    h.db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ window_minutes: 60, state: "done", count: "2" }] });
    expect(await diagnoseAuthMail(env, h)).toBe(false);
    expect(h.log).toHaveBeenCalledWith('hook_receipts: [{"window_minutes":60,"state":"done","count":2}]');
    expect(h.log).toHaveBeenCalledWith("probe_signed: transport_failure");
    expect(JSON.stringify(h.log.mock.calls)).not.toContain(marker);
  });
});

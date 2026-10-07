import { describe, expect, it, vi } from "vitest";
import { configureProductionMerchant } from "./production-merchant";
import { productionRuntimeFixture } from "../../tests/fixtures/production-env";

const tenantId = "00000000-0000-4000-8000-000000000001", profileId = "pfl_FICTITIOUS";
function fixture(operation = "inspect", existing?: Record<string, unknown>) {
  const env = { ...productionRuntimeFixture(), GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/production", RELEASE_SHA: "a".repeat(40), TARGET_TENANT_SLUG: "example-tenant", MERCHANT_OPERATION: operation, CONFIRMED_MOLLIE_PROFILE_ID: profileId };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    void values;
    return { rows: sql.startsWith("select id") ? [{ id: tenantId }] : sql.startsWith("insert") ? [{ tenant_id: tenantId }] : sql.includes("select mode") && existing ? [existing] : [] };
  });
  const end = vi.fn(async () => {}), log = vi.fn();
  const connect = vi.fn(async () => ({ query, end }));
  const fetcher = vi.fn(async (url: string | RequestInfo | URL, options?: RequestInit) => {
    void options;
    return String(url).includes("api.mollie.com") ? Response.json({ id: profileId }) : Response.json({ status: "ok", environment: "production", release: env.RELEASE_SHA, database: "ready", scanner: "ready" });
  });
  return { env, query, end, log, connect, fetcher, dependencies: { fetcher, connect, log } };
}
describe("explicit live tenant merchant configuration without payments", () => {
  it("inspects only the requested active tenant in a read-only transaction after provider and release checks", async () => {
    const f = fixture(); await configureProductionMerchant(f.env, f.dependencies);
    expect(f.query.mock.calls[0][0]).toBe("begin read only");
    expect(f.query.mock.calls.some(([sql]) => /insert|update|delete/i.test(sql))).toBe(false);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining("where slug=$1 and status='active'"), [f.env.TARGET_TENANT_SLUG]);
    expect(f.end).toHaveBeenCalledOnce();
    for (const [url, options] of f.fetcher.mock.calls) { expect(options?.redirect).toBe("error"); expect(options?.method).toBeUndefined(); expect(String(url)).not.toContain("/payments"); }
    expect(JSON.stringify(f.log.mock.calls)).not.toContain(f.env.MOLLIE_API_KEY);
    expect(JSON.stringify(f.log.mock.calls)).not.toContain(profileId);
  });
  it("binds only the exact authenticated and operator-confirmed profile with tenant-scoped parameters", async () => {
    const f = fixture("bind"); await configureProductionMerchant(f.env, f.dependencies);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"), [`production-merchant:${tenantId}`]);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining("insert into public.tenant_provider_connections"), [tenantId, profileId]);
    const write = f.query.mock.calls.find(([sql]) => sql.startsWith("insert"))![0];
    expect(write).toContain("'live','MOLLIE_API_KEY'"); expect(write).toContain("on conflict(tenant_id,provider)");
    expect(write).toContain("tenant_provider_connections.public_config->>'profile_id'=$2 returning tenant_id");
    expect(f.query).toHaveBeenCalledWith("commit");
  });
  it("repeated binding preserves the confirmed payee and creates no duplicate connection", async () => {
    const f = fixture("bind", { mode: "live", secret_reference: "MOLLIE_API_KEY", profile: profileId, active: true, verified_at: "FICTITIOUS timestamp" });
    await configureProductionMerchant(f.env, f.dependencies);
    expect(f.query.mock.calls.filter(([sql]) => sql.startsWith("insert"))).toHaveLength(1);
    expect(f.query.mock.calls.find(([sql]) => sql.startsWith("insert"))![0]).not.toContain("public_config=excluded");
  });
  it.each([
    { GITHUB_REF: "refs/heads/staging" }, { DEPLOY_TARGET: "staging" }, { TARGET_TENANT_SLUG: "other.domain" },
    { CONFIRMED_MOLLIE_PROFILE_ID: "" }, { MOLLIE_API_KEY: "test_FICTITIOUS" }, { MERCHANT_OPERATION: "repair" },
    { EXPECTED_SUPABASE_PROJECT_REF: "bbbbbbbbbbbbbbbbbbbb", SUPABASE_URL: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co" },
  ])("rejects unconfirmed or cross-environment commands before any network/database action: %o", async patch => {
    const f = fixture("bind"); await expect(configureProductionMerchant({ ...f.env, ...patch }, f.dependencies)).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled();
  });
  it("refuses a stale/unhealthy release before contacting Mollie", async () => {
    const f = fixture("bind"); f.fetcher.mockResolvedValueOnce(Response.json({ status: "ok", environment: "staging", release: f.env.RELEASE_SHA }));
    await expect(configureProductionMerchant(f.env, f.dependencies)).rejects.toThrow("productierelease");
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.connect).not.toHaveBeenCalled();
  });
  it("refuses another authenticated profile before opening a database connection", async () => {
    const f = fixture("bind"); f.env.CONFIRMED_MOLLIE_PROFILE_ID = "pfl_Other";
    await expect(configureProductionMerchant(f.env, f.dependencies)).rejects.toThrow("operatorbevestiging");
    expect(f.connect).not.toHaveBeenCalled();
  });
  it.each([{ profile: "pfl_Other", mode: "live", secret_reference: "MOLLIE_API_KEY" }, { profile: profileId, mode: "test", secret_reference: "MOLLIE_API_KEY" }])("never replaces an existing different merchant: %o", async existing => {
    const f = fixture("bind", existing); await expect(configureProductionMerchant(f.env, f.dependencies)).rejects.toThrow("vervanging");
    expect(f.query).toHaveBeenCalledWith("rollback"); expect(f.end).toHaveBeenCalledOnce();
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith("insert"))).toBe(false);
  });
  it("rolls back an inactive/missing tenant or rejected unique profile allocation", async () => {
    const f = fixture("bind"); f.query.mockImplementation(async (sql: string) => { if (sql.startsWith("select id")) return { rows: [] }; return { rows: [] }; });
    await expect(configureProductionMerchant(f.env, f.dependencies)).rejects.toThrow("tenant");
    expect(f.query).toHaveBeenCalledWith("rollback"); expect(f.query.mock.calls.some(([sql]) => sql.startsWith("insert"))).toBe(false);
    const duplicate = fixture("bind"); duplicate.query.mockImplementation(async (sql: string) => { if (sql.startsWith("insert")) throw new Error("FICTITIOUS unique conflict"); return { rows: sql.startsWith("select id") ? [{ id: tenantId }] : [] }; });
    await expect(configureProductionMerchant(duplicate.env, duplicate.dependencies)).rejects.toThrow("unique");
    expect(duplicate.query).toHaveBeenCalledWith("rollback"); expect(duplicate.query).not.toHaveBeenCalledWith("commit");
  });
  it("refuses activation when another configuration was inserted after the initial inspection", async () => {
    const f = fixture("bind");
    f.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith("select id") ? [{ id: tenantId }] : [] }));
    await expect(configureProductionMerchant(f.env, f.dependencies)).rejects.toThrow("tijdens controle gewijzigd");
    expect(f.query).toHaveBeenCalledWith("rollback");
    expect(f.query).not.toHaveBeenCalledWith("commit");
    expect(f.log).not.toHaveBeenCalled();
  });
});

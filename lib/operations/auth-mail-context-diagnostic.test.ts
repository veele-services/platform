import { describe, expect, it, vi } from "vitest";
import { diagnoseAuthMailContext } from "./auth-mail-context-diagnostic";

const marker = "PRIVATE-FICTITIOUS-SERVICE-KEY-2026";
const ref = "abcdefghijklmnopqrst";
const env = {
  GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/staging", DEPLOY_TARGET: "staging", APP_ENV: "development",
  APP_URL: "https://staging.fieldgrid.nl", EXPECTED_SUPABASE_PROJECT_REF: ref,
  FORBIDDEN_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw", SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: marker,
};
const context = { tenant_id: null, company: "Fieldgrid", primary: "#222C35", accent: "#41AC42", logo: false };
function harness(response = Response.json(context)) {
  return { fetch: vi.fn<typeof fetch>().mockResolvedValue(response), log: vi.fn() };
}
function report(h: ReturnType<typeof harness>) {
  return JSON.parse(h.log.mock.calls.at(-1)![0].replace(/^context_probe: /, ""));
}

describe("read-only staging Auth-mail context probe", () => {
  it.each([
    { GITHUB_ACTIONS: "false" }, { GITHUB_REF: "refs/heads/main" }, { GITHUB_REF: "refs/pull/1/merge" },
    { APP_URL: "https://evil.invalid" }, { DEPLOY_TARGET: "production" }, { APP_ENV: "production" },
    { EXPECTED_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw" }, { FORBIDDEN_SUPABASE_PROJECT_REF: "" },
    { SUPABASE_URL: "https://ckdtiuemeygrnujjibnw.supabase.co" },
    { SUPABASE_URL: `${env.SUPABASE_URL}.evil.invalid` }, { SUPABASE_URL: `${env.SUPABASE_URL}/?redirect=evil.invalid` },
    { SUPABASE_URL: `https://user:${marker}@${ref}.supabase.co` },
    { SUPABASE_SERVICE_ROLE_KEY: "" }, { SUPABASE_SERVICE_ROLE_KEY: `${marker}\nInjected` },
  ])("rejects unsafe configuration before any network request", async changed => {
    const h = harness();
    expect(await diagnoseAuthMailContext({ ...env, ...changed }, h)).toBe(false);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(report(h)).toEqual({ outcome: "configuration_rejected", http_status: null, valid_platform_schema: false });
    expect(JSON.stringify(h.log.mock.calls)).not.toContain(marker);
  });

  it("calls only the fixed platform context RPC with fictitious identity and never Auth or a send endpoint", async () => {
    const h = harness();
    expect(await diagnoseAuthMailContext(env, h)).toBe(true);
    expect(h.fetch).toHaveBeenCalledOnce();
    const [url, init] = h.fetch.mock.calls[0];
    expect(url).toBe(`https://${ref}.supabase.co/rest/v1/rpc/email_auth_context`);
    expect(init).toMatchObject({ method: "POST", redirect: "manual", credentials: "omit", cache: "no-store" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init!.body as string)).toEqual({
      target_slug: null, actor: "00000000-0000-4000-8000-000000000001",
      recipient: "fieldgrid-context-probe@example.invalid", action_type: "magiclink",
    });
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${marker}`);
    expect(headers.get("apikey")).toBe(marker);
    expect(headers.has("cookie")).toBe(false);
    expect(report(h)).toEqual({ outcome: "valid_platform_context", http_status: 200, valid_platform_schema: true });
    expect(JSON.stringify(h.log.mock.calls)).not.toMatch(/PRIVATE|recipient|Fieldgrid|supabase\.co/);
  });

  it.each([401, 403, 404, 429, 503, 302, 418])("reports only allowlisted status for HTTP %s without reading its body or following redirects", async status => {
    const response = new Response(marker, { status, headers: { location: `https://evil.invalid/${marker}` } });
    const json = vi.spyOn(response, "json"), h = harness(response);
    expect(await diagnoseAuthMailContext(env, h)).toBe(false);
    expect(h.fetch).toHaveBeenCalledOnce(); expect(json).not.toHaveBeenCalled();
    expect(report(h)).toEqual({ outcome: "rpc_http_error", http_status: [302, 418].includes(status) ? "other" : status, valid_platform_schema: false });
    expect(JSON.stringify(h.log.mock.calls)).not.toContain(marker);
  });

  it.each([
    () => Response.json({ ...context, company: marker }),
    () => Response.json({ ...context, tenant_id: "10000000-0000-4000-8000-000000000001" }),
    () => Response.json({ ...context, recipient: marker }),
    () => new Response(marker, { headers: { "content-type": "application/json" } }),
    () => new Response(marker),
  ])("rejects invalid or unexpected response data without relaying it", async response => {
    const h = harness(response());
    expect(await diagnoseAuthMailContext(env, h)).toBe(false);
    expect(report(h)).toEqual({ outcome: "invalid_platform_response", http_status: 200, valid_platform_schema: false });
    expect(JSON.stringify(h.log.mock.calls)).not.toContain(marker);
  });

  it("suppresses network errors including credentials and URLs", async () => {
    const h = harness();h.fetch.mockRejectedValue(new Error(`${marker} ${env.SUPABASE_URL}`));
    expect(await diagnoseAuthMailContext(env, h)).toBe(false);
    expect(report(h)).toEqual({ outcome: "transport_failure", http_status: null, valid_platform_schema: false });
    expect(JSON.stringify(h.log.mock.calls)).not.toContain(marker);
  });
});

import { z } from "zod";
import { assertStagingProject } from "../env/staging-database";

type Environment = Record<string, string | undefined>;
type Dependencies = { fetch: typeof fetch; log(line: string): void };

const platformContext = z.object({
  tenant_id: z.null(), company: z.literal("Fieldgrid"),
  primary: z.literal("#222C35"), accent: z.literal("#41AC42"), logo: z.literal(false),
}).strict();
const safeStatuses = new Set([200, 400, 401, 403, 404, 405, 409, 429, 500, 502, 503, 504]);

// This exact platform branch returns fixed branding without looking up a user,
// claiming a receipt, modifying data, invoking Auth or sending any mail.
const requestBody = JSON.stringify({
  target_slug: null,
  actor: "00000000-0000-4000-8000-000000000001",
  recipient: "fieldgrid-context-probe@example.invalid",
  action_type: "magiclink",
});

export async function diagnoseAuthMailContext(env: Environment, dependencies: Dependencies): Promise<boolean> {
  const report = (outcome: "configuration_rejected" | "transport_failure" | "rpc_http_error" | "invalid_platform_response" | "valid_platform_context", status: number | null, valid: boolean) => {
    dependencies.log(`context_probe: ${JSON.stringify({
      outcome, http_status: status === null ? null : safeStatuses.has(status) ? status : "other",
      valid_platform_schema: valid,
    })}`);
    return valid;
  };
  let endpoint: string, key: string;
  try {
    if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REF !== "refs/heads/staging" || env.APP_URL !== "https://staging.fieldgrid.nl") throw new Error();
    const project = assertStagingProject(env);
    key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (key.length < 20 || /[\r\n]/.test(key)) throw new Error();
    endpoint = `https://${project}.supabase.co/rest/v1/rpc/email_auth_context`;
  } catch {
    return report("configuration_rejected", null, false);
  }

  let response: Response;
  try {
    response = await dependencies.fetch(endpoint, {
      method: "POST", body: requestBody, redirect: "manual", credentials: "omit", cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json", apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return report("transport_failure", null, false);
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined);
    return report("rpc_http_error", response.status, false);
  }
  if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
    await response.body?.cancel().catch(() => undefined);
    return report("invalid_platform_response", response.status, false);
  }
  try {
    // Never expose either successful response fields or PostgREST error bodies.
    const valid = platformContext.safeParse(await response.json()).success;
    return report(valid ? "valid_platform_context" : "invalid_platform_response", response.status, valid);
  } catch {
    return report("invalid_platform_response", response.status, false);
  }
}

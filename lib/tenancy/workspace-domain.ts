/** Workspace domains never share the email-sender domain trust table. */
export type WorkspaceDomain = { id: string; host: string; environment: string; status: "pending" | "verified" | "active"; verificationToken: string; verifiedAt: string | null };
const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const domainPattern = new RegExp(`^${label}(?:\\.${label})+$`);
export function normalizeWorkspaceHostname(value: string): string {
  const host = value.trim().toLowerCase();
  if (host.length > 253 || !domainPattern.test(host) || /^[\d.]+$/.test(host)
    || /(^|\.)(fieldgrid\.nl|localhost)$/.test(host)) throw new Error("Gebruik een eigen domeinnaam zonder protocol, pad of poort.");
  return host;
}
export function workspaceDnsRecords(host: string, token: string, canonicalHost: string) {
  return [
    { type: "CNAME", name: host, value: canonicalHost },
    { type: "TXT", name: `_fieldgrid.${host}`, value: `fieldgrid-verification=${token}` },
  ] as const;
}
export function workspaceDnsMatches(txt: string[][], cnames: string[], token: string, canonicalHost: string): boolean {
  return txt.some(parts => parts.join("") === `fieldgrid-verification=${token}`)
    && cnames.some(name => name.toLowerCase().replace(/\.$/, "") === canonicalHost.toLowerCase());
}
export async function resolveCustomWorkspaceHost(host: string | null, environment: string): Promise<{ slug: string | null; unavailable: boolean }> {
  if (!host || !["staging", "production"].includes(environment)) return { slug: null, unavailable: false };
  try { if (normalizeWorkspaceHostname(host) !== host) return { slug: null, unavailable: false }; }
  catch { return { slug: null, unavailable: false }; }
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/resolve_workspace_hostname`, {
      method: "POST", headers: { "content-type": "application/json", apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ requested_host: host, requested_environment: environment }), cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { slug: null, unavailable: true };
    const slug: unknown = await response.json();
    return { slug: typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null, unavailable: false };
  } catch { return { slug: null, unavailable: true }; }
}

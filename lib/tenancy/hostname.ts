export const TENANT_SLUG_HEADER = "x-fieldgrid-tenant-slug";
export const HOST_KIND_HEADER = "x-fieldgrid-host-kind";

export type HostContext =
  | { kind: "platform"; hostname: string }
  | { kind: "tenant"; hostname: string; slug: string }
  | { kind: "invalid"; hostname: string | null };

const tenantSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeHostname(value: string | null): string | null {
  if (!value || value.includes(",")) return null;
  try {
    return new URL(`http://${value.trim().toLowerCase()}`).hostname;
  } catch {
    return null;
  }
}

export function resolveHostContext(rawHost: string | null, appUrl: string, deployTarget: string): HostContext {
  const hostname = normalizeHostname(rawHost);
  if (!hostname) return { kind: "invalid", hostname: null };

  const platformHostname = new URL(appUrl).hostname.toLowerCase();
  if (hostname === platformHostname) return { kind: "platform", hostname };

  if (deployTarget === "local" && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return { kind: "platform", hostname };
  }

  const suffix = deployTarget === "local" && hostname.endsWith(".localhost") ? ".localhost" : `.${platformHostname}`;
  if (!hostname.endsWith(suffix)) return { kind: "invalid", hostname };

  const slug = hostname.slice(0, -suffix.length);
  if (!tenantSlugPattern.test(slug)) return { kind: "invalid", hostname };
  return { kind: "tenant", hostname, slug };
}

export function tenantAppUrl(slug: string, pathname = "/app"): string {
  if (!tenantSlugPattern.test(slug)) throw new Error("Ongeldige tenantslug");
  const appUrl = new URL(process.env.APP_URL!);
  if ((process.env.DEPLOY_TARGET ?? "local") !== "local") appUrl.hostname = `${slug}.${appUrl.hostname}`;
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("\\")) throw new Error("Ongeldig tenantpad");
  const target = new URL(pathname, appUrl);
  if (target.origin !== appUrl.origin) throw new Error("Ongeldig tenantpad");
  return target.toString();
}

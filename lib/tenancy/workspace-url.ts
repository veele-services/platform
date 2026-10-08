import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeWorkspaceHostname } from "./workspace-domain";
import { tenantAppUrl } from "./hostname";

/** Canonical links remain valid. Only an active host in this deployment can be preferred. */
export async function tenantWorkspaceUrl(tenantId: string, slug: string, pathname = "/app"): Promise<string> {
  const canonical = new URL(tenantAppUrl(slug, pathname));
  const environment = process.env.DEPLOY_TARGET ?? "local";
  if (!["staging", "production"].includes(environment)) return canonical.toString();
  const admin = createAdminClient();
  const { data, error } = await admin.from("tenant_workspace_domains").select("host").eq("tenant_id", tenantId).eq("environment", environment).eq("status", "active").maybeSingle();
  if (error || !data) return canonical.toString();
  try { canonical.hostname = normalizeWorkspaceHostname(data.host); } catch { return canonical.toString(); }
  return canonical.toString();
}

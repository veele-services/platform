"use server";
import { resolveCname, resolveTxt } from "node:dns/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/platform/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantAppUrl } from "@/lib/tenancy/hostname";
import { normalizeWorkspaceHostname, workspaceDnsMatches } from "@/lib/tenancy/workspace-domain";

const inputSchema = z.object({ tenantId: z.string().uuid(), id: z.string().uuid().optional(), host: z.string().max(253).optional(), operation: z.enum(["register", "verify", "activate", "remove"]) });
export async function managePlatformWorkspaceDomain(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const context = await requirePlatformAdmin();
    const data = inputSchema.parse(input);
    const environment = process.env.DEPLOY_TARGET;
    if (environment !== "production" && environment !== "staging") throw new Error("Domeinkoppelingen zijn alleen beschikbaar op staging en productie.");
    const admin = createAdminClient();
    const command: Record<string, string> = { environment };
    if (data.operation === "register") command.host = normalizeWorkspaceHostname(data.host ?? "");
    else {
      if (!data.id) throw new Error("Selecteer een domein.");
      command.id = data.id;
      const { data: domain, error } = await admin.from("tenant_workspace_domains").select("host,verification_token").eq("id", data.id).eq("tenant_id", data.tenantId).eq("environment", environment).single();
      if (error || !domain) throw new Error("Domein niet gevonden.");
      normalizeWorkspaceHostname(domain.host);
      if (data.operation === "verify" || data.operation === "activate") {
        const { data: tenant, error: tenantError } = await admin.from("tenants").select("slug,status").eq("id", data.tenantId).single();
        if (tenantError || !tenant || tenant.status !== "active") throw new Error("Actieve tenant vereist.");
        const canonicalHost = new URL(tenantAppUrl(tenant.slug)).hostname;
        let txt: string[][], cnames: string[];
        try { [txt, cnames] = await Promise.all([resolveTxt(`_fieldgrid.${domain.host}`), resolveCname(domain.host)]); }
        catch { throw new Error("DNS-records zijn nog niet beschikbaar. Controleer TXT en CNAME; gebruik de CNAME zonder DNS-proxy tijdens verificatie."); }
        if (!workspaceDnsMatches(txt, cnames, domain.verification_token, canonicalHost)) throw new Error("TXT-verificatie of CNAME naar deze tenant ontbreekt. Controleer de weergegeven records.");
        command.verificationToken = domain.verification_token;
      }
    }
    // DNS I/O can outlive a revoked browser session. Check the authenticated
    // platform account again before the privileged command.
    if (data.operation === "verify" || data.operation === "activate") {
      const live = await requirePlatformAdmin();
      if (live.user.id !== context.user.id) throw new Error("Je toegang is gewijzigd. Log opnieuw in.");
    }
    const { error } = await admin.rpc("platform_workspace_domain_command", { target_tenant: data.tenantId, actor_user_id: context.user.id, operation: data.operation, input: command });
    if (error) throw new Error(error.code === "23505" ? "Dit domein is al gekoppeld. Verwijder de bestaande koppeling eerst." : error.message);
    revalidatePath("/platform");
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Domeinkoppeling kon niet worden opgeslagen." }; }
}

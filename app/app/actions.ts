"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantAppUrl } from "@/lib/tenancy/hostname";

export type ProvisionState = { error?: string };

const provisionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export async function provisionTenant(_: ProvisionState, formData: FormData): Promise<ProvisionState> {
  const context = await getAuthContext();
  if (!context.isPlatformAdmin) return { error: "Alleen Fieldgrid-platformbeheer kan een tenant aanmaken." };
  const parsed = provisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Gebruik een geldige naam en een slug met kleine letters, cijfers of streepjes." };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("provision_tenant", {
    tenant_name: parsed.data.name,
    tenant_slug: parsed.data.slug,
    owner_user_id: context.user.id,
    actor_user_id: context.user.id,
  });
  if (error || !data) return { error: error?.message ?? "De tenant kon niet worden aangemaakt." };
  if ((process.env.DEPLOY_TARGET ?? "local") === "local") {
    const cookieStore = await cookies();
    cookieStore.set("fieldgrid_tenant_id", data, { httpOnly: true, sameSite: "lax", secure: process.env.APP_URL?.startsWith("https://") ?? false, path: "/" });
    redirect("/app");
  }
  redirect(tenantAppUrl(parsed.data.slug));
}

export async function switchTenant(formData: FormData) {
  const context = await getAuthContext();
  const tenantId = z.string().uuid().parse(formData.get("tenantId"));
  const membership = context.memberships.find((candidate) => candidate.tenantId === tenantId);
  if (!membership) throw new Error("Geen toegang tot deze tenant");
  if ((process.env.DEPLOY_TARGET ?? "local") === "local") {
    const cookieStore = await cookies();
    cookieStore.set("fieldgrid_tenant_id", tenantId, { httpOnly: true, sameSite: "lax", secure: process.env.APP_URL?.startsWith("https://") ?? false, path: "/" });
    redirect("/app");
  }
  redirect(tenantAppUrl(membership.tenantSlug));
}

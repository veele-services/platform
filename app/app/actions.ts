"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { tenantAppUrl } from "@/lib/tenancy/hostname";

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

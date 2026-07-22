"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  BACKOFFICE_TENANT_COOKIE,
  getCurrentBackofficeUser,
  userHasActiveTenant,
} from "@/lib/auth/tenant";
import { withHostOnlyCookieOptions } from "@/lib/supabase/session-cookies";
import { BACKOFFICE_BASE_PATH } from "@/lib/backoffice-paths";

const switchTenantSchema = z.object({
  tenantId: z.string().uuid(),
});

export async function switchBackofficeTenant(formData: FormData) {
  const parsed = switchTenantSchema.safeParse({
    tenantId: formData.get("tenantId"),
  });

  if (!parsed.success) {
    throw new Error("Ongeldige tenantselectie.");
  }

  const user = await getCurrentBackofficeUser();
  if (!user) {
    throw new Error("Niet geauthenticeerd.");
  }

  const allowed = await userHasActiveTenant(user.id, parsed.data.tenantId);
  if (!allowed) {
    throw new Error("Deze tenant is niet gekoppeld aan de huidige gebruiker.");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    BACKOFFICE_TENANT_COOKIE,
    parsed.data.tenantId,
    withHostOnlyCookieOptions({
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: BACKOFFICE_BASE_PATH,
      maxAge: 60 * 60 * 24 * 365,
    }),
  );

  revalidatePath("/", "layout");
}

"use server";

import { auditLogTable, db } from "@workspace/db";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth/tenant";
import {
  BACKOFFICE_PROFILE_NAME_REQUIRED,
  validateBackofficeProfileName,
} from "@/lib/auth/backoffice-profile";

export type BackofficeProfileActionState = {
  success: boolean;
  message: string | null;
  name?: string;
};

export async function updateOwnBackofficeProfile(
  _previousState: BackofficeProfileActionState,
  formData: FormData,
): Promise<BackofficeProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    return { success: false, message: "Geen actieve backofficekoppeling gevonden." };
  }

  const validatedName = validateBackofficeProfileName(formData.get("fullName"), user.email);
  if (!validatedName.success) {
    return { success: false, message: validatedName.message };
  }

  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin.auth.admin.getUserById(user.id);
  if (currentError || !current.user) {
    return { success: false, message: "Uw profiel kon niet veilig worden opgehaald." };
  }

  const appMetadata: Record<string, unknown> = { ...(current.user.app_metadata ?? {}) };
  delete appMetadata[BACKOFFICE_PROFILE_NAME_REQUIRED];

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: appMetadata,
    user_metadata: {
      ...(current.user.user_metadata ?? {}),
      full_name: validatedName.name,
      name: validatedName.name,
    },
  });
  if (updateError) {
    return { success: false, message: "Naam opslaan mislukt. Probeer het opnieuw." };
  }

  try {
    await db.insert(auditLogTable).values({
      userId: user.id,
      action: "update_own_profile",
      resource: "auth_profile",
      resourceId: user.id,
      metadata: { tenantId, fields: ["full_name"] },
    });
  } catch (error) {
    console.error("[audit_log] Backoffice profile update could not be recorded:", error);
  }

  revalidatePath("/", "layout");
  revalidatePath("/profile");
  revalidatePath("/instellingen/gebruikers");
  return { success: true, message: "Naam opgeslagen.", name: validatedName.name };
}

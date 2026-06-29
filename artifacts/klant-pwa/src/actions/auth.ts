"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluatePasswordStrength, mediumPasswordMessage } from "@/lib/password-strength";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/klant/login");
}

export async function completePasswordReset(
  _prev: { success?: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  const password    = String(formData.get("password") ?? "");
  const passwordTwo = String(formData.get("passwordTwo") ?? "");

  if (!password || !evaluatePasswordStrength(password).isMedium) {
    return { error: mediumPasswordMessage() };
  }
  if (password !== passwordTwo) {
    return { error: "Wachtwoorden komen niet overeen" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sessie verlopen. Log opnieuw in met het tijdelijke wachtwoord." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error: error.message.includes("same password")
        ? "Het nieuwe wachtwoord mag niet gelijk zijn aan het huidige wachtwoord."
        : "Wachtwoord opslaan mislukt. Vraag zo nodig een nieuw tijdelijk wachtwoord aan.",
    };
  }

  if (user.app_metadata?.force_password_change === true) {
    try {
      const admin = createAdminClient();
      const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: {
          ...(user.app_metadata ?? {}),
          force_password_change: false,
          password_changed_at: new Date().toISOString(),
        },
      });
      if (metadataError) throw metadataError;
    } catch {
      return { error: "Wachtwoord opgeslagen, maar de eerste-login status kon niet worden afgerond. Neem contact op met Veele Services." };
    }
  }

  await supabase.auth.signOut();
  return { success: true };
}

export async function changeMyPassword(
  _prev: { success?: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  const password    = String(formData.get("password") ?? "");
  const passwordTwo = String(formData.get("passwordTwo") ?? "");

  if (!password || !evaluatePasswordStrength(password).isMedium) {
    return { error: mediumPasswordMessage() };
  }
  if (password !== passwordTwo) {
    return { error: "Wachtwoorden komen niet overeen" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error: error.message.includes("same password")
        ? "Het nieuwe wachtwoord mag niet gelijk zijn aan het huidige wachtwoord."
        : "Wachtwoord opslaan mislukt.",
    };
  }

  return { success: true };
}

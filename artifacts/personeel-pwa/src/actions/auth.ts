"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluatePasswordStrength, mediumPasswordMessage } from "@/lib/password-strength";

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=Ongeldige+inloggegevens");
  }

  if (data.user?.app_metadata?.force_password_change === true) {
    redirect("/reset-wachtwoord?force=1");
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function changeMyPassword(
  _prev: { success?: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  const password    = (formData.get("password") as string ?? "").trim();
  const passwordTwo = (formData.get("passwordTwo") as string ?? "").trim();

  if (!password || !evaluatePasswordStrength(password).isMedium) {
    return { error: mediumPasswordMessage() };
  }
  if (password !== passwordTwo) {
    return { error: "Wachtwoorden komen niet overeen" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "Wachtwoord wijzigen mislukt. Probeer opnieuw in te loggen en het nogmaals te proberen." };
  }

  revalidatePath("/beveiliging");
  return { success: true };
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
      return { error: "Wachtwoord opgeslagen, maar de eerste-login status kon niet worden afgerond. Neem contact op met de beheerder." };
    }
  }

  await supabase.auth.signOut();
  return { success: true };
}

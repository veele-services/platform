"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=Ongeldige+inloggegevens");
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

  if (!password || password.length < 8) {
    return { error: "Nieuw wachtwoord moet minimaal 8 tekens bevatten" };
  }
  if (password !== passwordTwo) {
    return { error: "Wachtwoorden komen niet overeen" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "Wachtwoord wijzigen mislukt. Probeer opnieuw in te loggen en het nogmaals te proberen." };
  }

  revalidatePath("/profiel");
  return { success: true };
}

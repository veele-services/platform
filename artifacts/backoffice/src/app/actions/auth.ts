"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/auth/permissions";

export type AuthFormState = {
  error: string | null;
};

/**
 * Server Action — sign in with email + password.
 * Compatible with React 19 useActionState.
 */
export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email    = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    // Normalise Supabase error messages for the UI.
    const message =
      error?.message === "Invalid login credentials"
        ? "Incorrect email or password. Please try again."
        : (error?.message ?? "An unexpected error occurred. Please try again.");
    return { error: message };
  }

  // Audit trail — fire-and-forget, never blocks sign-in.
  await writeAuditLog({
    userId:     data.user.id,
    action:     "login",
    resource:   "auth",
    resourceId: data.user.id,
    metadata:   { email: data.user.email },
  });

  redirect("/");
}

/**
 * Server Action — sign out the current user.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    await writeAuditLog({
      userId:     user.id,
      action:     "logout",
      resource:   "auth",
      resourceId: user.id,
      metadata:   { email: user.email },
    });
  }

  await supabase.auth.signOut();
  redirect("/login");
}

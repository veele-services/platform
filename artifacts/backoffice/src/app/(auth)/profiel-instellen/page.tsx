import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackofficeNameForm } from "@/components/profile/BackofficeNameForm";
import { signOut } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getBackofficeProfileName,
  requiresBackofficeProfileName,
} from "@/lib/auth/backoffice-profile";
import { BACKOFFICE_BASE_PATH, backofficePath } from "@/lib/backoffice-paths";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Profiel afronden" };

export default async function BackofficeProfileOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    redirect(
      `${backofficePath("/login")}?next=${encodeURIComponent(backofficePath("/profiel-instellen"))}`,
    );
  if (!requiresBackofficeProfileName(user)) redirect(BACKOFFICE_BASE_PATH);

  return (
    <main className="w-full max-w-md rounded-[var(--radius-panel)] border border-border bg-card p-5 shadow-lg sm:p-8">
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          Fieldgrid backoffice
        </p>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-foreground">
          Maak uw profiel compleet
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Vul eerst uw naam in voordat u verdergaat naar de backoffice. Uw
          e-mailadres blijft ongewijzigd.
        </p>
        <p className="mt-2 truncate rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground">
          {user.email}
        </p>
      </div>

      <BackofficeNameForm
        initialName={getBackofficeProfileName(user) ?? ""}
        onboarding
      />

      <form action={signOut} className="mt-5 border-t border-slate-100 pt-4">
        <Button
          type="submit"
          variant="ghost"
          className="px-0 text-muted-foreground"
        >
          Uitloggen
        </Button>
      </form>
    </main>
  );
}

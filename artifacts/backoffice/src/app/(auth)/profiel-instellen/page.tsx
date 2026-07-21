import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackofficeNameForm } from "@/components/profile/BackofficeNameForm";
import { signOut } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getBackofficeProfileName,
  requiresBackofficeProfileName,
} from "@/lib/auth/backoffice-profile";

export const metadata: Metadata = { title: "Profiel afronden" };

export default async function BackofficeProfileOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/profiel-instellen");
  if (!requiresBackofficeProfileName(user)) redirect("/");

  return (
    <main className="mx-4 w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-xl">
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#00A8A4]">Fieldgrid backoffice</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-[#081D3A]">Maak uw profiel compleet</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Vul eerst uw naam in voordat u verdergaat naar de backoffice. Uw e-mailadres blijft ongewijzigd.
        </p>
        <p className="mt-2 truncate rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
          {user.email}
        </p>
      </div>

      <BackofficeNameForm initialName={getBackofficeProfileName(user) ?? ""} onboarding />

      <form action={signOut} className="mt-5 border-t border-slate-100 pt-4">
        <button type="submit" className="text-sm font-medium text-slate-500 hover:text-slate-800">
          Uitloggen
        </button>
      </form>
    </main>
  );
}

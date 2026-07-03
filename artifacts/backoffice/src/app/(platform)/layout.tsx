import Link from "next/link";
import { redirect } from "next/navigation";
import { markCurrentPlatformUserSeen } from "@/app/actions/platform";
import { getCurrentPlatformUser } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";

function NoPlatformAccess() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-950">
      <section className="max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-500">Fieldgrid platformbeheer</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">Geen platformtoegang</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Deze gebruiker heeft geen actieve platformrol. Gebruik een platform-admin of supportaccount, of laat een platformbeheerder je account activeren.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Terug naar Fieldgrid
        </Link>
      </section>
    </main>
  );
}

export default async function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/platform");
  }

  const platformUser = await getCurrentPlatformUser();
  if (!platformUser) {
    return <NoPlatformAccess />;
  }

  try {
    await markCurrentPlatformUserSeen();
  } catch (error) {
    console.warn("[platform] last-seen update skipped", error);
  }

  return children;
}

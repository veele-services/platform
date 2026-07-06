import Link from "next/link";
import { redirect } from "next/navigation";
import { markCurrentPlatformUserSeen } from "@/app/actions/platform";
import { dismissPlatformReleaseHighlight, getPlatformReleaseHighlight } from "@/app/actions/releases";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { getCurrentPlatformUser } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";
import type { ReleaseHighlightSummary } from "@workspace/db";

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

function PlatformReleaseHighlightBanner({ highlight }: { highlight: ReleaseHighlightSummary | null }) {
  if (!highlight) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">{highlight.title}</p>
          <p className="mt-0.5 text-xs leading-5 text-amber-900">{highlight.message}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/platform/releases/${highlight.releaseSlug}`}
            className="rounded border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
          >
            Lees meer
          </Link>
          <form action={dismissPlatformReleaseHighlight}>
            <input type="hidden" name="highlightId" value={highlight.id} />
            <button
              type="submit"
              className="rounded border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              Sluiten
            </button>
          </form>
        </div>
      </div>
    </div>
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

  const canReadPlatformReleases = platformUser.role === "owner" || platformUser.role === "admin";
  const releaseHighlight = canReadPlatformReleases ? await getPlatformReleaseHighlight() : null;

  return (
    <PlatformShell userEmail={user.email ?? platformUser.userId} platformRole={platformUser.role}>
      <PlatformReleaseHighlightBanner highlight={releaseHighlight} />
      {children}
    </PlatformShell>
  );
}

import Link from "next/link";

export const metadata = {
  title: "Privacy tijdens onboarding",
};

export default function CustomerOnboardingPrivacyPage() {
  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8">
      <article className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">
          Klantportaal
        </p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">
          Privacy en uw gegevens
        </h1>
        <div className="mt-4 space-y-4 text-sm leading-6 text-slate-700">
          <p>
            Tijdens de onboarding slaan we alleen de organisatie-, contact- en
            meldingsvoorkeuren op die nodig zijn om het klantportaal te
            gebruiken.
          </p>
          <p>
            Conceptgegevens zijn alleen beschikbaar voor bevoegde
            serverprocessen binnen uw organisatie. Na afronding worden de
            gecontroleerde gegevens in het klantprofiel verwerkt.
          </p>
          <p>
            U kunt uw contactgegevens en meldingsvoorkeuren later in het
            klantportaal bekijken en aanpassen. Neem voor verwijdering of
            inzage contact op met uw organisatiebeheerder.
          </p>
        </div>
        <Link
          href="/klant/onboarding"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-black text-white"
        >
          Terug naar onboarding
        </Link>
      </article>
    </main>
  );
}

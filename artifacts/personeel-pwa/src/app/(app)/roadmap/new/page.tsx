import Link from "next/link";
import { ArrowLeft, Lightbulb, Send } from "lucide-react";
import {
  getPersonnelFeatureRequestOptions,
  submitPersonnelFeatureRequest,
} from "@/actions/feature-requests";

export const metadata = {
  title: "Featurewens indienen",
};

async function submitAction(formData: FormData): Promise<void> {
  "use server";
  await submitPersonnelFeatureRequest(formData);
}

export default async function PersonnelFeatureRequestPage() {
  const options = await getPersonnelFeatureRequestOptions();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5 md:px-0">
      <Link href="/meer" className="mb-4 inline-flex items-center gap-2 text-sm font-black text-slate-600">
        <ArrowLeft className="h-4 w-4" />
        Terug
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-cyan-50 p-3 text-cyan-700">
            <Lightbulb className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-700">Roadmap</p>
            <h1 className="mt-1 text-2xl font-black" style={{ color: "var(--color-primary)" }}>Featurewens indienen</h1>
          </div>
        </div>

        <div className="mt-5 grid gap-2 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm text-slate-700">
          <p className="font-black text-slate-950">Statusflow</p>
          <p>Na indienen start je wens als Nieuw. Daarna beoordeelt de backoffice deze als In overweging, In ontwikkeling of Afgerond.</p>
        </div>

        {!options.enabled ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {options.reason ?? "Featurewensen zijn niet beschikbaar."}
          </div>
        ) : (
          <form action={submitAction} className="mt-5 grid gap-4">
            <label className="grid gap-1 text-sm font-black" style={{ color: "var(--color-primary)" }}>
              Titel
              <input name="title" required placeholder="Bijvoorbeeld: Sneller uren controleren" className="h-11 rounded-xl border border-slate-300 px-3 text-sm font-normal text-slate-900" />
            </label>
            <label className="grid gap-1 text-sm font-black" style={{ color: "var(--color-primary)" }}>
              Omschrijving
              <textarea name="description" required rows={6} placeholder="Beschrijf wat u mist en welk werk hierdoor makkelijker wordt." className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal leading-6 text-slate-900" />
            </label>
            <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
              <label className="grid gap-1 text-sm font-black" style={{ color: "var(--color-primary)" }}>
                Prioriteit
                <select name="priority" defaultValue="normal" className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
                  <option value="low">Laag</option>
                  <option value="normal">Normaal</option>
                  <option value="high">Hoog</option>
                  <option value="critical">Kritiek</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-black" style={{ color: "var(--color-primary)" }}>
                Module
                <select name="moduleKeys" multiple className="min-h-32 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900">
                  {options.modules.map((module) => <option key={module.key} value={module.key}>{module.name}</option>)}
                </select>
              </label>
            </div>
            <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-black text-white">
              <Send className="h-4 w-4" />
              Wens indienen
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

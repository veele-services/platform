import Link from "next/link";
import { ArrowLeft, Lightbulb, Send } from "lucide-react";
import {
  listTenantRoadmapEditorOptions,
  submitTenantRoadmapRequest,
} from "@/app/actions/roadmap";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Featurewens indienen",
};

async function submitAction(formData: FormData): Promise<void> {
  "use server";
  await submitTenantRoadmapRequest(formData);
}

export default async function NewRoadmapRequestPage() {
  const options = await listTenantRoadmapEditorOptions();

  return (
    <main className="px-4 py-6 md:px-6">
      <div className="mx-auto grid w-full max-w-[1000px] gap-6">
        <header className="border-b border-slate-200 pb-6">
          <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
            <Link href="/roadmap">
              <ArrowLeft className="h-4 w-4" />
              Terug naar roadmap
            </Link>
          </Button>
          <p className="text-sm font-medium text-slate-500">Roadmap</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">Featurewens indienen</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Beschrijf wat u mist, waarom het belangrijk is en welk proces hiermee beter wordt.
          </p>
        </header>

        <form action={submitAction} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-cyan-700" />
            <h2 className="text-lg font-semibold text-slate-950">Nieuwe wens</h2>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Titel
              <input
                name="title"
                required
                placeholder="Bijvoorbeeld: Sneller meerdere rapportages goedkeuren"
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal"
              />
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Omschrijving
              <textarea
                name="description"
                required
                placeholder="Beschrijf de situatie, gewenste oplossing en impact voor uw team."
                className="min-h-40 rounded-md border border-slate-300 px-3 py-2 text-sm font-normal leading-6"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Prioriteit
                <select name="priority" defaultValue="normal" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal">
                  <option value="low">Laag</option>
                  <option value="normal">Normaal</option>
                  <option value="high">Hoog</option>
                  <option value="critical">Kritiek</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Modules
                <select name="moduleKeys" multiple className="min-h-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                  {options.modules.map((module) => (
                    <option key={module.key} value={module.key}>{module.name}</option>
                  ))}
                </select>
                <span className="text-xs font-normal text-slate-500">Gebruik Ctrl/Cmd om meerdere modules te selecteren.</span>
              </label>
            </div>

            <div className="flex justify-end">
              <Button type="submit" className="gap-2">
                <Send className="h-4 w-4" />
                Wens indienen
              </Button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

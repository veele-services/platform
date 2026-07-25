import { SelectAdapter } from "@/components/ui/select-adapter";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Megaphone, Send } from "lucide-react";
import {
  getPlatformRelease,
  listReleaseEditorOptions,
  recordPlatformReleaseRead,
  saveReleaseHighlightFromForm,
} from "@/app/actions/releases";
import { ReleaseForm } from "@/components/releases/ReleaseForm";
import { Button } from "@/components/ui/button";
import type {
  FieldgridContentAudience,
  ReleaseHighlightSurface,
} from "@workspace/db";

export const metadata = {
  title: "Release bewerken",
};

type Props = {
  params: Promise<{ slug: string }>;
};

const SURFACES: Array<{ key: ReleaseHighlightSurface; label: string }> = [
  { key: "platform_backoffice", label: "Platform admin" },
  { key: "tenant_backoffice", label: "Tenant backoffice" },
  { key: "personnel_pwa", label: "Personeelsapp" },
  { key: "customer_pwa", label: "Klantportaal" },
];

const AUDIENCES: Array<{ key: FieldgridContentAudience; label: string }> = [
  { key: "platform_admin", label: "Platform admin" },
  { key: "support", label: "Support" },
  { key: "tenant_admin", label: "Tenant admin" },
  { key: "tenant_management", label: "Management" },
  { key: "tenant_planning", label: "Planning" },
  { key: "tenant_administration", label: "Administratie" },
  { key: "tenant_personnel", label: "Personeel" },
  { key: "tenant_customer", label: "Klanten" },
];

async function highlightAction(formData: FormData): Promise<void> {
  "use server";
  await saveReleaseHighlightFromForm(formData);
}

export default async function PlatformReleaseDetailPage({ params }: Props) {
  const { slug } = await params;
  const [release, options] = await Promise.all([
    getPlatformRelease(slug),
    listReleaseEditorOptions(),
  ]);

  if (!release) notFound();
  await recordPlatformReleaseRead(slug);

  return (
    <main className="px-5 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1500px] gap-6">
        <header className="border-b border-slate-200 pb-6">
          <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
            <Link href="/platform/releases">
              <ArrowLeft className="h-4 w-4" />
              Terug naar releases
            </Link>
          </Button>
          <p className="text-sm font-medium text-slate-500">Releasebeheer</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">
            {release.version} - {release.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Bewerk de release, publicatie, audience-scope, module-scope, items
            en roadmapkoppelingen.
          </p>
        </header>

        <ReleaseForm release={release} options={options} />

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-amber-700" />
            <h2 className="text-lg font-semibold text-slate-950">
              Highlight / gele balk
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Publiceer een audience-scoped banner. De banner verschijnt alleen
            wanneer deze release gepubliceerd is, de module actief is en de
            gebruiker de juiste audience heeft.
          </p>
          <form
            action={highlightAction}
            className="mt-4 grid gap-3 lg:grid-cols-[180px_180px_180px_1fr]"
          >
            <input type="hidden" name="releaseId" value={release.id} />
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Surface
              <SelectAdapter
                name="surface"
                defaultValue="tenant_backoffice"
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"
              >
                {SURFACES.map((surface) => (
                  <option key={surface.key} value={surface.key}>
                    {surface.label}
                  </option>
                ))}
              </SelectAdapter>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Audience
              <SelectAdapter
                name="audienceKey"
                defaultValue="tenant_admin"
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"
              >
                {AUDIENCES.map((audience) => (
                  <option key={audience.key} value={audience.key}>
                    {audience.label}
                  </option>
                ))}
              </SelectAdapter>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Module
              <SelectAdapter
                name="moduleKey"
                defaultValue=""
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"
              >
                <option value="">Geen module</option>
                {options.modules.map((module) => (
                  <option key={module.key} value={module.key}>
                    {module.name}
                  </option>
                ))}
              </SelectAdapter>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Titel
              <input
                name="title"
                required
                defaultValue={`Nieuw: ${release.title}`}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 lg:col-span-2">
              Bericht
              <input
                name="message"
                required
                defaultValue={
                  release.summary ??
                  `Release ${release.version} is beschikbaar.`
                }
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Prioriteit
              <input
                name="priority"
                type="number"
                defaultValue={50}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal"
              />
            </label>
            <div className="flex items-end justify-end">
              <Button type="submit" className="gap-2">
                <Send className="h-4 w-4" />
                Highlight maken
              </Button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

import Link from "next/link";
import { Lightbulb, MessageSquare, Plus, ThumbsUp } from "lucide-react";
import {
  listTenantRoadmapBoard,
  toggleTenantRoadmapVote,
  type RoadmapItemSummary,
} from "@/app/actions/roadmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RoadmapStatus } from "@workspace/db";

export const metadata = {
  title: "Roadmap",
};

const STATUS_COLUMNS: Array<{ key: RoadmapStatus; label: string; description: string }> = [
  { key: "new", label: "Nieuw", description: "Ingediende wensen die nog beoordeeld worden." },
  { key: "considering", label: "In overweging", description: "Wordt gespecificeerd of vergeleken met andere wensen." },
  { key: "in_development", label: "In ontwikkeling", description: "Actief in ontwerp of bouw." },
  { key: "done", label: "Afgerond", description: "Opgeleverd of gekoppeld aan release notes." },
];

async function voteAction(formData: FormData): Promise<void> {
  "use server";
  await toggleTenantRoadmapVote(formData);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function priorityClass(priority: string): string {
  if (priority === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-700";
  if (priority === "low") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-cyan-200 bg-cyan-50 text-cyan-700";
}

function RoadmapCard({ item }: { item: RoadmapItemSummary }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/roadmap/${item.id}`} className="font-semibold text-slate-950 hover:underline">
            {item.title}
          </Link>
          <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600">{item.description}</p>
        </div>
        {item.featured && <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${priorityClass(item.priority)}`}>{item.priority}</span>
        <Badge variant="outline">{item.scope === "global" ? "Fieldgrid" : "Mijn tenant"}</Badge>
        {item.linkedReleases.length > 0 && <Badge variant="outline">{item.linkedReleases[0]?.version}</Badge>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>Bijgewerkt {formatDate(item.updatedAt)}</span>
        <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{item.comments.length}</span>
      </div>

      <form action={voteAction} className="mt-3">
        <input type="hidden" name="id" value={item.id} />
        <Button type="submit" variant={item.hasCurrentUserVote ? "default" : "outline"} size="sm" className="w-full gap-2">
          <ThumbsUp className="h-4 w-4" />
          {item.voteCount} support
        </Button>
      </form>
    </article>
  );
}

export default async function TenantRoadmapPage() {
  const { items } = await listTenantRoadmapBoard();
  const tenantRequests = items.filter((item) => item.scope === "tenant").length;
  const globalItems = items.filter((item) => item.scope === "global").length;

  return (
    <main className="px-4 py-6 md:px-6">
      <div className="mx-auto grid w-full max-w-[1500px] gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Support</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">Roadmap en wensen</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Bekijk relevante Fieldgrid roadmapitems en volg de status van wensen die door uw tenant zijn ingediend.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="px-3 py-1">{globalItems} Fieldgrid items</Badge>
            <Badge variant="outline" className="border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-800">{tenantRequests} eigen wensen</Badge>
            <Button asChild className="gap-2">
              <Link href="/roadmap/new">
                <Plus className="h-4 w-4" />
                Wens indienen
              </Link>
            </Button>
          </div>
        </header>

        {items.length === 0 ? (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="font-medium text-slate-900">Geen roadmapitems zichtbaar.</p>
            <p className="mt-1 text-sm text-slate-500">Zodra er relevante items of eigen wensen zijn, verschijnen ze hier.</p>
          </section>
        ) : (
          <section className="grid gap-4 xl:grid-cols-4">
            {STATUS_COLUMNS.map((column) => {
              const columnItems = items.filter((item) => item.status === column.key);
              return (
                <div key={column.key} className="rounded-lg border border-slate-200 bg-slate-100/70 p-3">
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold text-slate-950">{column.label}</h2>
                      <Badge variant="outline" className="bg-white">{columnItems.length}</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{column.description}</p>
                  </div>
                  <div className="grid gap-3">
                    {columnItems.map((item) => (
                      <RoadmapCard key={item.id} item={item} />
                    ))}
                    {columnItems.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                        Geen items.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

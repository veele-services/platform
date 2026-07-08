import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquare, ThumbsUp } from "lucide-react";
import {
  addTenantRoadmapComment,
  getTenantRoadmapItem,
  toggleTenantRoadmapVote,
  type RoadmapItemSummary,
} from "@/app/actions/roadmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Roadmap detail",
};

type Props = {
  params: Promise<{ itemId: string }>;
};

async function commentAction(formData: FormData): Promise<void> {
  "use server";
  await addTenantRoadmapComment(formData);
}

async function voteAction(formData: FormData): Promise<void> {
  "use server";
  await toggleTenantRoadmapVote(formData);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string): string {
  if (status === "considering") return "In overweging";
  if (status === "in_development") return "In ontwikkeling";
  if (status === "done") return "Afgerond";
  return "Nieuw";
}

function RoadmapDetail({ item }: { item: RoadmapItemSummary }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="prose prose-slate max-w-none">
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{item.description}</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-950">Reacties</p>
            <form action={commentAction} className="mt-3 grid gap-3">
              <input type="hidden" name="id" value={item.id} />
              <textarea name="body" placeholder="Reageer op deze wens..." className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <div className="flex justify-end">
                <Button type="submit" variant="outline" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Reageer
                </Button>
              </div>
            </form>
            <div className="mt-4 grid gap-3">
              {item.comments.map((comment) => (
                <div key={comment.id} className="rounded-md bg-slate-50 p-3 text-sm">
                  <p className="text-xs text-slate-500">{formatDate(comment.createdAt)}</p>
                  <p className="mt-2 leading-6 text-slate-700">{comment.body}</p>
                </div>
              ))}
              {item.comments.length === 0 && <p className="text-sm text-slate-500">Nog geen reacties.</p>}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-950">Statusgeschiedenis</p>
            <div className="mt-3 grid gap-3">
              {item.statusHistory.map((entry) => (
                <div key={entry.id} className="rounded-md bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-900">{entry.fromStatus ? statusLabel(entry.fromStatus) : "Start"} -&gt; {statusLabel(entry.toStatus)}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(entry.createdAt)}</p>
                  {entry.note && <p className="mt-2 leading-6 text-slate-700">{entry.note}</p>}
                </div>
              ))}
              {item.statusHistory.length === 0 && <p className="text-sm text-slate-500">Nog geen statusregels.</p>}
            </div>
          </div>
        </div>
      </section>

      <aside className="grid gap-4 self-start">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Overzicht</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Status</dt>
              <dd className="font-medium text-slate-900">{statusLabel(item.status)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Prioriteit</dt>
              <dd className="font-medium text-slate-900">{item.priority}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Scope</dt>
              <dd className="font-medium text-slate-900">{item.scope === "global" ? "Platform" : "Mijn organisatie"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Geplande versie</dt>
              <dd className="font-medium text-slate-900">{item.plannedVersion ?? "-"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Oplevering</dt>
              <dd className="font-medium text-slate-900">{formatDate(item.expectedDelivery)}</dd>
            </div>
          </dl>
        </section>

        <form action={voteAction} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" variant={item.hasCurrentUserVote ? "default" : "outline"} className="w-full gap-2">
            <ThumbsUp className="h-4 w-4" />
            {item.voteCount} support
          </Button>
        </form>
      </aside>
    </div>
  );
}

export default async function TenantRoadmapDetailPage({ params }: Props) {
  const { itemId } = await params;
  const item = await getTenantRoadmapItem(itemId);
  if (!item) notFound();

  return (
    <main className="px-4 py-6 md:px-6">
      <div className="mx-auto grid w-full max-w-[1200px] gap-6">
        <header className="border-b border-slate-200 pb-6">
          <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
            <Link href="/roadmap">
              <ArrowLeft className="h-4 w-4" />
              Terug naar roadmap
            </Link>
          </Button>
          <p className="text-sm font-medium text-slate-500">Roadmap</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">{item.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">{statusLabel(item.status)}</Badge>
            <Badge variant="outline">{item.scope === "global" ? "Platform" : "Mijn organisatie"}</Badge>
            <Badge variant="outline">{item.priority}</Badge>
          </div>
        </header>

        <RoadmapDetail item={item} />
      </div>
    </main>
  );
}

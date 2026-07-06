import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";
import { getTenantRelease } from "@/app/actions/releases";
import { KnowledgebaseContentRenderer } from "@/components/knowledgebase/KnowledgebaseContentRenderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Release note",
};

type Props = {
  params: Promise<{ slug: string }>;
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(value));
}

export default async function TenantReleaseDetailPage({ params }: Props) {
  const { slug } = await params;
  const release = await getTenantRelease(slug);
  if (!release) notFound();

  return (
    <main className="px-4 py-6 md:px-6">
      <div className="mx-auto grid w-full max-w-[1000px] gap-6">
        <header className="border-b border-slate-200 pb-6">
          <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
            <Link href="/releases">
              <ArrowLeft className="h-4 w-4" />
              Terug naar releases
            </Link>
          </Button>
          <p className="text-sm font-medium text-slate-500">{formatDate(release.publishedAt)}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">{release.version} - {release.title}</h1>
          {release.summary && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{release.summary}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">{release.impactLevel}</Badge>
            {release.moduleKeys.map((moduleKey) => <Badge key={moduleKey} variant="outline">{moduleKey}</Badge>)}
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          {release.contentHtml ? (
            <KnowledgebaseContentRenderer html={release.contentHtml} mediaBasePath="/releases/media" />
          ) : (
            <p className="text-sm leading-7 text-slate-600">{release.contentText ?? release.summary}</p>
          )}
        </section>

        {release.media.length > 0 && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Media en bijlagen</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {release.media.map((item) => (
                <a
                  key={item.id}
                  href={`/releases/media/${item.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-sm hover:border-cyan-200 hover:bg-white"
                >
                  {item.mediaType === "image" ? (
                    <img src={`/releases/media/${item.id}`} alt={item.altText ?? item.caption ?? "Release media"} className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-slate-100 text-slate-500">
                      <FileText className="mr-2 h-4 w-4" />
                      {item.mediaType === "video" ? "Video" : "Bijlage"}
                    </div>
                  )}
                  <div className="p-3">
                    <p className="truncate font-medium text-slate-950">{item.caption || item.altText || item.storagePath}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.mediaType}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {release.items.length > 0 && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Wijzigingen</h2>
            <div className="mt-4 grid gap-3">
              {release.items.map((item) => (
                <div key={item.id} className="rounded-md border border-slate-200 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">{item.impactLevel}</Badge>
                        {item.moduleKey && <Badge variant="outline">{item.moduleKey}</Badge>}
                        {item.category && <Badge variant="outline">{item.category.name}</Badge>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

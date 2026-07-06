import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";
import { getCustomerRelease, recordCustomerReleaseRead } from "@/actions/releases";
import { KnowledgebaseContentRenderer } from "@/components/KnowledgebaseContentRenderer";
import { OfflineContentNotice } from "@/components/OfflineContentNotice";

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

export default async function CustomerReleaseDetailPage({ params }: Props) {
  const { slug } = await params;
  const release = await getCustomerRelease(slug);
  if (!release) notFound();
  await recordCustomerReleaseRead(slug);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-5 md:px-0">
      <OfflineContentNotice message="U bent offline. Deze release note komt uit de lokale cache. Media en bijlagen openen weer zodra u online bent." />

      <Link href="/releases" className="mb-4 inline-flex items-center gap-2 text-sm font-black text-slate-600">
        <ArrowLeft className="h-4 w-4" />
        Terug naar releases
      </Link>

      <article className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-sm font-bold text-slate-500">{formatDate(release.publishedAt)}</p>
        <h1 className="mt-2 text-2xl font-black" style={{ color: "var(--color-primary)" }}>
          {release.version} - {release.title}
        </h1>
        {release.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{release.summary}</p>}

        <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--color-border)" }}>
          {release.contentHtml ? (
            <KnowledgebaseContentRenderer html={release.contentHtml} mediaBasePath="/releases/media" />
          ) : (
            <p className="text-sm leading-7 text-slate-600">{release.contentText ?? release.summary}</p>
          )}
        </div>
      </article>

      {release.media.length > 0 && (
        <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="font-black" style={{ color: "var(--color-primary)" }}>Media en bijlagen</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {release.media.map((item) => (
              <a key={item.id} href={`/releases/media/${item.id}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-2xl border border-slate-200 text-sm">
                {item.mediaType === "image" ? (
                  <img src={`/releases/media/${item.id}`} alt={item.altText ?? item.caption ?? "Release media"} className="h-40 w-full object-cover" />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-slate-100 text-slate-500">
                    <FileText className="mr-2 h-4 w-4" />
                    {item.mediaType === "video" ? "Video" : "Bijlage"}
                  </div>
                )}
                <div className="p-3">
                  <p className="truncate font-black" style={{ color: "var(--color-primary)" }}>{item.caption || item.altText || item.storagePath}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.mediaType}</p>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {release.items.length > 0 && (
        <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>Wijzigingen</h2>
          <div className="mt-4 grid gap-3">
            {release.items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-black" style={{ color: "var(--color-primary)" }}>{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

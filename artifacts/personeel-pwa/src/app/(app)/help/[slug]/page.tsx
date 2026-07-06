import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import {
  getPersonnelKnowledgebaseArticle,
  submitPersonnelKnowledgebaseFeedback,
} from "@/actions/knowledgebase";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const article = await getPersonnelKnowledgebaseArticle(slug);
  return { title: article?.title ?? "Help" };
}

export default async function PersonnelHelpArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getPersonnelKnowledgebaseArticle(slug);
  if (!article) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-5 md:px-0">
      <article className="grid gap-4">
        <header className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
          <Link href="/help" className="inline-flex items-center gap-2 text-sm font-black" style={{ color: "var(--color-accent)" }}>
            <ArrowLeft className="h-4 w-4" />
            Terug naar help
          </Link>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.14em]" style={{ color: "var(--color-accent)" }}>{article.category?.name ?? "Handleiding"}</p>
          <h1 className="mt-2 text-2xl font-black" style={{ color: "var(--color-primary)" }}>{article.title}</h1>
          {article.summary && <p className="mt-3 text-sm leading-6 text-slate-600">{article.summary}</p>}
        </header>

        <section className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
          <div
            className="max-w-none text-sm leading-7 text-slate-700 [&_a]:font-semibold [&_a]:text-cyan-700 [&_blockquote]:rounded-xl [&_blockquote]:border-l-4 [&_blockquote]:border-cyan-500 [&_blockquote]:bg-cyan-50 [&_blockquote]:p-4 [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-slate-950 [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-black [&_h3]:text-slate-950 [&_li]:my-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-3 [&_ul]:ml-5 [&_ul]:list-disc"
            dangerouslySetInnerHTML={{ __html: article.contentHtml ?? "<p>Geen inhoud beschikbaar.</p>" }}
          />
        </section>

        {article.media.length > 0 && (
          <section className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
            <h2 className="font-black" style={{ color: "var(--color-primary)" }}>Media en bijlagen</h2>
            <div className="mt-3 grid gap-2">
              {article.media.map((item) => (
                <a key={item.id} href={item.publicUrl ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                  <FileText className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
                  <span className="min-w-0 flex-1 truncate">{item.caption || item.altText || item.storagePath}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {article.relatedArticles.length > 0 && (
          <section className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
            <h2 className="font-black" style={{ color: "var(--color-primary)" }}>Gerelateerde artikelen</h2>
            <div className="mt-3 grid gap-2">
              {article.relatedArticles.map((related) => (
                <Link key={related.id} href={`/help/${related.slug}`} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-black" style={{ color: "var(--color-primary)" }}>{related.title}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">
                      {related.relationType === "suggested" ? "Suggestie" : "Gekoppeld"}
                    </span>
                  </div>
                  {related.summary && <p className="mt-1 text-sm leading-6 text-slate-600">{related.summary}</p>}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
          <h2 className="font-black" style={{ color: "var(--color-primary)" }}>Was dit artikel nuttig?</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Uw feedback helpt om de handleidingen te verbeteren.</p>
          <form action={submitPersonnelKnowledgebaseFeedback} className="mt-4 grid gap-3">
            <input type="hidden" name="articleId" value={article.id} />
            <input type="hidden" name="slug" value={article.slug} />
            <textarea
              name="comment"
              placeholder="Optioneel: wat mist er of wat was juist duidelijk?"
              className="min-h-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button type="submit" name="isHelpful" value="true" className="rounded-xl px-4 py-2 text-sm font-black text-white" style={{ backgroundColor: "var(--color-accent)" }}>
                Ja, duidelijk
              </button>
              <button type="submit" name="isHelpful" value="false" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black" style={{ color: "var(--color-primary)" }}>
                Nee, kan beter
              </button>
            </div>
          </form>
        </section>
      </article>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import {
  getTenantKnowledgebaseArticle,
  submitTenantKnowledgebaseFeedback,
} from "@/app/actions/knowledgebase-help";
import { Button } from "@/components/ui/button";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const article = await getTenantKnowledgebaseArticle(slug);
  return { title: article?.title ?? "Handleiding" };
}

export default async function TenantHelpArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getTenantKnowledgebaseArticle(slug);
  if (!article) notFound();

  return (
    <main className="px-4 py-6 md:px-8">
      <article className="mx-auto grid w-full max-w-[1080px] gap-6">
        <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <Button asChild variant="ghost" className="-ml-3 mb-4 gap-2">
            <Link href="/help">
              <ArrowLeft className="h-4 w-4" />
              Terug naar help
            </Link>
          </Button>
          <p className="text-sm font-semibold text-cyan-700">{article.category?.name ?? "Handleiding"}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">{article.title}</h1>
          {article.summary && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{article.summary}</p>}
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div
            className="news-editor-content max-w-none"
            dangerouslySetInnerHTML={{ __html: article.contentHtml ?? "<p>Geen inhoud beschikbaar.</p>" }}
          />
        </section>

        {article.media.length > 0 && (
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Media en bijlagen</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {article.media.map((item) => (
                <a
                  key={item.id}
                  href={`/help/media/${item.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50"
                >
                  <FileText className="h-4 w-4 text-cyan-700" />
                  <span className="min-w-0 flex-1 truncate">{item.caption || item.altText || item.storagePath}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {article.relatedArticles.length > 0 && (
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Gerelateerde artikelen</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {article.relatedArticles.map((related) => (
                <Link key={related.id} href={`/help/${related.slug}`} className="rounded-md border border-slate-200 p-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-950">{related.title}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {related.relationType === "suggested" ? "Suggestie" : "Gekoppeld"}
                    </span>
                  </div>
                  {related.summary && <p className="mt-1 text-sm text-slate-600">{related.summary}</p>}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Was dit artikel nuttig?</h2>
          <p className="mt-1 text-sm text-slate-500">Uw feedback helpt om de handleidingen scherper te maken.</p>
          <form action={submitTenantKnowledgebaseFeedback} className="mt-4 grid gap-3">
            <input type="hidden" name="articleId" value={article.id} />
            <input type="hidden" name="slug" value={article.slug} />
            <textarea
              name="comment"
              placeholder="Optioneel: wat mist er of wat was juist duidelijk?"
              className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="isHelpful" value="true">Ja, duidelijk</Button>
              <Button type="submit" name="isHelpful" value="false" variant="outline">Nee, kan beter</Button>
            </div>
          </form>
        </section>
      </article>
    </main>
  );
}

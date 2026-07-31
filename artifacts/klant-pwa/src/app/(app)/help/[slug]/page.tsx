import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import {
  getCustomerKnowledgebaseArticle,
  submitCustomerKnowledgebaseFeedback,
} from "@/actions/knowledgebase";
import { KnowledgebaseContentRenderer } from "@/components/KnowledgebaseContentRenderer";
import { OfflineContentNotice } from "@/components/OfflineContentNotice";
import { requireCustomerPortalFeature } from "@/lib/portal-features";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const article = await getCustomerKnowledgebaseArticle(slug);
  return { title: article?.title ?? "Help" };
}

export default async function CustomerHelpArticlePage({ params }: Props) {
  await requireCustomerPortalFeature("knowledgebase");
  const { slug } = await params;
  const article = await getCustomerKnowledgebaseArticle(slug);
  if (!article) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-5 md:px-0">
      <OfflineContentNotice />

      <article className="grid gap-4">
        <header
          className="rounded-2xl border bg-white p-5 shadow-sm"
          style={{ borderColor: "var(--color-border)" }}
        >
          <Link
            href="/help"
            className="inline-flex items-center gap-2 text-sm font-semibold"
            style={{ color: "var(--color-accent-accessible)" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Terug naar help
          </Link>
          <p
            className="mt-4 text-xs font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-accent-accessible)" }}
          >
            {article.category?.name ?? "Handleiding"}
          </p>
          <h1
            className="mt-2 text-2xl font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {article.title}
          </h1>
          {article.summary && (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {article.summary}
            </p>
          )}
        </header>

        <section
          className="rounded-2xl border bg-white p-5 shadow-sm"
          style={{ borderColor: "var(--color-border)" }}
        >
          <KnowledgebaseContentRenderer
            html={article.contentHtml}
            mediaBasePath="/help/media"
          />
        </section>

        {article.media.length > 0 && (
          <section
            className="rounded-2xl border bg-white p-5 shadow-sm"
            style={{ borderColor: "var(--color-border)" }}
          >
            <h2
              className="font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              Media en bijlagen
            </h2>
            <div className="mt-3 grid gap-2">
              {article.media.map((item) => (
                <a
                  key={item.id}
                  href={`/help/media/${item.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl border p-3 text-sm"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <FileText
                    className="h-4 w-4"
                    style={{ color: "var(--color-accent-accessible)" }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {item.caption || item.altText || item.storagePath}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {article.relatedArticles.length > 0 && (
          <section
            className="rounded-2xl border bg-white p-5 shadow-sm"
            style={{ borderColor: "var(--color-border)" }}
          >
            <h2
              className="font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              Gerelateerde artikelen
            </h2>
            <div className="mt-3 grid gap-2">
              {article.relatedArticles.map((related) => (
                <Link
                  key={related.id}
                  href={`/help/${related.slug}`}
                  className="rounded-xl border p-3"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3
                      className="font-semibold"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {related.title}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {related.relationType === "suggested"
                        ? "Suggestie"
                        : "Gekoppeld"}
                    </span>
                  </div>
                  {related.summary && (
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {related.summary}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section
          className="rounded-2xl border bg-white p-5 shadow-sm"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2 className="font-semibold" style={{ color: "var(--color-primary)" }}>
            Was dit artikel nuttig?
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Uw feedback helpt om de handleidingen te verbeteren.
          </p>
          <form
            action={submitCustomerKnowledgebaseFeedback}
            className="mt-4 grid gap-3"
          >
            <input type="hidden" name="articleId" value={article.id} />
            <input type="hidden" name="slug" value={article.slug} />
            <textarea
              name="comment"
              placeholder="Optioneel: wat mist er of wat was juist duidelijk?"
              className="min-h-24 rounded-xl border bg-white px-3 py-2 text-sm"
              style={{ borderColor: "var(--color-border)" }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="isHelpful"
                value="true"
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: "var(--color-accent-accessible)" }}
              >
                Ja, duidelijk
              </button>
              <button
                type="submit"
                name="isHelpful"
                value="false"
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-primary)",
                }}
              >
                Nee, kan beter
              </button>
            </div>
          </form>
        </section>
      </article>
    </main>
  );
}

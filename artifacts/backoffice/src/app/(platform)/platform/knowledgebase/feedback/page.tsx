import Link from "next/link";
import { ArrowLeft, BarChart3, MessageSquare, Search, ThumbsDown, ThumbsUp } from "lucide-react";
import { getPlatformKnowledgebaseInsightsDashboard } from "@/app/actions/knowledgebase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Knowledgebase feedback",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function MetricCard({ label, value, caption }: { label: string; value: string | number; caption: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{caption}</p>
    </div>
  );
}

export default async function PlatformKnowledgebaseFeedbackPage() {
  const dashboard = await getPlatformKnowledgebaseInsightsDashboard();

  return (
    <main className="px-5 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1500px] gap-6">
        <header className="border-b border-slate-200 pb-6">
          <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
            <Link href="/platform/knowledgebase">
              <ArrowLeft className="h-4 w-4" />
              Terug naar knowledgebase
            </Link>
          </Button>
          <p className="text-sm font-medium text-slate-500">Platformbeheer</p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Feedback en zoekinzichten</h1>
            <BarChart3 className="h-6 w-6 text-cyan-700" />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Productsignalen uit helpfeedback en zoekgedrag van alle toegestane surfaces. Dit overzicht gebruikt de laatste {dashboard.windowDays} dagen.
          </p>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Feedback" value={dashboard.feedback.total} caption="Totaal ontvangen reacties" />
          <MetricCard label="Behulpzaam" value={`${dashboard.feedback.helpfulRate}%`} caption={`${dashboard.feedback.helpful} positief, ${dashboard.feedback.notHelpful} negatief`} />
          <MetricCard label="Zoekopdrachten" value={dashboard.searches.total} caption="Geregistreerde help searches" />
          <MetricCard label="Geen resultaten" value={dashboard.searches.zeroResultTotal} caption="Zoektermen met resultCount 0" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <h2 className="text-lg font-semibold text-slate-950">Artikelen met feedback</h2>
              <p className="mt-1 text-sm text-slate-500">Sorteert op meeste feedback, zodat verbeterpunten bovenaan staan.</p>
            </div>
            <div className="divide-y divide-slate-200">
              {dashboard.feedback.byArticle.map((article) => (
                <article key={article.articleId} className="p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <Link href={`/platform/knowledgebase/articles/${article.articleId}`} className="font-semibold text-slate-950 hover:underline">
                        {article.articleTitle}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">/{article.articleSlug}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">{article.scope === "tenant" ? "tenant" : "platform"}</Badge>
                        {article.tenantId && <Badge variant="outline">{article.tenantId}</Badge>}
                      </div>
                    </div>
                    <div className="grid gap-1 text-sm text-slate-600 lg:text-right">
                      <span>{article.total} reacties</span>
                      <span>{article.helpfulRate}% behulpzaam</span>
                      <span>Laatst: {formatDate(article.lastFeedbackAt)}</span>
                    </div>
                  </div>
                </article>
              ))}
              {dashboard.feedback.byArticle.length === 0 && (
                <div className="p-10 text-center text-sm text-slate-500">Nog geen artikelfeedback in deze periode.</div>
              )}
            </div>
          </div>

          <aside className="grid gap-4 self-start">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-cyan-700" />
                <h2 className="text-lg font-semibold text-slate-950">Populaire zoekopdrachten</h2>
              </div>
              <div className="mt-4 grid gap-2">
                {dashboard.searches.popular.slice(0, 10).map((entry) => (
                  <div key={entry.query} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-slate-950">{entry.query}</p>
                      <Badge variant="outline">{entry.total}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{entry.audienceKeys.join(", ") || "Alle audiences"}</p>
                  </div>
                ))}
                {dashboard.searches.popular.length === 0 && <p className="text-sm text-slate-500">Nog geen zoekdata.</p>}
              </div>
            </section>

            <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-amber-700" />
                <h2 className="text-lg font-semibold text-slate-950">Geen-resultaten signalen</h2>
              </div>
              <div className="mt-4 grid gap-2">
                {dashboard.searches.zeroResults.slice(0, 10).map((entry) => (
                  <div key={entry.query} className="rounded-md border border-amber-200 bg-white/70 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-slate-950">{entry.query}</p>
                      <Badge variant="outline" className="border-amber-300 text-amber-800">{entry.zeroResults}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Laatst gezocht: {formatDate(entry.lastSearchedAt)}</p>
                  </div>
                ))}
                {dashboard.searches.zeroResults.length === 0 && <p className="text-sm text-slate-600">Geen zero-result zoektermen gevonden.</p>}
              </div>
            </section>
          </aside>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-950">Recente reacties</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {dashboard.feedback.recent.map((item) => (
              <article key={item.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className={item.isHelpful ? "text-emerald-600" : "text-rose-600"}>
                    {item.isHelpful ? <ThumbsUp className="h-5 w-5" /> : <ThumbsDown className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/platform/knowledgebase/articles/${item.articleId}`} className="font-semibold text-slate-950 hover:underline">
                      {item.articleTitle}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{item.audienceKey}</span>
                      <span>{formatDate(item.createdAt)}</span>
                      {item.tenantId && <span>{item.tenantId}</span>}
                    </div>
                    {item.comment && (
                      <p className="mt-2 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                        <MessageSquare className="mr-1 inline h-4 w-4 text-slate-400" />
                        {item.comment}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
            {dashboard.feedback.recent.length === 0 && (
              <div className="p-10 text-center text-sm text-slate-500">Nog geen recente feedback.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

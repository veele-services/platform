import Link from "next/link";
import { ArrowLeft, BarChart3, Search, ThumbsDown, ThumbsUp } from "lucide-react";
import { getTenantKnowledgebaseInsightsDashboard } from "@/app/actions/knowledgebase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Helpfeedback",
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

export default async function TenantKnowledgebaseFeedbackPage() {
  const dashboard = await getTenantKnowledgebaseInsightsDashboard();

  return (
    <main className="px-4 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1280px] gap-6">
        <header className="border-b border-slate-200 pb-6">
          <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
            <Link href="/help/beheer">
              <ArrowLeft className="h-4 w-4" />
              Terug naar helpbeheer
            </Link>
          </Button>
          <p className="text-sm font-medium text-slate-500">Handleidingen</p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Feedback en zoekgedrag</h1>
            <BarChart3 className="h-6 w-6 text-cyan-700" />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Organisatie-scoped signalen uit de laatste {dashboard.windowDays} dagen. Alleen feedback en zoekopdrachten van deze organisatie worden getoond.
          </p>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Feedback" value={dashboard.feedback.total} caption="Reacties op zichtbare artikelen" />
          <MetricCard label="Behulpzaam" value={`${dashboard.feedback.helpfulRate}%`} caption={`${dashboard.feedback.helpful} positief, ${dashboard.feedback.notHelpful} negatief`} />
          <MetricCard label="Zoekopdrachten" value={dashboard.searches.total} caption="Help zoekacties" />
          <MetricCard label="Geen resultaten" value={dashboard.searches.zeroResultTotal} caption="Waar extra uitleg nodig is" />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <h2 className="text-lg font-semibold text-slate-950">Artikelfeedback</h2>
            </div>
            <div className="divide-y divide-slate-200">
              {dashboard.feedback.byArticle.map((article) => (
                <article key={article.articleId} className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">{article.articleTitle}</p>
                      <p className="mt-1 text-xs text-slate-500">/{article.articleSlug}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{article.total} reacties</Badge>
                      <Badge variant="outline">{article.helpfulRate}% behulpzaam</Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Laatst: {formatDate(article.lastFeedbackAt)}</p>
                </article>
              ))}
              {dashboard.feedback.byArticle.length === 0 && (
                <div className="p-10 text-center text-sm text-slate-500">Nog geen feedback in deze periode.</div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-cyan-700" />
                <h2 className="text-lg font-semibold text-slate-950">Zoekinzichten</h2>
              </div>
            </div>
            <div className="grid gap-4 p-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Populair</h3>
                <div className="mt-2 grid gap-2">
                  {dashboard.searches.popular.slice(0, 8).map((entry) => (
                    <div key={entry.query} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3 text-sm">
                      <span className="font-medium text-slate-950">{entry.query}</span>
                      <Badge variant="outline">{entry.total}</Badge>
                    </div>
                  ))}
                  {dashboard.searches.popular.length === 0 && <p className="text-sm text-slate-500">Nog geen zoekdata.</p>}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Geen resultaten</h3>
                <div className="mt-2 grid gap-2">
                  {dashboard.searches.zeroResults.slice(0, 8).map((entry) => (
                    <div key={entry.query} className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                      <span className="font-medium text-slate-950">{entry.query}</span>
                      <Badge variant="outline" className="border-amber-300 text-amber-800">{entry.zeroResults}</Badge>
                    </div>
                  ))}
                  {dashboard.searches.zeroResults.length === 0 && <p className="text-sm text-slate-500">Geen zero-result zoektermen.</p>}
                </div>
              </div>
            </div>
          </div>
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
                  <div>
                    <p className="font-semibold text-slate-950">{item.articleTitle}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.audienceKey} - {formatDate(item.createdAt)}</p>
                    {item.comment && <p className="mt-2 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">{item.comment}</p>}
                  </div>
                </div>
              </article>
            ))}
            {dashboard.feedback.recent.length === 0 && (
              <div className="p-10 text-center text-sm text-slate-500">Nog geen recente reacties.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

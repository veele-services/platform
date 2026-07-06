import Link from "next/link";
import { BookOpen, Search, Sparkles } from "lucide-react";
import { getTenantKnowledgebaseHelpIndex } from "@/app/actions/knowledgebase-help";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Help en handleidingen",
};

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function TenantHelpPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const index = await getTenantKnowledgebaseHelpIndex(q);

  return (
    <main className="px-4 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1280px] gap-6">
        <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-cyan-700">Handleidingen</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">Waar kunnen we mee helpen?</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Zoek in artikelen die passen bij uw modules en rechten binnen deze tenant.
          </p>
          <form className="mt-5 flex max-w-2xl gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                list="tenant-kb-search-suggestions"
                defaultValue={q ?? ""}
                placeholder="Zoek op functie, probleem of module..."
                className="h-11 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm"
              />
              <datalist id="tenant-kb-search-suggestions">
                {index.suggestions.map((suggestion) => (
                  <option key={`${suggestion.type}-${suggestion.value}`} value={suggestion.value}>
                    {suggestion.label}
                  </option>
                ))}
              </datalist>
            </div>
            <Button type="submit">Zoeken</Button>
          </form>
        </header>

        {index.categories.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-slate-950">Categorieen</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {index.categories.map((category) => (
                <div key={category.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="rounded-md bg-cyan-50 p-2 text-cyan-700">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-950">{category.name}</h3>
                      {category.description && <p className="mt-1 text-sm text-slate-600">{category.description}</p>}
                      <p className="mt-2 text-xs text-slate-500">{category.articleCount} artikel{category.articleCount === 1 ? "" : "en"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {index.featured.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <Sparkles className="h-5 w-5 text-cyan-700" />
              Uitgelicht
            </h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {index.featured.map((article) => (
                <Link key={article.id} href={`/help/${article.slug}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-200 hover:shadow-md">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-cyan-700">{article.category?.name ?? "Handleiding"}</p>
                  <h3 className="mt-2 font-semibold text-slate-950">{article.title}</h3>
                  {article.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p>}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-lg font-semibold text-slate-950">{q ? "Zoekresultaten" : "Recente artikelen"}</h2>
          <div className="mt-3 grid gap-3">
            {(q ? index.articles : index.recent).map((article) => (
              <Link key={article.id} href={`/help/${article.slug}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-200 hover:shadow-md">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{article.category?.name ?? "Handleiding"}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{article.title}</h3>
                    {article.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p>}
                  </div>
                  <span className="text-sm font-semibold text-cyan-700">Lees artikel</span>
                </div>
              </Link>
            ))}
          </div>

          {(q ? index.articles : index.recent).length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="font-medium text-slate-950">Geen artikelen gevonden.</p>
              <p className="mt-1 text-sm text-slate-500">Pas de zoekterm aan of neem contact op met support.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

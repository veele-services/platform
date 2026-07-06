import Link from "next/link";
import { BookOpen, Search, Sparkles } from "lucide-react";
import { getCustomerKnowledgebaseHelpIndex } from "@/actions/knowledgebase";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export const metadata = {
  title: "Help",
};

export default async function CustomerHelpPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const index = await getCustomerKnowledgebaseHelpIndex(q);
  const articles = q ? index.articles : index.recent;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-0">
      <section className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "var(--color-accent)" }}>Help</p>
        <h1 className="mt-2 text-2xl font-black" style={{ color: "var(--color-primary)" }}>Waar kunnen we mee helpen?</h1>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-secondary)" }}>
          Zoek in handleidingen die passen bij uw klantportaal en actieve modules.
        </p>
        <form className="mt-4 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              list="customer-kb-search-suggestions"
              defaultValue={q ?? ""}
              placeholder="Zoeken..."
              className="h-11 w-full rounded-xl border bg-white pl-9 pr-3 text-sm"
              style={{ borderColor: "var(--color-border)" }}
            />
            <datalist id="customer-kb-search-suggestions">
              {index.suggestions.map((suggestion) => (
                <option key={`${suggestion.type}-${suggestion.value}`} value={suggestion.value}>
                  {suggestion.label}
                </option>
              ))}
            </datalist>
          </div>
          <button type="submit" className="rounded-xl px-4 text-sm font-black text-white" style={{ backgroundColor: "var(--color-accent)" }}>
            Zoek
          </button>
        </form>
      </section>

      {index.categories.length > 0 && (
        <section className="mt-5">
          <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>Categorieen</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {index.categories.map((category) => (
              <div key={category.id} className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
                <BookOpen className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
                <h3 className="mt-3 font-black" style={{ color: "var(--color-primary)" }}>{category.name}</h3>
                {category.description && <p className="mt-1 text-sm leading-6 text-slate-600">{category.description}</p>}
                <p className="mt-2 text-xs font-semibold text-slate-500">{category.articleCount} artikel{category.articleCount === 1 ? "" : "en"}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {index.featured.length > 0 && (
        <section className="mt-5">
          <h2 className="flex items-center gap-2 text-lg font-black" style={{ color: "var(--color-primary)" }}>
            <Sparkles className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
            Uitgelicht
          </h2>
          <div className="mt-3 grid gap-3">
            {index.featured.map((article) => (
              <Link key={article.id} href={`/help/${article.slug}`} className="block rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
                <p className="text-xs font-black uppercase tracking-[0.12em]" style={{ color: "var(--color-accent)" }}>{article.category?.name ?? "Handleiding"}</p>
                <h3 className="mt-2 font-black" style={{ color: "var(--color-primary)" }}>{article.title}</h3>
                {article.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5">
        <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>{q ? "Zoekresultaten" : "Recente artikelen"}</h2>
        <div className="mt-3 grid gap-3">
          {articles.map((article) => (
            <Link key={article.id} href={`/help/${article.slug}`} className="block rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{article.category?.name ?? "Handleiding"}</p>
              <h3 className="mt-2 font-black" style={{ color: "var(--color-primary)" }}>{article.title}</h3>
              {article.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p>}
            </Link>
          ))}
        </div>
        {articles.length === 0 && (
          <div className="mt-3 rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">
            Geen artikelen gevonden.
          </div>
        )}
      </section>
    </main>
  );
}

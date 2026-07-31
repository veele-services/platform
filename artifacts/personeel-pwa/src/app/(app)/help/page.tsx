import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";
import { getPersonnelKnowledgebaseHelpIndex } from "@/actions/knowledgebase";
import { KnowledgebaseAutocompleteSearch } from "@/components/KnowledgebaseAutocompleteSearch";
import { OfflineContentNotice } from "@/components/OfflineContentNotice";
import { notFound } from "next/navigation";
import { requireCurrentPortalModule } from "@/lib/auth/tenant";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export const metadata = {
  title: "Help",
};

export default async function PersonnelHelpPage({ searchParams }: Props) {
  if (!(await requireCurrentPortalModule("knowledgebase"))) notFound();
  const { q } = await searchParams;
  const index = await getPersonnelKnowledgebaseHelpIndex(q);
  const articles = q ? index.articles : index.recent;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-0">
      <OfflineContentNotice />

      <section className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-accent-accessible)" }}>Help</p>
        <h1 className="mt-2 text-2xl font-semibold" style={{ color: "var(--color-primary)" }}>Waar kunnen we mee helpen?</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Zoek in handleidingen voor de personeelsapp, uw planning en operationele processen.
        </p>
        <div className="mt-4">
          <KnowledgebaseAutocompleteSearch defaultValue={q ?? ""} />
        </div>
      </section>

      {index.categories.length > 0 && (
        <section className="mt-5">
          <h2 className="text-lg font-semibold" style={{ color: "var(--color-primary)" }}>Categorieen</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {index.categories.map((category) => (
              <div key={category.id} className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
                <BookOpen className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
                <h3 className="mt-3 font-semibold" style={{ color: "var(--color-primary)" }}>{category.name}</h3>
                {category.description && <p className="mt-1 text-sm leading-6 text-slate-600">{category.description}</p>}
                <p className="mt-2 text-xs font-semibold text-slate-500">{category.articleCount} artikel{category.articleCount === 1 ? "" : "en"}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {index.featured.length > 0 && (
        <section className="mt-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold" style={{ color: "var(--color-primary)" }}>
            <Sparkles className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
            Uitgelicht
          </h2>
          <div className="mt-3 grid gap-3">
            {index.featured.map((article) => (
              <Link key={article.id} href={`/help/${article.slug}`} className="block rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
                <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-accent-accessible)" }}>{article.category?.name ?? "Handleiding"}</p>
                <h3 className="mt-2 font-semibold" style={{ color: "var(--color-primary)" }}>{article.title}</h3>
                {article.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-primary)" }}>{q ? "Zoekresultaten" : "Recente artikelen"}</h2>
        <div className="mt-3 grid gap-3">
          {articles.map((article) => (
            <Link key={article.id} href={`/help/${article.slug}`} className="block rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{article.category?.name ?? "Handleiding"}</p>
              <h3 className="mt-2 font-semibold" style={{ color: "var(--color-primary)" }}>{article.title}</h3>
              {article.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p>}
            </Link>
          ))}
        </div>
        {articles.length === 0 && (
          <div className="mt-3 rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">
            <p className="font-semibold" style={{ color: "var(--color-primary)" }}>Geen artikelen gevonden.</p>
            <p className="mt-1">Probeer een andere zoekterm of stuur een bericht naar de backoffice.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/help" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
                Wis zoekterm
              </Link>
              <Link href="/berichten" className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "var(--color-accent-accessible)" }}>
                Bericht sturen
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, BookOpen, FileText, Lock, SearchX } from "lucide-react";
import { getShortcodeKnowledgebaseArticle } from "@/app/actions/knowledgebase-help";
import { CopySupportLinkButton } from "@/components/knowledgebase/CopySupportLinkButton";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ tenantCode: string; slug: string }>;
};

type FallbackTone = "warning" | "danger" | "neutral";

function statusStyles(tone: FallbackTone): string {
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-white text-slate-700";
}

function HelpFallback({
  title,
  message,
  tone = "neutral",
  icon,
}: {
  title: string;
  message: string;
  tone?: FallbackTone;
  icon: "lock" | "search" | "alert";
}) {
  const Icon = icon === "lock" ? Lock : icon === "search" ? SearchX : AlertCircle;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 md:px-8">
      <section className={`mx-auto mt-20 max-w-xl rounded-lg border p-6 text-center shadow-sm ${statusStyles(tone)}`}>
        <Icon className="mx-auto h-8 w-8" />
        <p className="mt-4 text-sm font-semibold uppercase tracking-wide">Fieldgrid help</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <Button asChild className="mt-5">
          <Link href="/login">Inloggen</Link>
        </Button>
      </section>
    </main>
  );
}

export async function generateMetadata({ params }: Props) {
  const { tenantCode, slug } = await params;
  const result = await getShortcodeKnowledgebaseArticle(tenantCode, slug);
  if (result.status === "ok") return { title: `${result.article.title} | ${result.tenant.name}` };
  return { title: "Fieldgrid help" };
}

export default async function KnowledgebaseShortcodeArticlePage({ params }: Props) {
  const { tenantCode, slug } = await params;
  const result = await getShortcodeKnowledgebaseArticle(tenantCode, slug);

  if (result.status === "login_required") {
    redirect(`/login?next=${encodeURIComponent(result.nextPath)}`);
  }

  if (result.status === "tenant_not_found") {
    return (
      <HelpFallback
        icon="search"
        title="Tenant niet gevonden"
        message="Deze supportlink verwijst naar een tenantcode die niet actief is. Controleer de link of vraag support om een nieuwe link."
      />
    );
  }

  if (result.status === "module_inactive") {
    return (
      <HelpFallback
        icon="alert"
        tone="warning"
        title="Knowledgebase niet actief"
        message={`De helpmodule is niet actief voor ${result.tenant.name}. Activeer de module of gebruik een andere handleiding.`}
      />
    );
  }

  if (result.status === "access_denied") {
    return (
      <HelpFallback
        icon="lock"
        tone="danger"
        title="Geen toegang tot dit artikel"
        message={`U bent ingelogd, maar heeft voor ${result.tenant.name} geen toegang tot deze handleiding. Controleer tenanttoegang, rol, module en permissies.`}
      />
    );
  }

  if (result.status === "article_not_found") {
    return (
      <HelpFallback
        icon="search"
        title="Artikel niet gevonden"
        message="Deze handleiding bestaat niet meer, is niet gepubliceerd of de link bevat een verouderde slug."
      />
    );
  }

  const { article, tenant, supportUrl } = result;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <article className="mx-auto grid w-full max-w-[1080px] gap-6">
        <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold text-cyan-700">{tenant.name}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                {article.category?.name ?? "Handleiding"}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">{article.title}</h1>
              {article.summary && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{article.summary}</p>}
            </div>
            <CopySupportLinkButton value={supportUrl} />
          </div>
          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Stabiele supportlink:</span>
            <span className="ml-2 break-all">{supportUrl}</span>
          </div>
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
                  href={`/h/${result.tenantCode}/${article.slug}/media/${item.id}`}
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
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <BookOpen className="h-4 w-4 text-cyan-700" />
              Gerelateerde artikelen
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {article.relatedArticles.map((related) => (
                <Link
                  key={related.id}
                  href={`/h/${result.tenantCode}/${related.slug}`}
                  className="rounded-md border border-slate-200 p-3 hover:bg-slate-50"
                >
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
      </article>
    </main>
  );
}

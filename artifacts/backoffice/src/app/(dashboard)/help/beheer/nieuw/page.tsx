import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listTenantKnowledgebaseEditorOptions } from "@/app/actions/knowledgebase";
import { KnowledgebaseArticleForm } from "@/components/knowledgebase/KnowledgebaseArticleForm";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Nieuw eigen helpartikel",
};

export default async function NewTenantKnowledgebaseArticlePage() {
  const options = await listTenantKnowledgebaseEditorOptions();

  return (
    <main className="px-4 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1500px] gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
              <Link href="/help/beheer">
                <ArrowLeft className="h-4 w-4" />
                Terug
              </Link>
            </Button>
            <p className="text-sm font-medium text-slate-500">Helpbeheer</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">Nieuw eigen artikel</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Maak een organisatie-interne handleiding. Zichtbaarheid blijft beperkt tot deze organisatie.
            </p>
          </div>
        </header>

        <KnowledgebaseArticleForm
          article={null}
          options={options}
          mode="tenant"
          afterCreatePath={(id) => `/help/beheer/${id}`}
          mediaBasePath="/help/media"
        />
      </div>
    </main>
  );
}

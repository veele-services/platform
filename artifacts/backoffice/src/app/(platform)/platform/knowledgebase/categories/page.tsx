import { SelectAdapter } from "@/components/ui/select-adapter";
import Link from "next/link";
import { ArrowLeft, Save, Tags } from "lucide-react";
import {
  listKnowledgebaseCategoriesForManagement,
  listKnowledgebaseEditorOptions,
  saveKnowledgebaseCategoryFromForm,
} from "@/app/actions/knowledgebase";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Knowledgebase categorieen",
};

async function saveCategoryAction(formData: FormData): Promise<void> {
  "use server";
  await saveKnowledgebaseCategoryFromForm(formData);
}

export default async function KnowledgebaseCategoriesPage() {
  const [categories, options] = await Promise.all([
    listKnowledgebaseCategoriesForManagement(),
    listKnowledgebaseEditorOptions(),
  ]);

  return (
    <main className="px-5 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1300px] gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
              <Link href="/platform/knowledgebase">
                <ArrowLeft className="h-4 w-4" />
                Terug
              </Link>
            </Button>
            <p className="text-sm font-medium text-slate-500">Knowledgebase</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">
              Categorieen
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Categorieen sturen de navigatie, module-scope en filtering in alle
              helpviews.
            </p>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Tags className="h-5 w-5 text-cyan-700" />
            <h2 className="text-lg font-semibold text-slate-950">
              Nieuwe categorie
            </h2>
          </div>
          <form
            action={saveCategoryAction}
            className="grid gap-3 md:grid-cols-[1fr_1fr_180px_120px_auto]"
          >
            <input
              name="name"
              required
              placeholder="Naam"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <input
              name="slug"
              placeholder="slug"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <SelectAdapter
              name="moduleKey"
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Geen module</option>
              {options.modules.map((module) => (
                <option key={module.key} value={module.key}>
                  {module.name}
                </option>
              ))}
            </SelectAdapter>
            <input
              name="sortOrder"
              type="number"
              defaultValue={0}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm">
              <input name="isActive" type="checkbox" defaultChecked />
              Actief
            </label>
            <textarea
              name="description"
              placeholder="Beschrijving"
              className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-4"
            />
            <Button type="submit" className="gap-2 md:col-start-5">
              <Save className="h-4 w-4" />
              Opslaan
            </Button>
          </form>
        </section>

        <section className="grid gap-3">
          {categories.map((category) => (
            <form
              key={category.id}
              action={saveCategoryAction}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <input type="hidden" name="id" value={category.id} />
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr_190px_120px_auto]">
                <input
                  name="name"
                  defaultValue={category.name}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium"
                />
                <input
                  name="slug"
                  defaultValue={category.slug}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                />
                <SelectAdapter
                  name="moduleKey"
                  defaultValue={category.moduleKey ?? ""}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="">Geen module</option>
                  {options.modules.map((module) => (
                    <option key={module.key} value={module.key}>
                      {module.name}
                    </option>
                  ))}
                </SelectAdapter>
                <input
                  name="sortOrder"
                  type="number"
                  defaultValue={category.sortOrder}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                />
                <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm">
                  <input
                    name="isActive"
                    type="checkbox"
                    defaultChecked={category.isActive}
                  />
                  Actief
                </label>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
                <textarea
                  name="description"
                  defaultValue={category.description ?? ""}
                  className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="gap-2 lg:self-start"
                >
                  <Save className="h-4 w-4" />
                  Bijwerken
                </Button>
              </div>
            </form>
          ))}
          {categories.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              Geen categorieen gevonden.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

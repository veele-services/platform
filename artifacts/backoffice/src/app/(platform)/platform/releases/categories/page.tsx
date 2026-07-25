import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import { SelectAdapter } from "@/components/ui/select-adapter";
import Link from "next/link";
import { Archive, ArrowLeft, Save, Tags } from "lucide-react";
import {
  archiveReleaseCategoryFromForm,
  listReleaseCategoriesForManagement,
  listReleaseEditorOptions,
  saveReleaseCategoryFromForm,
} from "@/app/actions/releases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Releasecategorieen",
};

async function saveCategoryAction(formData: FormData): Promise<void> {
  "use server";
  await saveReleaseCategoryFromForm(formData);
}

async function archiveCategoryAction(formData: FormData): Promise<void> {
  "use server";
  await archiveReleaseCategoryFromForm(formData);
}

export default async function ReleaseCategoriesPage() {
  const [categories, options] = await Promise.all([
    listReleaseCategoriesForManagement(),
    listReleaseEditorOptions(),
  ]);

  return (
    <main className="px-5 py-6 md:px-8">
      <div className="mx-auto grid w-full max-w-[1300px] gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
              <Link href="/platform/releases">
                <ArrowLeft className="h-4 w-4" />
                Terug naar releases
              </Link>
            </Button>
            <p className="text-sm font-medium text-slate-500">Releasebeheer</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">
              Releasecategorieen
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Beheer de categorieen waarmee release items worden gegroepeerd per
              module, audience en impact.
            </p>
          </div>
          <Badge variant="outline">{categories.length} categorieen</Badge>
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
              <CheckboxAdapter name="isActive" type="checkbox" defaultChecked />
              Actief
            </label>
            <Button type="submit" className="gap-2 md:col-start-5">
              <Save className="h-4 w-4" />
              Opslaan
            </Button>
          </form>
        </section>

        <section className="grid gap-3">
          {categories.map((category) => (
            <div
              key={category.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <form
                action={saveCategoryAction}
                className="grid gap-3 lg:grid-cols-[1fr_1fr_190px_120px_120px]"
              >
                <input type="hidden" name="id" value={category.id} />
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
                  <CheckboxAdapter
                    name="isActive"
                    type="checkbox"
                    defaultChecked={category.isActive}
                  />
                  Actief
                </label>
                <div className="flex flex-wrap gap-2 lg:col-span-5 lg:justify-end">
                  <Button type="submit" variant="outline" className="gap-2">
                    <Save className="h-4 w-4" />
                    Bijwerken
                  </Button>
                </div>
              </form>
              {category.isActive && (
                <form
                  action={archiveCategoryAction}
                  className="mt-3 flex justify-end"
                >
                  <input type="hidden" name="id" value={category.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="gap-2 text-rose-700"
                  >
                    <Archive className="h-4 w-4" />
                    Archiveer
                  </Button>
                </form>
              )}
            </div>
          ))}
          {categories.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              Geen releasecategorieen gevonden.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

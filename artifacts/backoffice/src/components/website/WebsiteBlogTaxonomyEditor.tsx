"use client";

import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import type {
  WebsiteBlogCategoryDraftItem,
  WebsiteBlogTagDraftItem,
} from "@workspace/db";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { replaceWebsiteBlogTaxonomyAction } from "@/app/actions/website";
import { Button } from "@/components/ui/button";

type Props = {
  siteId: string;
  siteAuthoringRevision: number;
  defaultLocale: string;
  categories: WebsiteBlogCategoryDraftItem[];
  tags: WebsiteBlogTagDraftItem[];
  canWrite: boolean;
};

function nextSlug(prefix: string, count: number): string {
  return `${prefix}-${count + 1}`;
}

export function WebsiteBlogTaxonomyEditor({
  siteId,
  siteAuthoringRevision,
  defaultLocale,
  categories: initialCategories,
  tags: initialTags,
  canWrite,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [revision, setRevision] = useState(siteAuthoringRevision);
  const [categories, setCategories] = useState(initialCategories);
  const [tags, setTags] = useState(initialTags);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await replaceWebsiteBlogTaxonomyAction({
        siteId,
        expectedAuthoringRevision: revision,
        taxonomy: { categories, tags },
      });
      if (!result.success || !result.data) {
        setError(
          result.success
            ? "De blogtaxonomie gaf geen resultaat terug."
            : result.message,
        );
        return;
      }
      setRevision(result.data.authoringRevision);
      setMessage(
        result.data.changed
          ? "Categorieën en tags zijn opgeslagen."
          : "Er waren geen wijzigingen.",
      );
      router.refresh();
    });
  }

  return (
    <section className="veele-card space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-950">
          Categorieën en tags
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Slugs zijn onderdeel van de publieke archiefroutes. Een gebruikte
          categorie of tag kan niet worden verwijderd.
        </p>
      </div>

      <TaxonomyGroup
        title="Categorieën"
        items={categories}
        disabled={!canWrite || isPending}
        onChange={setCategories}
        onAdd={() =>
          setCategories((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              locale: defaultLocale,
              name: "Nieuwe categorie",
              slug: nextSlug("categorie", current.length),
              description: null,
              isActive: true,
            },
          ])
        }
        showDescription
      />
      <TaxonomyGroup
        title="Tags"
        items={tags}
        disabled={!canWrite || isPending}
        onChange={setTags}
        onAdd={() =>
          setTags((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              locale: defaultLocale,
              name: "Nieuwe tag",
              slug: nextSlug("tag", current.length),
              isActive: true,
            },
          ])
        }
      />

      <div aria-live="polite" className="min-h-5 text-sm">
        {error ? <p className="text-red-700">{error}</p> : null}
        {message ? <p className="text-emerald-700">{message}</p> : null}
      </div>
      {canWrite ? (
        <div className="flex justify-end">
          <Button type="button" disabled={isPending} onClick={save}>
            {isPending ? "Opslaan…" : "Taxonomie opslaan"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function TaxonomyGroup<
  T extends WebsiteBlogCategoryDraftItem | WebsiteBlogTagDraftItem,
>({
  title,
  items,
  disabled,
  onChange,
  onAdd,
  showDescription = false,
}: {
  title: string;
  items: T[];
  disabled: boolean;
  onChange: (items: T[]) => void;
  onAdd: () => void;
  showDescription?: boolean;
}) {
  function update(index: number, patch: Partial<T>) {
    onChange(
      items.map((item, itemIndex) =>
        itemIndex === index ? ({ ...item, ...patch } as T) : item,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-slate-900">{title}</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={onAdd}
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          Toevoegen
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Nog niets toegevoegd.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_auto]"
            >
              <input
                aria-label={`${title} naam`}
                className="border-0 border-b border-slate-200 bg-transparent px-1 py-2 text-sm outline-none focus:border-cyan-600"
                value={item.name}
                disabled={disabled}
                onChange={(event) =>
                  update(index, { name: event.target.value } as Partial<T>)
                }
              />
              <input
                aria-label={`${title} slug`}
                className="border-0 border-b border-slate-200 bg-transparent px-1 py-2 font-mono text-sm outline-none focus:border-cyan-600"
                value={item.slug}
                disabled={disabled}
                onChange={(event) =>
                  update(index, { slug: event.target.value } as Partial<T>)
                }
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <CheckboxAdapter
                  type="checkbox"
                  checked={item.isActive}
                  disabled={disabled}
                  onChange={(event) =>
                    update(index, {
                      isActive: event.target.checked,
                    } as Partial<T>)
                  }
                />
                Actief
              </label>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled}
                aria-label={`${item.name} verwijderen`}
                onClick={() =>
                  onChange(
                    items.filter((candidate) => candidate.id !== item.id),
                  )
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              {showDescription && "description" in item ? (
                <input
                  aria-label={`${title} beschrijving`}
                  className="border-0 border-b border-slate-200 bg-transparent px-1 py-2 text-sm outline-none focus:border-cyan-600 md:col-span-4"
                  placeholder="Korte optionele beschrijving"
                  value={item.description ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    update(index, {
                      description: event.target.value || null,
                    } as unknown as Partial<T>)
                  }
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

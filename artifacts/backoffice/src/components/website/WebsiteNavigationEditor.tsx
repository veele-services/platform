"use client";

import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import type {
  WebsiteNavigationDraftItem,
  WebsiteNavigationPageOption,
  WebsiteNavigationView,
} from "@workspace/db";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  Link2,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { replaceWebsiteNavigationAction } from "@/app/actions/website";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const LOCATIONS = [
  {
    value: "header",
    label: "Hoofdnavigatie",
    description: "Het primaire menu bovenaan iedere managed pagina.",
  },
  {
    value: "footer_primary",
    label: "Footer",
    description: "Belangrijke pagina's en aanvullende navigatie.",
  },
  {
    value: "footer_legal",
    label: "Juridisch",
    description: "Privacy, voorwaarden en andere juridische pagina's.",
  },
] as const;

type Location = (typeof LOCATIONS)[number]["value"];

function editableItems(
  view: WebsiteNavigationView,
): WebsiteNavigationDraftItem[] {
  return view.items.map(
    ({
      position: _position,
      pageTitle: _pageTitle,
      pagePath: _pagePath,
      pageStatus: _pageStatus,
      ...item
    }) => item,
  );
}

function defaultLink(
  pages: WebsiteNavigationPageOption[],
): Pick<WebsiteNavigationDraftItem, "linkType" | "pageId" | "href" | "target"> {
  const page = pages[0];
  return page
    ? { linkType: "page", pageId: page.id, href: null, target: "self" }
    : {
        linkType: "external",
        pageId: null,
        href: "",
        target: "self",
      };
}

function orderedItems(items: WebsiteNavigationDraftItem[]) {
  return LOCATIONS.flatMap(({ value }) => {
    const roots = items.filter(
      (item) => item.location === value && !item.parentId,
    );
    return roots.flatMap((root) => [
      root,
      ...items.filter(
        (item) => item.location === value && item.parentId === root.id,
      ),
    ]);
  });
}

export function WebsiteNavigationEditor({
  initialView,
  canWrite,
}: {
  initialView: WebsiteNavigationView;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(() => editableItems(initialView));
  const [siteRevision, setSiteRevision] = useState(
    initialView.authoringRevision,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pagesById = useMemo(
    () => new Map(initialView.pages.map((page) => [page.id, page])),
    [initialView.pages],
  );

  function updateItem(id: string, patch: Partial<WebsiteNavigationDraftItem>) {
    setItems((current) =>
      current.map((item) => {
        if (item.id === id) return { ...item, ...patch };
        if (patch.isVisible === false && item.parentId === id) {
          return { ...item, isVisible: false };
        }
        return item;
      }),
    );
    setMessage(null);
    setError(null);
  }

  function changeLinkType(
    item: WebsiteNavigationDraftItem,
    linkType: WebsiteNavigationDraftItem["linkType"],
  ) {
    if (linkType === "page") {
      updateItem(item.id, {
        linkType,
        pageId: initialView.pages[0]?.id ?? null,
        href: null,
        target: "self",
      });
      return;
    }
    if (linkType === "external") {
      updateItem(item.id, {
        linkType,
        pageId: null,
        href: "",
        target: "self",
      });
      return;
    }
    updateItem(item.id, {
      linkType,
      parentId: null,
      pageId: null,
      href: null,
      target: "self",
    });
  }

  function addRoot(location: Location, linkType?: "dropdown") {
    const id = crypto.randomUUID();
    const destination = linkType
      ? {
          linkType,
          pageId: null,
          href: null,
          target: "self" as const,
        }
      : defaultLink(initialView.pages);
    setItems((current) => [
      ...current,
      {
        id,
        label: linkType ? "Nieuwe menugroep" : "Nieuw menuonderdeel",
        location,
        parentId: null,
        isVisible: true,
        ...destination,
      },
    ]);
    setMessage(null);
  }

  function addChild(parent: WebsiteNavigationDraftItem) {
    const child: WebsiteNavigationDraftItem = {
      id: crypto.randomUUID(),
      label: "Nieuw submenu",
      location: parent.location,
      parentId: parent.id,
      isVisible: parent.isVisible,
      ...defaultLink(initialView.pages),
    };
    setItems((current) => {
      const childIndexes = current
        .map((item, index) => (item.parentId === parent.id ? index : -1))
        .filter((index) => index >= 0);
      const parentIndex = current.findIndex((item) => item.id === parent.id);
      const insertAt = childIndexes.length
        ? Math.max(...childIndexes) + 1
        : parentIndex + 1;
      return [...current.slice(0, insertAt), child, ...current.slice(insertAt)];
    });
    setMessage(null);
  }

  function removeItem(item: WebsiteNavigationDraftItem) {
    const childCount = items.filter(
      (candidate) => candidate.parentId === item.id,
    ).length;
    if (childCount > 0) {
      setError("Verwijder eerst de submenu-onderdelen van deze menugroep.");
      return;
    }
    setItems((current) =>
      current.filter((candidate) => candidate.id !== item.id),
    );
    setMessage(null);
    setError(null);
  }

  function moveItem(id: string, direction: -1 | 1) {
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === id);
      if (!item) return current;
      const siblings = current.filter(
        (candidate) =>
          candidate.location === item.location &&
          candidate.parentId === item.parentId,
      );
      const siblingIndex = siblings.findIndex(
        (candidate) => candidate.id === id,
      );
      const other = siblings[siblingIndex + direction];
      if (!other) return current;
      const itemIndex = current.findIndex((candidate) => candidate.id === id);
      const otherIndex = current.findIndex(
        (candidate) => candidate.id === other.id,
      );
      const next = [...current];
      [next[itemIndex], next[otherIndex]] = [
        next[otherIndex]!,
        next[itemIndex]!,
      ];
      return next;
    });
    setMessage(null);
  }

  function saveNavigation() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await replaceWebsiteNavigationAction({
        siteId: initialView.siteId,
        expectedAuthoringRevision: siteRevision,
        items: orderedItems(items),
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      if (!result.data) {
        setError("De server gaf geen opgeslagen navigatierevisie terug.");
        return;
      }
      setSiteRevision(result.data.authoringRevision);
      setMessage(
        result.data.changed
          ? "Navigatieconcept opgeslagen. Publicatie is niet gewijzigd."
          : "Er waren geen navigatiewijzigingen om op te slaan.",
      );
      router.refresh();
    });
  }

  const disabled = !canWrite || isPending;
  return (
    <div className="space-y-6">
      {initialView.deliveryMode === "custom_nextjs" && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Custom Next.js blijft live en beheert zijn eigen navigatie in code.
          Wijzigingen hier blijven uitsluitend als managed CMS-concept bewaard.
        </section>
      )}

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <p className="font-semibold text-slate-950">
            Conceptrevisie {siteRevision}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Maximaal één submenuniveau. Opslaan publiceert of deployt nooit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/website/review">Preview & review</Link>
          </Button>
          {canWrite && (
            <Button onClick={saveNavigation} disabled={disabled}>
              {isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Navigatie opslaan
            </Button>
          )}
        </div>
      </section>

      {initialView.pages.length === 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Er zijn nog geen actieve pagina's in {initialView.defaultLocale}. Maak
          eerst een pagina of gebruik tijdelijk een externe HTTPS-link.
        </section>
      )}

      {LOCATIONS.map((location) => {
        const roots = items.filter(
          (item) => item.location === location.value && !item.parentId,
        );
        return (
          <section
            key={location.value}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">
                  {location.label}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {location.description}
                </p>
              </div>
              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addRoot(location.value)}
                    disabled={disabled}
                  >
                    <Plus />
                    Link
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addRoot(location.value, "dropdown")}
                    disabled={disabled}
                  >
                    <Plus />
                    Menugroep
                  </Button>
                </div>
              )}
            </div>

            {roots.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                Dit menu is leeg.
              </div>
            ) : (
              <ol className="space-y-3">
                {roots.map((root, rootIndex) => {
                  const children = items.filter(
                    (item) => item.parentId === root.id,
                  );
                  return (
                    <li key={root.id} className="space-y-2">
                      <NavigationRow
                        item={root}
                        pages={initialView.pages}
                        page={root.pageId ? pagesById.get(root.pageId) : null}
                        disabled={disabled}
                        canMoveUp={rootIndex > 0}
                        canMoveDown={rootIndex < roots.length - 1}
                        onChange={(patch) => updateItem(root.id, patch)}
                        onLinkTypeChange={(linkType) =>
                          changeLinkType(root, linkType)
                        }
                        onMoveUp={() => moveItem(root.id, -1)}
                        onMoveDown={() => moveItem(root.id, 1)}
                        onRemove={() => removeItem(root)}
                        onAddChild={() => addChild(root)}
                      />
                      {children.length > 0 && (
                        <ol className="ml-5 space-y-2 border-l-2 border-slate-200 pl-3 sm:ml-8 sm:pl-4">
                          {children.map((child, childIndex) => (
                            <li key={child.id}>
                              <NavigationRow
                                item={child}
                                pages={initialView.pages}
                                page={
                                  child.pageId
                                    ? pagesById.get(child.pageId)
                                    : null
                                }
                                disabled={disabled}
                                nested
                                canMoveUp={childIndex > 0}
                                canMoveDown={childIndex < children.length - 1}
                                onChange={(patch) =>
                                  updateItem(child.id, patch)
                                }
                                onLinkTypeChange={(linkType) =>
                                  changeLinkType(child, linkType)
                                }
                                onMoveUp={() => moveItem(child.id, -1)}
                                onMoveDown={() => moveItem(child.id, 1)}
                                onRemove={() => removeItem(child)}
                              />
                            </li>
                          ))}
                        </ol>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}

      {(message || error) && (
        <div
          role={error ? "alert" : "status"}
          className={`rounded-lg px-4 py-3 text-sm ${
            error
              ? "border border-red-200 bg-red-50 text-red-800"
              : "border border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error ?? message}
        </div>
      )}
    </div>
  );
}

function NavigationRow({
  item,
  pages,
  page,
  disabled,
  nested = false,
  canMoveUp,
  canMoveDown,
  onChange,
  onLinkTypeChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  onAddChild,
}: {
  item: WebsiteNavigationDraftItem;
  pages: WebsiteNavigationPageOption[];
  page: WebsiteNavigationPageOption | null | undefined;
  disabled: boolean;
  nested?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<WebsiteNavigationDraftItem>) => void;
  onLinkTypeChange: (linkType: WebsiteNavigationDraftItem["linkType"]) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onAddChild?: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(150px,0.8fr)_minmax(150px,0.65fr)_minmax(220px,1.35fr)_auto] lg:items-center">
        <GripVertical
          className="hidden h-5 w-5 text-slate-400 lg:block"
          aria-hidden="true"
        />
        <label className="grid gap-1 text-xs font-medium text-slate-500">
          Label
          <input
            value={item.label}
            onChange={(event) => onChange({ label: event.target.value })}
            maxLength={180}
            disabled={disabled}
            aria-label={`Label ${item.label}`}
            className="border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-cyan-600 focus:ring-0"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-500">
          Soort
          <select
            value={item.linkType}
            onChange={(event) =>
              onLinkTypeChange(
                event.target.value as WebsiteNavigationDraftItem["linkType"],
              )
            }
            disabled={disabled}
            aria-label={`Soort ${item.label}`}
            className="veele-input min-h-9 text-sm"
          >
            <option value="page">Interne pagina</option>
            <option value="external">Externe HTTPS-link</option>
            {!nested && <option value="dropdown">Menugroep</option>}
          </select>
        </label>
        <div className="min-w-0">
          {item.linkType === "page" ? (
            <label className="grid gap-1 text-xs font-medium text-slate-500">
              Pagina
              <select
                value={item.pageId ?? ""}
                onChange={(event) =>
                  onChange({ pageId: event.target.value || null })
                }
                disabled={disabled}
                aria-label={`Pagina ${item.label}`}
                className="veele-input min-h-9 min-w-0 text-sm"
              >
                <option value="">Kies een pagina</option>
                {pages.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.navigationLabel || option.title} — {option.path}
                    {option.status === "draft" ? " (concept)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : item.linkType === "external" ? (
            <label className="grid gap-1 text-xs font-medium text-slate-500">
              HTTPS-URL
              <span className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-slate-400" />
                <input
                  type="url"
                  value={item.href ?? ""}
                  onChange={(event) => onChange({ href: event.target.value })}
                  placeholder="https://voorbeeld.nl"
                  maxLength={2_048}
                  disabled={disabled}
                  aria-label={`Externe URL ${item.label}`}
                  className="min-w-0 flex-1 border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-sm outline-none focus:border-cyan-600 focus:ring-0"
                />
              </span>
            </label>
          ) : (
            <div className="flex min-h-14 items-end">
              <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                <Link2 className="h-4 w-4" />
                Geen eigen bestemming
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {item.linkType === "external" && (
            <label className="mr-2 inline-flex items-center gap-2 text-xs text-slate-600">
              <CheckboxAdapter
                type="checkbox"
                checked={item.target === "blank"}
                onChange={(event) =>
                  onChange({
                    target: event.target.checked ? "blank" : "self",
                  })
                }
                disabled={disabled}
                className="h-4 w-4 rounded border-slate-300"
              />
              Nieuw venster
            </label>
          )}
          <label className="mr-2 inline-flex items-center gap-2 text-xs text-slate-600">
            <CheckboxAdapter
              type="checkbox"
              checked={item.isVisible}
              onChange={(event) =>
                onChange({ isVisible: event.target.checked })
              }
              disabled={disabled}
              className="h-4 w-4 rounded border-slate-300"
            />
            Zichtbaar
          </label>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onMoveUp}
            disabled={disabled || !canMoveUp}
            aria-label={`${item.label} omhoog`}
          >
            <ChevronUp />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onMoveDown}
            disabled={disabled || !canMoveDown}
            aria-label={`${item.label} omlaag`}
          >
            <ChevronDown />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`${item.label} verwijderen`}
          >
            <Trash2 className="text-red-600" />
          </Button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-0 lg:pl-8">
        {page?.status === "draft" && (
          <Badge variant="outline" className="border-amber-300 text-amber-800">
            Conceptpagina blokkeert publicatie
          </Badge>
        )}
        {!nested && onAddChild && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAddChild}
            disabled={disabled}
          >
            <Plus />
            Submenu
          </Button>
        )}
      </div>
    </div>
  );
}

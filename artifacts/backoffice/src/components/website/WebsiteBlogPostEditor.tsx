"use client";

import type {
  WebsiteBlogCategoryDraftItem,
  WebsiteBlogPostDetail,
  WebsiteBlogTagDraftItem,
  WebsiteRichTextDocument,
} from "@workspace/db";
import { Archive, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  archiveWebsiteBlogPostAction,
  createWebsiteBlogPostAction,
  publishWebsiteBlogPostAction,
  updateWebsiteBlogPostAction,
} from "@/app/actions/website";
import { Button } from "@/components/ui/button";
import { WebsiteRichTextEditor } from "./WebsiteRichTextEditor";

type TipTapDocument = Extract<WebsiteRichTextDocument, { schemaVersion: 2 }>;

const EMPTY_DOCUMENT: TipTapDocument = {
  type: "doc",
  schemaVersion: 2,
  content: [{ type: "paragraph", content: [] }],
};

type Props = {
  siteId: string;
  siteAuthoringRevision: number;
  defaultLocale: string;
  categories: WebsiteBlogCategoryDraftItem[];
  tags: WebsiteBlogTagDraftItem[];
  post?: WebsiteBlogPostDetail;
  canWrite: boolean;
  canPublish: boolean;
};

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 180);
}

function asEditorDocument(
  value: WebsiteRichTextDocument | undefined,
): TipTapDocument {
  if (value?.schemaVersion === 2) return value;
  return EMPTY_DOCUMENT;
}

export function WebsiteBlogPostEditor({
  siteId,
  siteAuthoringRevision,
  defaultLocale,
  categories,
  tags,
  post,
  canWrite,
  canPublish,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [revision, setRevision] = useState(siteAuthoringRevision);
  const [postRevision, setPostRevision] = useState(
    post?.authoringRevision ?? 1,
  );
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [locale, setLocale] = useState(post?.locale ?? defaultLocale);
  const [body, setBody] = useState<TipTapDocument>(
    asEditorDocument(post?.body),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const taxonomy = useMemo(
    () => ({
      categories: categories.filter(
        (item) => item.isActive && item.locale === locale,
      ),
      tags: tags.filter((item) => item.isActive && item.locale === locale),
    }),
    [categories, locale, tags],
  );

  function feedback() {
    setMessage(null);
    setError(null);
  }

  function save(formData: FormData) {
    feedback();
    const draft = {
      locale,
      title,
      slug,
      excerpt: String(formData.get("excerpt") ?? ""),
      body,
      categoryId: String(formData.get("categoryId") ?? "") || null,
      tagIds: formData.getAll("tagIds").map(String),
      seo: {
        title: String(formData.get("seoTitle") ?? ""),
        description: String(formData.get("seoDescription") ?? ""),
        canonicalPath:
          String(formData.get("canonicalPath") ?? "")
            .trim()
            .toLowerCase() || null,
        socialImageMediaId: post?.seo.socialImageMediaId ?? null,
        socialImageUrl:
          String(formData.get("socialImageUrl") ?? "").trim() || null,
        indexable: formData.get("indexable") === "on",
      },
    };
    startTransition(async () => {
      const result = post
        ? await updateWebsiteBlogPostAction({
            siteId,
            expectedAuthoringRevision: revision,
            postId: post.id,
            expectedPostRevision: postRevision,
            post: draft,
          })
        : await createWebsiteBlogPostAction({
            siteId,
            expectedAuthoringRevision: revision,
            post: draft,
          });
      if (!result.success || !result.data) {
        setError(
          result.success
            ? "De blogwijziging gaf geen resultaat terug."
            : result.message,
        );
        return;
      }
      if ("postAuthoringRevision" in result.data) {
        setPostRevision(result.data.postAuthoringRevision);
        setRevision(result.data.authoringRevision);
        setDirty(false);
        setMessage(
          result.data.changed
            ? "Concept opgeslagen. Een eerder gepubliceerd bericht staat nu opnieuw op concept."
            : "Er waren geen wijzigingen.",
        );
        router.refresh();
      } else {
        router.push(`/website/blog/${result.data.id}`);
        router.refresh();
      }
    });
  }

  function publish() {
    if (!post || !window.confirm("Dit blogbericht expliciet publiceren?"))
      return;
    if (dirty) {
      setError("Sla de huidige wijzigingen eerst als concept op.");
      return;
    }
    feedback();
    startTransition(async () => {
      const result = await publishWebsiteBlogPostAction({
        siteId,
        expectedAuthoringRevision: revision,
        postId: post.id,
        expectedPostRevision: postRevision,
      });
      if (!result.success || !result.data) {
        setError(
          result.success
            ? "De publicatie gaf geen resultaat terug."
            : result.message,
        );
        return;
      }
      setRevision(result.data.authoringRevision);
      setPostRevision(result.data.postAuthoringRevision);
      setMessage(
        "Bericht is publiceerbaar. Bereid nog een immutable websitepublicatie voor om het live te zetten.",
      );
      router.refresh();
    });
  }

  function archive() {
    if (!post || !window.confirm("Dit blogbericht archiveren?")) return;
    feedback();
    startTransition(async () => {
      const result = await archiveWebsiteBlogPostAction({
        siteId,
        expectedAuthoringRevision: revision,
        postId: post.id,
        expectedPostRevision: postRevision,
      });
      if (!result.success || !result.data) {
        setError(
          result.success
            ? "Archiveren gaf geen resultaat terug."
            : result.message,
        );
        return;
      }
      router.push("/website/blog");
      router.refresh();
    });
  }

  return (
    <form
      action={save}
      className="veele-card space-y-7"
      onChange={() => setDirty(true)}
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)]">
        <div className="space-y-5">
          <input
            aria-label="Titel"
            required
            maxLength={180}
            value={title}
            disabled={!canWrite || isPending}
            placeholder="Titel van het blogbericht"
            className="w-full border-0 border-b border-slate-200 bg-transparent px-1 py-3 text-3xl font-semibold text-slate-950 outline-none placeholder:text-slate-300 focus:border-cyan-600"
            onChange={(event) => {
              const nextTitle = event.target.value;
              setTitle(nextTitle);
              if (!post) setSlug(slugify(nextTitle));
            }}
          />
          <textarea
            name="excerpt"
            required
            maxLength={500}
            rows={3}
            defaultValue={post?.excerpt ?? ""}
            disabled={!canWrite || isPending}
            placeholder="Korte introductie voor overzicht, feed en metadata"
            className="w-full resize-y border-0 border-b border-slate-200 bg-transparent px-1 py-3 text-base leading-7 text-slate-700 outline-none focus:border-cyan-600"
          />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Inhoud
            </p>
            <WebsiteRichTextEditor
              value={body}
              onChange={(value) => {
                setBody(value);
                setDirty(true);
              }}
              disabled={!canWrite || isPending}
              ariaLabel="Bloginhoud"
              placeholder="Schrijf het blogbericht…"
            />
          </div>
        </div>

        <aside className="space-y-5">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Taal
            <input
              value={locale}
              required
              pattern="[a-z]{2}-[A-Z]{2}"
              disabled={!canWrite || isPending}
              onChange={(event) => setLocale(event.target.value)}
              className="border-0 border-b border-slate-200 bg-transparent px-1 py-2 outline-none focus:border-cyan-600"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Slug
            <input
              value={slug}
              required
              pattern="[a-z0-9][a-z0-9-]*"
              disabled={!canWrite || isPending}
              onChange={(event) => setSlug(event.target.value)}
              className="border-0 border-b border-slate-200 bg-transparent px-1 py-2 font-mono outline-none focus:border-cyan-600"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Categorie
            <select
              name="categoryId"
              defaultValue={post?.categoryId ?? ""}
              disabled={!canWrite || isPending}
              className="border-0 border-b border-slate-200 bg-transparent px-1 py-2 outline-none focus:border-cyan-600"
            >
              <option value="">Geen categorie</option>
              {taxonomy.categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Tags</legend>
            {taxonomy.tags.length === 0 ? (
              <p className="text-sm text-slate-500">Geen actieve tags.</p>
            ) : (
              taxonomy.tags.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    name="tagIds"
                    value={item.id}
                    defaultChecked={post?.tagIds.includes(item.id)}
                    disabled={!canWrite || isPending}
                  />
                  {item.name}
                </label>
              ))
            )}
          </fieldset>
        </aside>
      </div>

      <section className="grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          SEO-titel
          <input
            name="seoTitle"
            required
            maxLength={70}
            defaultValue={post?.seo.title ?? title.slice(0, 70)}
            disabled={!canWrite || isPending}
            className="border-0 border-b border-slate-200 bg-transparent px-1 py-2 outline-none focus:border-cyan-600"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Meta-omschrijving
          <input
            name="seoDescription"
            required
            maxLength={170}
            defaultValue={post?.seo.description ?? post?.excerpt ?? ""}
            disabled={!canWrite || isPending}
            className="border-0 border-b border-slate-200 bg-transparent px-1 py-2 outline-none focus:border-cyan-600"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Canonical pad
          <input
            name="canonicalPath"
            maxLength={500}
            pattern="/(?:[a-z0-9_-]+(?:/[a-z0-9_-]+)*)?"
            defaultValue={post?.seo.canonicalPath ?? ""}
            disabled={!canWrite || isPending}
            placeholder="/blog/ander-bericht"
            className="border-0 border-b border-slate-200 bg-transparent px-1 py-2 outline-none focus:border-cyan-600"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Social-afbeelding
          <input
            name="socialImageUrl"
            type="url"
            defaultValue={post?.seo.socialImageUrl ?? ""}
            disabled={!canWrite || isPending}
            placeholder="https://cdn.voorbeeld.nl/social/blog.jpg"
            className="border-0 border-b border-slate-200 bg-transparent px-1 py-2 outline-none focus:border-cyan-600"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            name="indexable"
            type="checkbox"
            defaultChecked={post?.seo.indexable ?? true}
            disabled={!canWrite || isPending}
          />
          Zoekmachines mogen dit bericht indexeren
        </label>
      </section>

      <div aria-live="polite" className="min-h-5 text-sm">
        {error ? <p className="text-red-700">{error}</p> : null}
        {message ? <p className="text-emerald-700">{message}</p> : null}
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        {post && post.status !== "archived" && canWrite ? (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={archive}
          >
            <Archive className="mr-2 h-4 w-4" />
            Archiveren
          </Button>
        ) : null}
        {canWrite ? (
          <Button type="submit" variant="outline" disabled={isPending}>
            {isPending ? "Bezig…" : post ? "Concept opslaan" : "Concept maken"}
          </Button>
        ) : null}
        {post?.status === "draft" && canPublish ? (
          <Button
            type="button"
            disabled={isPending || dirty}
            title={
              dirty
                ? "Sla de huidige wijzigingen eerst als concept op"
                : undefined
            }
            onClick={publish}
          >
            <Send className="mr-2 h-4 w-4" />
            Expliciet publiceren
          </Button>
        ) : null}
      </div>
    </form>
  );
}

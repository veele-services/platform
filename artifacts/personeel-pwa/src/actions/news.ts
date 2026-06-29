"use server";

import { db } from "@workspace/db";
import {
  newsPostsTable,
  newsPostTargetsTable,
  personnelTable,
  type NewsTargetType,
} from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

export type PersonnelNewsPost = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readTime: string;
  image: string;
  contentHtml: string | null;
  body: string[];
};

const FALLBACK_IMAGE =
  "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.82), transparent 25%), linear-gradient(135deg, #18BDB8 0%, #0F6B89 52%, #081D3A 100%)";

function formatDate(value: Date): string {
  return value.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function estimateReadTime(html: string): string {
  const words = html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 180))} min`;
}

function visibleForPersonnel(
  targets: Array<{ targetType: NewsTargetType; targetId: string | null }>,
  personnelId: string,
  sectorId: string | null,
): boolean {
  return targets.some((target) => {
    if (target.targetType === "all_personnel") return true;
    if (target.targetType === "personnel") return target.targetId === personnelId;
    if (target.targetType === "sector") return Boolean(sectorId && target.targetId === sectorId);
    return false;
  });
}

function firstParagraph(html: string): string[] {
  const text = html
    .replace(/<\/(p|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return text.length ? text : ["Geen berichttekst beschikbaar."];
}

export async function listPersonnelNewsPosts(): Promise<PersonnelNewsPost[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const [personnel] = await db
    .select({
      id: personnelTable.id,
      sectorId: personnelTable.sectorId,
    })
    .from(personnelTable)
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  if (!personnel) return [];

  const posts = await db
    .select({
      id: newsPostsTable.id,
      slug: newsPostsTable.slug,
      title: newsPostsTable.title,
      excerpt: newsPostsTable.excerpt,
      contentHtml: newsPostsTable.contentHtml,
      heroImageUrl: newsPostsTable.heroImageUrl,
      publishAt: newsPostsTable.publishAt,
      publishedAt: newsPostsTable.publishedAt,
      createdAt: newsPostsTable.createdAt,
    })
    .from(newsPostsTable)
    .where(eq(newsPostsTable.status, "published"))
    .orderBy(desc(newsPostsTable.publishedAt), desc(newsPostsTable.createdAt));

  if (posts.length === 0) return [];

  const targets = await db
    .select({
      postId: newsPostTargetsTable.postId,
      targetType: newsPostTargetsTable.targetType,
      targetId: newsPostTargetsTable.targetId,
    })
    .from(newsPostTargetsTable)
    .where(inArray(newsPostTargetsTable.postId, posts.map((post) => post.id)));

  const targetMap = new Map<string, Array<{ targetType: NewsTargetType; targetId: string | null }>>();
  for (const target of targets) {
    const list = targetMap.get(target.postId) ?? [];
    list.push({ targetType: target.targetType, targetId: target.targetId ?? null });
    targetMap.set(target.postId, list);
  }

  const now = Date.now();

  return posts
    .filter((post) => {
      const publishTime = (post.publishedAt ?? post.publishAt ?? post.createdAt).getTime();
      if (publishTime > now) return false;
      return visibleForPersonnel(targetMap.get(post.id) ?? [], personnel.id, personnel.sectorId ?? null);
    })
    .map((post) => ({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt ?? firstParagraph(post.contentHtml)[0] ?? "",
      category: "Nieuws",
      date: formatDate(post.publishedAt ?? post.publishAt ?? post.createdAt),
      readTime: estimateReadTime(post.contentHtml),
      image: post.heroImageUrl ? `url("${post.heroImageUrl}")` : FALLBACK_IMAGE,
      contentHtml: post.contentHtml,
      body: firstParagraph(post.contentHtml),
    }));
}

export async function getPersonnelNewsPost(slug: string): Promise<PersonnelNewsPost | null> {
  const posts = await listPersonnelNewsPosts();
  return posts.find((post) => post.slug === slug) ?? null;
}

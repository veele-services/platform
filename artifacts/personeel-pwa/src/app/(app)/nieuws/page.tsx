import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Newspaper } from "lucide-react";
import { listPersonnelNewsPosts, type PersonnelNewsPost } from "@/actions/news";
import { MobilePageShell } from "@/components/MobilePageShell";

export const dynamic = "force-dynamic";

const clampTwoLines = {
  display:           "-webkit-box",
  WebkitLineClamp:   2,
  WebkitBoxOrient:   "vertical",
  overflow:          "hidden",
} as const;

function HeroNewsCard({ post }: { post: PersonnelNewsPost }) {
  return (
    <Link
      href={`/nieuws/${post.slug}`}
      className="relative h-[218px] w-[84vw] max-w-[360px] shrink-0 snap-center overflow-hidden rounded-[24px] bg-white shadow-sm active:scale-[0.99]"
      style={{ boxShadow: "0 18px 38px rgba(8,29,58,0.13)" }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0) 20%, rgba(255,255,255,0.74) 68%, #FFFFFF 100%), ${post.image}`,
        }}
      />
      <div className="absolute inset-x-0 bottom-0 p-4 pr-14">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide"
            style={{ backgroundColor: "rgba(0,183,179,0.12)", color: "var(--color-accent)" }}
          >
            {post.category}
          </span>
          <span className="text-[11px] font-bold" style={{ color: "var(--color-secondary)" }}>
            {post.date}
          </span>
        </div>
        <h2
          className="text-[18px] font-black leading-tight"
          style={{ ...clampTwoLines, color: "var(--color-primary)" }}
        >
          {post.title}
        </h2>
        <p
          className="mt-1 text-[13px] leading-snug"
          style={{ ...clampTwoLines, color: "var(--color-secondary)" }}
        >
          {post.excerpt}
        </p>
      </div>
      <span
        className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <ArrowRight size={18} strokeWidth={2.5} />
      </span>
    </Link>
  );
}

function NewsListItem({ post }: { post: PersonnelNewsPost }) {
  return (
    <Link
      href={`/nieuws/${post.slug}`}
      className="flex items-center gap-3 rounded-[18px] border bg-white p-3 shadow-sm active:scale-[0.99]"
      style={{ borderColor: "var(--color-border)" }}
    >
      <span
        className="h-16 w-16 shrink-0 rounded-2xl"
        style={{ backgroundImage: post.image }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[11px] font-bold" style={{ color: "var(--color-secondary)" }}>
          <span>{post.category}</span>
          <span>-</span>
          <span>{post.date}</span>
        </span>
        <span
          className="mt-1 block text-sm font-black leading-tight"
          style={{ ...clampTwoLines, color: "var(--color-primary)" }}
        >
          {post.title}
        </span>
        <span
          className="mt-1 block text-xs leading-snug"
          style={{ ...clampTwoLines, color: "var(--color-secondary)" }}
        >
          {post.excerpt}
        </span>
      </span>
      <ChevronRight size={19} style={{ color: "var(--color-secondary)" }} />
    </Link>
  );
}

export default async function NieuwsPage() {
  const posts = await listPersonnelNewsPosts();
  const heroPosts = posts.slice(0, 3);
  const latestPosts = posts.slice(0, 10);
  const hasMore = posts.length > 10;

  return (
    <MobilePageShell
      title="Nieuws"
      subtitle="Updates en berichten voor medewerkers."
    >

      {posts.length === 0 ? (
        <div className="rounded-[22px] bg-white px-5 py-8 text-center shadow-sm">
          <Newspaper size={34} className="mx-auto mb-3" style={{ color: "var(--color-muted-fg)" }} />
          <h2 className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
            Nog geen nieuwsberichten
          </h2>
          <p className="mx-auto mt-1 max-w-[300px] text-[13px] leading-5" style={{ color: "var(--color-secondary)" }}>
            Gepubliceerde berichten uit de backoffice verschijnen hier zodra ze aan jou, je sector of alle medewerkers gericht zijn.
          </p>
        </div>
      ) : (
        <section className="-mx-3.5 overflow-x-auto px-3.5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex snap-x snap-mandatory gap-3">
            {heroPosts.map((post) => (
              <HeroNewsCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      )}

      {posts.length > 0 ? (
      <section className="mt-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
            Laatste berichten
          </h2>
          <span className="text-xs font-bold" style={{ color: "var(--color-secondary)" }}>
            {latestPosts.length} van {posts.length}
          </span>
        </div>

        <div className="space-y-2.5">
          {latestPosts.map((post) => (
            <NewsListItem key={post.slug} post={post} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-white opacity-50"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            aria-label="Vorige pagina"
            disabled
          >
            <ChevronLeft size={18} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            className="h-10 min-w-10 rounded-2xl px-3 text-sm font-black text-white"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            1
          </button>
          <button
            type="button"
            className="h-10 min-w-10 rounded-2xl border bg-white px-3 text-sm font-black opacity-50"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            disabled
          >
            2
          </button>
          <button
            type="button"
            className={`flex h-10 w-10 items-center justify-center rounded-2xl border bg-white ${hasMore ? "" : "opacity-50"}`}
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            aria-label="Volgende pagina"
            disabled={!hasMore}
          >
            <ChevronRight size={18} strokeWidth={2.4} />
          </button>
        </div>
      </section>
      ) : null}
    </MobilePageShell>
  );
}

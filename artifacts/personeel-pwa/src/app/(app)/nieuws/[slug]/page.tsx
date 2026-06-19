import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getMockNewsPost } from "@/lib/mock-news";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function NieuwsDetailPage({ params }: Props) {
  const { slug } = await params;
  const post = getMockNewsPost(slug);

  if (!post) notFound();

  return (
    <article className="min-h-screen bg-[#F6F8FB] pb-8">
      <div
        className="relative h-[250px] overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0) 20%, rgba(255,255,255,0.76) 70%, #F6F8FB 100%), ${post.image}`,
        }}
      >
        <Link
          href="/nieuws"
          className="absolute left-3.5 top-3.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm"
          aria-label="Terug naar nieuws"
          style={{ color: "var(--color-primary)" }}
        >
          <ChevronLeft size={21} strokeWidth={2.5} />
        </Link>

        <div className="absolute inset-x-0 bottom-0 px-4 pb-5">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide"
              style={{ backgroundColor: "rgba(0,183,179,0.12)", color: "var(--color-accent)" }}
            >
              {post.category}
            </span>
            <span className="text-[12px] font-bold" style={{ color: "var(--color-secondary)" }}>
              {post.date} - {post.readTime}
            </span>
          </div>
          <h1 className="text-[28px] font-black leading-tight tracking-tight" style={{ color: "var(--color-primary)" }}>
            {post.title}
          </h1>
        </div>
      </div>

      <div className="px-4">
        <div className="-mt-1 rounded-[24px] border bg-white p-4 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-base font-semibold leading-relaxed" style={{ color: "var(--color-primary)" }}>
            {post.excerpt}
          </p>
        </div>

        <div className="mt-4 space-y-4 rounded-[24px] border bg-white p-4 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
          {post.body.map((paragraph) => (
            <p key={paragraph} className="text-[15px] leading-7" style={{ color: "var(--color-primary)" }}>
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </article>
  );
}

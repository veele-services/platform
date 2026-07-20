import Link from "next/link";
import { ArrowDown, ArrowRight, Check, MapPin, Sparkles } from "lucide-react";
import { getPageTemplate, type SitePage } from "@/lib/site";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServiceVisual } from "./service-visual";
import { MotionReveal } from "./motion-reveal";

function kindFor(slug: string): "schoonmaak" | "beveiliging" | "facilitair" | "algemeen" {
  if (slug.startsWith("/schoonmaak")) return "schoonmaak";
  if (slug.startsWith("/beveiliging")) return "beveiliging";
  if (slug.startsWith("/facilitair")) return "facilitair";
  return "algemeen";
}

function primaryHref(page: SitePage) {
  if (page.slug === "/portaal") return "/contact";
  if (page.slug === "/werken-bij") return "#contactformulier";
  if (page.slug === "/contact") return "#contactformulier";
  if (page.slug === "/offerte") return "#contactformulier";
  return "/offerte";
}

export function Hero({ page }: { page: SitePage }) {
  const home = page.slug === "/";
  const template = getPageTemplate(page);
  const contextLabel =
    template === "local"
      ? "Actief in de regio"
      : template === "conversion"
        ? "Persoonlijk contact"
        : template === "editorial"
          ? "Kennis & praktijk"
          : "Veele Services";

  return (
    <section className="relative isolate overflow-hidden bg-[var(--navy-950)] pt-[5.25rem] text-white">
      <div className="absolute inset-0 -z-10 opacity-90 [background:radial-gradient(circle_at_76%_32%,rgba(41,211,194,.16),transparent_24%),radial-gradient(circle_at_7%_12%,rgba(10,49,84,.96),transparent_39%)]" />
      <div className="absolute inset-0 -z-10 opacity-[.14] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(100deg,black,transparent_72%)]" />
      <div className="pointer-events-none absolute left-[4%] top-40 -z-10 h-px w-24 bg-gradient-to-r from-transparent to-[var(--aqua)]/70" />
      <div className={`container-shell relative grid items-center gap-11 py-14 sm:py-16 lg:grid-cols-[1.04fr_.96fr] lg:gap-14 ${home ? "min-h-[43rem] pb-24 lg:min-h-[47rem]" : "min-h-[36rem] lg:min-h-[39rem]"}`}>
        <MotionReveal className="relative z-10">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>{page.eyebrow}</Badge>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-white/60">
              <Sparkles aria-hidden="true" className="size-3 text-brand-aqua" />
              {contextLabel}
            </span>
          </div>
          <h1 className={`mt-6 max-w-[15ch] text-balance font-extrabold leading-[.97] tracking-[-.06em] ${home ? "text-[clamp(3rem,7vw,5.65rem)]" : "text-[clamp(2.7rem,6vw,4.85rem)]"}`}>
            {page.h1}
          </h1>
          <p className="mt-6 max-w-[40rem] border-l border-[var(--aqua)]/50 pl-5 text-base leading-7 text-white/68 sm:text-lg sm:leading-8">{page.intro}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg">
              <Link href={primaryHref(page)}>{page.primary_cta}<ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover/button:translate-x-0.5" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={page.slug === "/contact" ? "/portaal" : "/contact"}>{page.secondary_cta}</Link>
            </Button>
          </div>
          {home && (
            <a href="#inhoud" className="mt-9 inline-flex items-center gap-2 rounded text-xs font-semibold text-white/50 transition-colors hover:text-white">
              Ontdek onze aanpak<ArrowDown aria-hidden="true" className="size-3.5" />
            </a>
          )}
        </MotionReveal>
        <MotionReveal delay={0.1} className="relative">
          <div className="absolute -inset-6 -z-10 rounded-full bg-[var(--aqua)]/10 blur-3xl" />
          <ServiceVisual kind={kindFor(page.slug)} className={home ? "min-h-[390px] lg:min-h-[470px]" : "min-h-[350px] lg:min-h-[410px]"} />
          {page.group === "Lokale SEO" && (
            <div className="absolute -bottom-4 left-4 flex items-center gap-3 rounded-2xl border border-white/15 bg-[var(--navy-900)]/95 px-4 py-3 shadow-2xl backdrop-blur sm:left-[-1rem]">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--aqua)] text-brand-navy"><MapPin aria-hidden="true" className="size-4" /></span>
              <span><span className="block text-[10px] uppercase tracking-[.14em] text-white/45">Werkgebied</span><span className="mt-0.5 block text-sm font-bold">{page.name.replace("Dienstverlening ", "")}</span></span>
            </div>
          )}
        </MotionReveal>
      </div>
      <div className={`container-shell relative z-10 ${home ? "-mb-11" : "pb-7"}`}>
        <div className="grid overflow-hidden rounded-[1.35rem] border border-white/10 bg-[var(--navy-900)]/95 shadow-[0_24px_65px_rgba(0,0,0,.28)] backdrop-blur sm:grid-cols-2 lg:grid-cols-4">
          {page.proof.slice(0, 4).map((item) => (
            <div key={item} className="group flex min-h-20 items-center gap-3 border-white/10 px-5 py-4 max-sm:border-b sm:[&:nth-child(odd)]:border-r lg:border-r lg:last:border-r-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--aqua)]/20 bg-[var(--aqua)]/10 text-brand-aqua transition-colors group-hover:bg-[var(--aqua)] group-hover:text-brand-navy"><Check aria-hidden="true" className="size-4" /></span>
              <p className="text-xs font-semibold leading-5 text-white/74">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

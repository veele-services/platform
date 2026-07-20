import Link from "next/link";
import { ArrowDown, ArrowRight, Check, MapPin } from "lucide-react";
import type { SitePage } from "@/lib/site";
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

  return (
    <section className="relative isolate overflow-hidden bg-[var(--navy-950)] pt-[5.25rem] text-white">
      <div className="absolute inset-0 -z-10 opacity-80 [background:radial-gradient(circle_at_76%_35%,rgba(41,211,194,.17),transparent_23%),radial-gradient(circle_at_15%_0%,rgba(10,49,84,.9),transparent_38%)]" />
      <div className="absolute inset-0 -z-10 opacity-[.16] [background-image:linear-gradient(rgba(255,255,255,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_right,black,transparent_65%)]" />
      <div className={`container-shell relative grid items-center gap-10 py-16 lg:grid-cols-[1.08fr_.92fr] lg:gap-16 ${home ? "min-h-[43rem] pb-24 lg:min-h-[48rem]" : "min-h-[39rem] lg:min-h-[42rem]"}`}>
        <MotionReveal className="relative z-10">
          <Badge>{page.eyebrow}</Badge>
          <h1 className="mt-6 max-w-[14ch] text-balance text-[clamp(2.8rem,7vw,5.5rem)] font-extrabold leading-[.96] tracking-[-.065em]">
            {page.h1}
          </h1>
          <p className="mt-7 max-w-[42rem] text-base leading-8 text-white/68 sm:text-lg">{page.intro}</p>
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
          <ServiceVisual kind={kindFor(page.slug)} className="min-h-[390px] lg:min-h-[470px]" />
          {page.group === "Lokale SEO" && (
            <div className="absolute -bottom-4 left-4 flex items-center gap-3 rounded-2xl border border-white/15 bg-[var(--navy-900)]/95 px-4 py-3 shadow-2xl backdrop-blur sm:left-[-1rem]">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--aqua)] text-brand-navy"><MapPin aria-hidden="true" className="size-4" /></span>
              <span><span className="block text-[10px] uppercase tracking-[.14em] text-white/45">Werkgebied</span><span className="mt-0.5 block text-sm font-bold">{page.name.replace("Dienstverlening ", "")}</span></span>
            </div>
          )}
        </MotionReveal>
      </div>
      <div className={`container-shell relative z-10 ${home ? "-mb-12" : "pb-8"}`}>
        <div className="grid overflow-hidden rounded-2xl border border-white/10 bg-[var(--navy-900)] shadow-[0_24px_65px_rgba(0,0,0,.28)] sm:grid-cols-2 lg:grid-cols-4">
          {page.proof.slice(0, 4).map((item) => (
            <div key={item} className="flex min-h-20 items-center gap-3 border-white/10 px-5 py-4 max-sm:border-b sm:[&:nth-child(odd)]:border-r lg:border-r lg:last:border-r-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--aqua)]/20 bg-[var(--aqua)]/10 text-brand-aqua"><Check aria-hidden="true" className="size-4" /></span>
              <p className="text-xs font-semibold leading-5 text-white/72">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

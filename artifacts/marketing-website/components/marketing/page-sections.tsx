import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Building2,
  Check,
  Compass,
  Layers3,
  MapPin,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import {
  getPageTemplate,
  getRelatedPages,
  stripMarkup,
  type PageSection,
  type PageTemplate,
  type SitePage,
} from "@/lib/site";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MotionReveal } from "./motion-reveal";
import { LeadForm } from "./lead-form";
import { PortalShowcase } from "./portal-showcase";

const sectionIcons = [Sparkles, ShieldCheck, UsersRound, Building2, Layers3, Compass];

function SectionBullets({ bullets, editorial = false }: { bullets: string[]; editorial?: boolean }) {
  if (!bullets.length) return null;

  if (editorial) {
    return (
      <div className="mt-9 grid gap-3 sm:grid-cols-2">
        {bullets.map((bullet, index) => (
          <article key={bullet} className="group rounded-2xl border border-[var(--line)] bg-white p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--aqua)]/60 hover:shadow-[var(--shadow-sm)] motion-reduce:transform-none">
            <span className="text-[10px] font-extrabold uppercase tracking-[.15em] text-brand-aqua-deep">Inzicht {String(index + 1).padStart(2, "0")}</span>
            <h3 className="mt-3 font-bold leading-6 text-brand-navy">{stripMarkup(bullet)}</h3>
          </article>
        ))}
      </div>
    );
  }

  return (
    <ul className="mt-7 grid gap-3 sm:grid-cols-2">
      {bullets.map((bullet) => (
        <li key={bullet} className="flex items-start gap-3 rounded-xl border border-[var(--line)]/70 bg-white/80 p-4 text-sm leading-6 text-brand-slate">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--aqua-soft)] text-brand-aqua-deep"><Check aria-hidden="true" className="size-3" /></span>
          <span>{stripMarkup(bullet)}</span>
        </li>
      ))}
    </ul>
  );
}

function AbstractPanel({ index, template }: { index: number; template: PageTemplate }) {
  const Icon = template === "local" ? MapPin : template === "editorial" ? BookOpenText : template === "sector-detail" ? Building2 : sectionIcons[index % sectionIcons.length];

  return (
    <div aria-hidden="true" className="relative min-h-72 overflow-hidden rounded-[2rem] bg-[var(--navy-900)] p-6 text-white shadow-[var(--shadow-lg)] sm:min-h-80 sm:p-8">
      <div className="absolute inset-0 opacity-70 [background:radial-gradient(circle_at_80%_10%,rgba(41,211,194,.24),transparent_25%),linear-gradient(145deg,transparent_50%,rgba(255,255,255,.035)_50%)]" />
      <div className="absolute -bottom-20 -right-20 size-64 rounded-full border-[45px] border-white/[.045]" />
      <div className="relative flex h-full min-h-60 flex-col justify-between sm:min-h-64">
        <div className="flex items-start justify-between">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--aqua)] text-brand-navy"><Icon className="size-6" /></span>
          <span className="text-[10px] font-bold uppercase tracking-[.2em] text-white/55">0{index + 1}</span>
        </div>
        <div className="grid gap-3">
          <div className="h-2.5 w-4/5 rounded-full bg-white/20" />
          <div className="h-2.5 w-full rounded-full bg-white/12" />
          <div className="h-2.5 w-2/3 rounded-full bg-white/12" />
          <div className="mt-3 h-1 w-20 rounded-full bg-[var(--aqua)]" />
        </div>
      </div>
    </div>
  );
}

function ContentSection({ section, index, template }: { section: PageSection; index: number; template: PageTemplate }) {
  const editorial = template === "editorial" && index === 0;
  const hasBullets = section.bullets.length > 0;
  const reverse = index % 2 === 1;

  if (editorial) {
    return (
      <section className="section-pad bg-[var(--cloud)]">
        <div className="container-shell">
          <MotionReveal>
            <div className="max-w-3xl"><p className="eyebrow">Praktisch inzicht</p><h2 className="section-title">{section.heading}</h2>{section.body && <p className="section-copy">{stripMarkup(section.body)}</p>}</div>
          </MotionReveal>
          <MotionReveal delay={0.08}><SectionBullets bullets={section.bullets} editorial /></MotionReveal>
        </div>
      </section>
    );
  }

  return (
    <section className={`section-pad ${index % 2 === 0 ? "bg-white" : "bg-[var(--cloud)]"}`}>
      <div className={`container-shell grid items-center gap-10 lg:grid-cols-[.88fr_1.12fr] lg:gap-16 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
        <MotionReveal><AbstractPanel index={index} template={template} /></MotionReveal>
        <MotionReveal delay={0.08}>
          <p className="eyebrow">{index === 0 ? "Onze aanpak" : `Onderdeel ${String(index + 1).padStart(2, "0")}`}</p>
          <h2 className="section-title">{section.heading}</h2>
          {section.body && <p className="section-copy">{stripMarkup(section.body)}</p>}
          {hasBullets && <SectionBullets bullets={section.bullets} />}
        </MotionReveal>
      </div>
    </section>
  );
}

function RelatedGrid({ page }: { page: SitePage }) {
  const links = getRelatedPages(page);
  if (!links.length) return null;
  const template = getPageTemplate(page);
  const title = template === "home" ? "Specialisten in elke discipline, sterk onder één regie." : template === "local" ? "Bekijk wat we in uw regio kunnen organiseren." : "Bekijk ook deze mogelijkheden.";

  return (
    <section id="inhoud" className={`section-pad bg-white ${page.slug === "/" ? "pt-28 sm:pt-32" : ""}`}>
      <div className="container-shell">
        <MotionReveal>
          <p className="eyebrow">{template === "home" ? "Onze dienstverlening" : "Verder verkennen"}</p>
          <div className="mt-3 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <h2 className="section-title mt-0">{title}</h2>
            {template === "home" && <Button asChild variant="dark"><Link href="/diensten">Alle diensten<ArrowRight aria-hidden="true" className="size-4" /></Link></Button>}
          </div>
        </MotionReveal>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {links.map((item, index) => {
            const Icon = sectionIcons[index % sectionIcons.length];
            return (
              <MotionReveal key={item.href} delay={index * 0.05}>
                <Link href={item.href} className="group flex h-full min-h-64 flex-col rounded-[1.5rem] border border-[var(--line)] bg-white p-6 shadow-[0_12px_35px_rgba(3,20,38,.05)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-[var(--aqua)]/55 hover:shadow-[var(--shadow-sm)] motion-reduce:transform-none">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--aqua-soft)] text-brand-aqua-deep"><Icon aria-hidden="true" className="size-5" /></span>
                  <h3 className="mt-8 text-lg font-extrabold tracking-[-.02em] text-brand-navy">{item.name}</h3>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-brand-slate">{item.description}</p>
                  <span className="mt-auto flex items-center gap-2 pt-6 text-xs font-bold text-brand-aqua-deep">Meer informatie<ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-1" /></span>
                </Link>
              </MotionReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProofGrid({ page }: { page: SitePage }) {
  return (
    <section className="section-pad surface-grid bg-[var(--cloud)]">
      <div className="container-shell">
        <MotionReveal><div className="mx-auto max-w-3xl text-center"><p className="eyebrow">Duidelijk geregeld</p><h2 className="section-title mx-auto">Afspraken die houvast geven in de dagelijkse praktijk.</h2><p className="section-copy mx-auto">Van de eerste opname tot de uitvoering: u weet wat er gebeurt, wie aanspreekbaar is en hoe opvolging wordt georganiseerd.</p></div></MotionReveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {page.proof.slice(0, 4).map((item, index) => (
            <MotionReveal key={item} delay={index * 0.05}>
              <Card className="h-full bg-white/90"><CardContent><span className="flex size-10 items-center justify-center rounded-xl bg-[var(--navy-900)] text-brand-aqua"><Check aria-hidden="true" className="size-4" /></span><h3 className="mt-5 text-base font-bold leading-6">{item}</h3></CardContent></Card>
            </MotionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProcessSection({ page }: { page: SitePage }) {
  if (!page.process.length) return null;
  return (
    <section className="section-pad bg-[var(--navy-950)] text-white">
      <div className="container-shell">
        <MotionReveal><div className="max-w-3xl"><p className="eyebrow !text-brand-aqua">Van vraag naar uitvoering</p><h2 className="section-title">Een gecontroleerde start, stap voor stap.</h2></div></MotionReveal>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/10 md:grid-cols-3">
          {page.process.map(([title, body], index) => (
            <li key={title} className="relative bg-[var(--navy-900)] p-7 sm:p-8">
              <span className="text-[11px] font-black uppercase tracking-[.2em] text-brand-aqua">Stap {String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-7 text-xl font-extrabold">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-white/68">{body}</p>
              {index < page.process.length - 1 && <ArrowRight aria-hidden="true" className="absolute right-5 top-8 hidden size-4 text-white/25 md:block" />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FaqSection({ page }: { page: SitePage }) {
  if (!page.faqs.length) return null;
  return (
    <section className="section-pad bg-[var(--cloud)]">
      <div className="container-shell grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
        <MotionReveal><div className="lg:sticky lg:top-28"><p className="eyebrow">Veelgestelde vragen</p><h2 className="section-title">Vooraf helder, persoonlijk als het nodig is.</h2><p className="section-copy">Staat uw vraag er niet bij? Via contact brengen we u bij de juiste collega.</p></div></MotionReveal>
        <MotionReveal delay={0.08}><Accordion type="single" collapsible>{page.faqs.map(([question, answer], index) => <AccordionItem key={question} value={`item-${index}`}><AccordionTrigger>{question}</AccordionTrigger><AccordionContent>{answer}</AccordionContent></AccordionItem>)}</Accordion></MotionReveal>
      </div>
    </section>
  );
}

function FinalCta({ page }: { page: SitePage }) {
  return (
    <section className="bg-white py-6 sm:py-10">
      <div className="container-shell">
        <div className="relative overflow-hidden rounded-[2rem] bg-[var(--navy-900)] p-7 text-white shadow-[var(--shadow-lg)] sm:p-10 lg:p-12">
          <div className="absolute -right-20 -top-24 size-72 rounded-full border-[52px] border-white/[.04]" />
          <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div><p className="eyebrow !text-brand-aqua">Klaar voor de volgende stap?</p><h2 className="mt-4 max-w-3xl text-balance text-3xl font-extrabold tracking-[-.04em] sm:text-4xl">{page.cta_heading}</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-white/68 sm:text-base">{page.cta_body}</p></div>
            <Button asChild size="lg"><Link href={page.slug === "/offerte" ? "/contact" : "/offerte"}>{page.primary_cta}<ArrowRight aria-hidden="true" className="size-4" /></Link></Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PageSections({ page }: { page: SitePage }) {
  const template = getPageTemplate(page);
  const isForm = page.slug === "/contact" || page.slug === "/offerte" || page.slug === "/werken-bij";
  const showRelatedFirst = ["home", "services-overview", "sectors-overview"].includes(template);

  return (
    <>
      {showRelatedFirst && <RelatedGrid page={page} />}
      {!showRelatedFirst && <ProofGrid page={page} />}
      {page.slug === "/portaal" && <PortalShowcase />}
      {page.sections.map((section, index) => <ContentSection key={`${section.heading}-${index}`} section={section} index={index} template={template} />)}
      {!showRelatedFirst && <RelatedGrid page={page} />}
      <ProcessSection page={page} />
      {isForm && <div id="contactformulier"><LeadForm kind={page.slug === "/offerte" ? "offerte" : page.slug === "/werken-bij" ? "sollicitatie" : "contact"} /></div>}
      <FaqSection page={page} />
      <FinalCta page={page} />
    </>
  );
}

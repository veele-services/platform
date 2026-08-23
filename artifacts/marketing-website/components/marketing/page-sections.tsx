import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Building2,
  Check,
  Compass,
  FileCheck2,
  Layers3,
  MapPin,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
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

function TemplateVisual({ index, template }: { index: number; template: PageTemplate }) {
  const Icon = template === "local" ? MapPin : template === "editorial" ? BookOpenText : template === "sector-detail" ? Building2 : sectionIcons[index % sectionIcons.length];
  const label =
    template === "local"
      ? "Werkgebied"
      : template === "editorial"
        ? "Praktijknotitie"
        : template === "sector-detail"
          ? "Locatieprofiel"
          : template === "organization"
            ? "Samenwerking"
            : "Werkafspraak";

  return (
    <div aria-hidden="true" className="relative min-h-72 overflow-hidden rounded-[2rem] border border-[var(--navy-900)]/10 bg-[var(--navy-900)] p-5 text-white shadow-[var(--shadow-lg)] sm:min-h-[22rem] sm:p-7">
      <div className="absolute inset-0 opacity-80 [background:radial-gradient(circle_at_82%_8%,rgba(41,211,194,.22),transparent_24%),linear-gradient(145deg,transparent_48%,rgba(255,255,255,.035)_48.2%,transparent_48.6%)]" />
      <div className="relative flex h-full min-h-64 flex-col">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <span className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--aqua)] text-brand-navy"><Icon className="size-5" /></span>
            <span>
              <span className="block text-[9px] font-bold uppercase tracking-[.17em] text-white/40">Veele services</span>
              <span className="mt-0.5 block text-xs font-bold">{label}</span>
            </span>
          </span>
          <span className="text-[10px] font-bold tracking-[.2em] text-white/40">0{index + 1}</span>
        </div>

        {template === "local" ? (
          <div className="relative mt-5 flex-1 overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/[.045]">
            <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.14)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.14)_1px,transparent_1px)] [background-size:36px_36px]" />
            <div className="absolute left-[18%] top-[28%] h-px w-[58%] rotate-[18deg] bg-[var(--aqua)]/45" />
            <div className="absolute left-[28%] top-[63%] h-px w-[48%] -rotate-[21deg] bg-white/15" />
            {["left-[18%] top-[24%]", "right-[20%] top-[39%]", "left-[35%] bottom-[17%]"].map((position, markerIndex) => (
              <span key={position} className={`absolute ${position} flex size-8 items-center justify-center rounded-full border border-[var(--aqua)]/25 bg-[var(--navy-900)] text-brand-aqua shadow-xl`}>
                <span className={`rounded-full ${markerIndex === 1 ? "size-2.5 bg-[var(--aqua)]" : "size-1.5 bg-white/55"}`} />
              </span>
            ))}
          </div>
        ) : template === "editorial" ? (
          <div className="mt-5 flex flex-1 flex-col justify-between rounded-[1.4rem] border border-white/10 bg-white/[.045] p-5">
            <div className="flex items-start justify-between"><BookOpenText className="size-7 text-brand-aqua" /><span className="rounded-full border border-white/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-white/40">Inzicht</span></div>
            <div className="space-y-3">
              {[88, 96, 72, 44].map((width, row) => <div key={width} className={`h-1.5 rounded-full ${row === 3 ? "bg-[var(--aqua)]/65" : "bg-white/14"}`} style={{ width: `${width}%` }} />)}
            </div>
          </div>
        ) : (
          <div className="mt-5 grid flex-1 grid-cols-[.78fr_1.22fr] gap-3">
            <div className="flex flex-col justify-between rounded-[1.4rem] border border-white/10 bg-white/[.045] p-4">
              <Target className="size-6 text-brand-aqua" />
              <div className="space-y-2">
                <span className="block h-1.5 w-full rounded-full bg-white/14" />
                <span className="block h-1.5 w-2/3 rounded-full bg-white/10" />
              </div>
            </div>
            <div className="relative overflow-hidden rounded-[1.4rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,.1),rgba(255,255,255,.03))] p-4">
              <div className="absolute -right-12 -top-12 size-36 rounded-full border-[26px] border-[var(--aqua)]/[.08]" />
              <div className="relative flex h-full flex-col justify-between">
                <span className="ml-auto flex size-8 items-center justify-center rounded-full bg-[var(--aqua)] text-brand-navy"><Check className="size-4" /></span>
                <div className="space-y-3">
                  {[FileCheck2, Route, Check].map((ItemIcon, row) => (
                    <div key={row} className="flex items-center gap-2.5"><ItemIcon className={`size-3.5 ${row === 0 ? "text-brand-aqua" : "text-white/35"}`} /><span className={`h-1.5 rounded-full bg-white/14 ${row === 1 ? "w-4/5" : "w-full"}`} /></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-[9px] font-bold uppercase tracking-[.14em] text-white/35">
          <span>Van afspraak</span><span className="h-px flex-1 bg-white/10 mx-3" /><span>naar uitvoering</span>
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
        <MotionReveal className="min-w-0"><TemplateVisual index={index} template={template} /></MotionReveal>
        <MotionReveal className="min-w-0" delay={0.08}>
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
                <Link href={item.href} className={`group relative flex h-full min-h-64 flex-col overflow-hidden rounded-[1.65rem] border p-6 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-[var(--aqua)]/55 hover:shadow-[var(--shadow-sm)] motion-reduce:transform-none ${index === 0 && template === "home" ? "border-[var(--navy-900)] bg-[var(--navy-900)] text-white md:col-span-2 lg:col-span-1" : "border-[var(--line)] bg-white"}`}>
                  <span aria-hidden="true" className="absolute -right-8 -top-9 text-[7rem] font-black leading-none tracking-[-.08em] text-current opacity-[.035]">0{index + 1}</span>
                  <div className="relative flex items-center justify-between">
                    <span className={`flex size-11 items-center justify-center rounded-xl ${index === 0 && template === "home" ? "bg-[var(--aqua)] text-brand-navy" : "bg-[var(--aqua-soft)] text-brand-aqua-deep"}`}><Icon aria-hidden="true" className="size-5" /></span>
                    <span className={`text-[9px] font-black uppercase tracking-[.17em] ${index === 0 && template === "home" ? "text-white/35" : "text-brand-slate/55"}`}>Dienst 0{index + 1}</span>
                  </div>
                  <h3 className="relative mt-8 text-lg font-extrabold tracking-[-.025em]">{item.name}</h3>
                  <p className={`mt-3 line-clamp-3 text-sm leading-6 ${index === 0 && template === "home" ? "text-white/62" : "text-brand-slate"}`}>{item.description}</p>
                  <span className={`mt-auto flex items-center gap-2 pt-6 text-xs font-bold ${index === 0 && template === "home" ? "text-brand-aqua" : "text-brand-aqua-deep"}`}>Meer informatie<ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-1" /></span>
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
      <div className="container-shell grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-end lg:gap-16">
        <MotionReveal>
          <div>
            <p className="eyebrow">Duidelijk geregeld</p>
            <h2 className="section-title">Afspraken die houvast geven in de dagelijkse praktijk.</h2>
            <p className="section-copy">Van de eerste opname tot de uitvoering: u weet wat er gebeurt, wie aanspreekbaar is en hoe opvolging wordt georganiseerd.</p>
          </div>
        </MotionReveal>
        <div className="grid gap-3 sm:grid-cols-2">
          {page.proof.slice(0, 4).map((item, index) => (
            <MotionReveal key={item} delay={index * 0.05}>
              <article className={`relative flex min-h-40 h-full flex-col justify-between overflow-hidden rounded-[1.4rem] border p-5 shadow-[0_12px_30px_rgba(3,20,38,.045)] ${index === 0 ? "border-[var(--navy-900)] bg-[var(--navy-900)] text-white" : "border-[var(--line)] bg-white"}`}>
                <span className={`flex size-9 items-center justify-center rounded-xl ${index === 0 ? "bg-[var(--aqua)] text-brand-navy" : "bg-[var(--aqua-soft)] text-brand-aqua-deep"}`}><Check aria-hidden="true" className="size-4" /></span>
                <div className="mt-7 flex items-end justify-between gap-4">
                  <h3 className="text-sm font-bold leading-6">{item}</h3>
                  <span className={`shrink-0 text-[9px] font-black tracking-[.15em] ${index === 0 ? "text-white/65" : "text-brand-slate"}`}>0{index + 1}</span>
                </div>
              </article>
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
      <div className="container-shell grid gap-12 lg:grid-cols-[.72fr_1.28fr] lg:gap-20">
        <MotionReveal><div className="lg:sticky lg:top-28"><p className="eyebrow !text-brand-aqua">Van vraag naar uitvoering</p><h2 className="section-title">Een gecontroleerde start, stap voor stap.</h2><p className="mt-6 max-w-md text-sm leading-7 text-white/55">Een helder proces maakt ruimte voor aandacht op de locatie.</p></div></MotionReveal>
        <ol className="relative grid gap-3 before:absolute before:bottom-8 before:left-[1.15rem] before:top-8 before:w-px before:bg-white/10 sm:before:left-[1.4rem]">
          {page.process.map(([title, body], index) => (
            <li key={title} className="relative grid grid-cols-[2.4rem_1fr] gap-4 rounded-[1.4rem] border border-white/10 bg-white/[.035] p-4 transition-colors hover:bg-white/[.055] sm:grid-cols-[3rem_1fr] sm:gap-5 sm:p-5">
              <span className="relative z-10 flex size-9 items-center justify-center rounded-xl border border-[var(--aqua)]/25 bg-[var(--navy-950)] text-[10px] font-black tracking-[.12em] text-brand-aqua sm:size-11">0{index + 1}</span>
              <div>
                <span className="text-[9px] font-black uppercase tracking-[.18em] text-white/35">Stap {String(index + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 text-lg font-extrabold">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-white/64">{body}</p>
              </div>
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
        <MotionReveal><div className="lg:sticky lg:top-28"><p className="eyebrow">Veelgestelde vragen</p><h2 className="section-title">Vooraf helder, persoonlijk als het nodig is.</h2><p className="section-copy">Staat uw vraag er niet bij? Via contact brengen we u bij de juiste collega.</p><Button asChild variant="dark" className="mt-7"><Link href="/contact">Stel uw vraag<ArrowRight aria-hidden="true" className="size-4" /></Link></Button></div></MotionReveal>
        <MotionReveal delay={0.08}>
          <div className="overflow-hidden rounded-[1.6rem] border border-[var(--line)] bg-white px-5 shadow-[0_18px_50px_rgba(3,20,38,.06)] sm:px-7">
            <Accordion type="single" collapsible>{page.faqs.map(([question, answer], index) => <AccordionItem key={question} value={`item-${index}`} className="first:border-t-0"><AccordionTrigger><span className="flex gap-3"><span className="mt-0.5 text-[10px] font-black tracking-[.14em] text-brand-aqua-deep">0{index + 1}</span><span>{question}</span></span></AccordionTrigger><AccordionContent>{answer}</AccordionContent></AccordionItem>)}</Accordion>
          </div>
        </MotionReveal>
      </div>
    </section>
  );
}

function FinalCta({ page }: { page: SitePage }) {
  const ctaHref = page.slug === "/portaal" ? "/klant/login" : page.slug === "/offerte" ? "/contact" : "/offerte";

  return (
    <section className="bg-white py-7 sm:py-11">
      <div className="container-shell">
        <div className="relative overflow-hidden rounded-[2rem] bg-[var(--navy-900)] p-7 text-white shadow-[var(--shadow-lg)] sm:p-10 lg:p-12">
          <div className="absolute -right-20 -top-24 size-72 rounded-full border-[52px] border-white/[.045]" />
          <div className="absolute bottom-0 left-[55%] top-0 hidden w-px bg-gradient-to-b from-transparent via-white/10 to-transparent md:block" />
          <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto] md:gap-12">
            <div><p className="eyebrow !text-brand-aqua">Klaar voor de volgende stap?</p><h2 className="mt-4 max-w-3xl text-balance text-3xl font-semibold leading-tight tracking-[-.025em] sm:text-4xl">{page.cta_heading}</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-white/68 sm:text-base">{page.cta_body}</p></div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              <Button asChild size="lg"><Link href={ctaHref}>{page.primary_cta}<ArrowRight aria-hidden="true" className="size-4" /></Link></Button>
              <span className="text-[10px] font-semibold text-white/65">Persoonlijke opvolging van uw aanvraag</span>
            </div>
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
      {isForm && (
        <div id="contactformulier">
          <LeadForm
            kind={
              page.slug === "/offerte"
                ? "offerte"
                : page.slug === "/werken-bij"
                  ? "sollicitatie"
                  : "contact"
            }
          />
        </div>
      )}
      <FaqSection page={page} />
      <FinalCta page={page} />
    </>
  );
}

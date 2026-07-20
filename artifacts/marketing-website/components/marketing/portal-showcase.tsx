import { CalendarDays, ClipboardCheck, FileText, LockKeyhole, MessageSquareText } from "lucide-react";
import { MotionReveal } from "./motion-reveal";

const items = [
  { icon: MessageSquareText, label: "Meldingen", value: "Status volgen" },
  { icon: CalendarDays, label: "Planning", value: "Per locatie" },
  { icon: ClipboardCheck, label: "Kwaliteit", value: "Inzichtelijk" },
  { icon: FileText, label: "Documenten", value: "Geordend" },
];

export function PortalShowcase() {
  return (
    <section className="section-pad overflow-hidden bg-white">
      <div className="container-shell grid items-center gap-12 lg:grid-cols-[.75fr_1.25fr] lg:gap-16">
        <MotionReveal>
          <p className="eyebrow">Portaalconcept</p>
          <h2 className="section-title">Van losse berichten naar één rustig overzicht.</h2>
          <p className="section-copy">Deze marketingdemo verbeeldt hoe planning, meldingen, rapportages en documenten in een afzonderlijk beveiligde omgeving kunnen samenkomen.</p>
          <div className="mt-7 flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--cloud)] p-4 text-sm leading-6 text-brand-slate">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-aqua-deep" />
            <p><strong className="text-brand-ink">Veilig gescheiden.</strong> Dit is geen productie-login en bevat geen accounts of klantgegevens.</p>
          </div>
        </MotionReveal>
        <MotionReveal delay={0.1}>
          <div className="relative rounded-[2rem] border border-slate-200 bg-[var(--navy-950)] p-3 shadow-[var(--shadow-lg)] sm:p-5">
            <div className="absolute -right-12 -top-12 -z-10 size-48 rounded-full bg-[var(--aqua)]/15 blur-3xl" />
            <div className="overflow-hidden rounded-[1.25rem] bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7">
                <div>
                  <p className="text-xs font-semibold text-slate-600">Conceptomgeving</p>
                  <p className="mt-1 text-base font-extrabold text-brand-navy">Locatieoverzicht</p>
                </div>
                <span className="rounded-full bg-[var(--aqua-soft)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-brand-navy">Demo</span>
              </div>
              <div className="grid gap-3 bg-slate-50/70 p-4 sm:grid-cols-2 sm:p-6">
                {items.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_25px_rgba(3,20,38,.045)]">
                    <div className="flex items-start justify-between"><Icon aria-hidden="true" className="size-5 text-brand-aqua-deep" /><span className="size-2 rounded-full bg-[var(--aqua)]" /></div>
                    <p className="mt-7 text-xs font-medium text-slate-500">{label}</p>
                    <p className="mt-1 text-lg font-extrabold text-brand-navy">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </MotionReveal>
      </div>
    </section>
  );
}

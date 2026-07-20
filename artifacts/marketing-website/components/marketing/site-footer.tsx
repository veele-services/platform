import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { Logo } from "./logo";
import { navigation } from "@/lib/site";

const serviceLinks = navigation.slice(0, 4);
const companyLinks = [
  { label: "Sectoren", href: "/oplossingen" },
  { label: "Over ons", href: "/over-ons" },
  { label: "Cases", href: "/cases" },
  { label: "Kennis", href: "/kennis" },
  { label: "Werken bij", href: "/werken-bij" },
];

export function SiteFooter() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  return (
    <footer className="relative overflow-hidden bg-[var(--navy-950)] text-white">
      <div className="absolute -right-32 top-12 size-96 rounded-full border-[70px] border-white/[.025]" />
      <div className="container-shell relative grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.35fr_.7fr_.7fr_.8fr]">
        <div>
          <Logo />
          <p className="mt-6 max-w-sm text-sm leading-7 text-white/58">Schoonmaak, beveiliging en facilitaire ondersteuning onder één heldere regie. Vanuit Den Haag, afgestemd op uw zakelijke locatie.</p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.045] px-3 py-2 text-xs font-semibold text-white/65"><MapPin aria-hidden="true" className="size-3.5 text-brand-aqua" /> Den Haag en omgeving</div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.17em] text-brand-aqua">Diensten</p>
          <nav className="mt-5 grid gap-3" aria-label="Diensten in voettekst">
            {serviceLinks.map((item) => <Link className="text-sm text-white/62 transition-colors hover:text-white" key={item.href} href={item.href}>{item.label}</Link>)}
          </nav>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.17em] text-brand-aqua">Veele</p>
          <nav className="mt-5 grid gap-3" aria-label="Bedrijfslinks in voettekst">
            {companyLinks.map((item) => <Link className="text-sm text-white/62 transition-colors hover:text-white" key={item.href} href={item.href}>{item.label}</Link>)}
          </nav>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.17em] text-brand-aqua">Contact</p>
          <div className="mt-5 grid gap-3 text-sm text-white/62">
            {contactEmail && <a className="break-all transition-colors hover:text-white" href={`mailto:${contactEmail}`}>{contactEmail}</a>}
            <Link className="inline-flex items-center gap-2 transition-colors hover:text-white" href="/contact">Contact opnemen<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
            <Link className="inline-flex items-center gap-2 transition-colors hover:text-white" href="/offerte">Offerte aanvragen<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
            <Link className="inline-flex items-center gap-2 transition-colors hover:text-white" href="/portaal">Klantenportaal<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-shell flex flex-col gap-3 py-6 text-[11px] text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Veele Services. Alle rechten voorbehouden.</p>
          <p>Zakelijke dienstverlening vanuit Den Haag</p>
        </div>
      </div>
    </footer>
  );
}

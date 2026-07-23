import content from "@/content/website-content.json";

export type PageSection = {
  heading: string;
  body: string;
  bullets: string[];
};

export type SitePage = {
  group: string;
  name: string;
  slug: string;
  purpose: string;
  seo_title: string;
  meta: string;
  eyebrow: string;
  h1: string;
  intro: string;
  proof: string[];
  sections: PageSection[];
  process: [string, string][];
  cta_heading: string;
  cta_body: string;
  primary_cta: string;
  secondary_cta: string;
  faqs: [string, string][];
};

export type PageTemplate =
  | "home"
  | "services-overview"
  | "service-detail"
  | "sectors-overview"
  | "sector-detail"
  | "organization"
  | "editorial"
  | "conversion"
  | "portal"
  | "local";

export type BreadcrumbItem = {
  name: string;
  href: string;
};

export type InternalLink = {
  name: string;
  href: string;
  description: string;
};

export const siteContent = content;
export const sourcePages = content.pages as SitePage[];

export const SITE_NAME = "Veele Services";
export const SITE_DESCRIPTION =
  "Schoonmaak, beveiliging en facilitaire ondersteuning voor zakelijke locaties vanuit Den Haag.";

const DEFAULT_SITE_URL = "https://www.veeleservices.nl";
const serviceGroups = new Set(["Schoonmaak", "Beveiliging", "Facilitair"]);

function sanitizePublicationText(value: string) {
  return value
    .replace(/Familiebedrijf uit Den Haag\s*·\s*24\/7 bereikbaar/gi, "Persoonlijke dienstverlening vanuit Den Haag")
    .replace(/Erkend beveiligingsbedrijf\s*·\s*ND 8096/gi, "Beveiliging afgestemd op uw locatie")
    .replace(/Beveiliging\s*·\s*Erkend onder ND 8096/gi, "Beveiliging · Den Haag en Randstad")
    .replace(/25\+ jaar gecombineerde ervaring/gi, "Ervaring in schoonmaak, beveiliging en facilitair")
    .replace(/24\/7 bereikbaar wanneer het nodig is/gi, "Bereikbaarheid afgestemd op de opdracht")
    .replace(/24\/7 bereikbaar(?:heid)?/gi, "bereikbaar op afgesproken momenten")
    .replace(/binnen één werkdag/gi, "zo snel mogelijk")
    .replace(/Reactie op webaanvragen zo snel mogelijk/gi, "Persoonlijke reactie op webaanvragen")
    .replace(/Beveiliging: 06\s*-\s*34108400/gi, "Beveiligingsvraag: neem contact op via het formulier")
    .replace(/Schoonmaak: 06\s*-\s*24291576/gi, "Schoonmaakvraag: neem contact op via het formulier")
    .replace(/E-mail: info@veeleservices\.nl/gi, "Algemene vraag: neem contact op via het formulier")
    .replace(/mail info@veeleservices\.nl/gi, "gebruik het contactformulier")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizePage(sourcePage: SitePage): SitePage {
  const sanitize = (value: string) => sanitizePublicationText(value);
  const page: SitePage = {
    ...sourcePage,
    purpose: sanitize(sourcePage.purpose),
    seo_title: sanitize(sourcePage.seo_title),
    meta: sanitize(sourcePage.meta),
    eyebrow: sanitize(sourcePage.eyebrow),
    h1: sanitize(sourcePage.h1),
    intro: sanitize(sourcePage.intro),
    proof: sourcePage.proof.map(sanitize),
    sections: sourcePage.sections.map((section) => ({
      heading: sanitize(section.heading),
      body: sanitize(section.body),
      bullets: section.bullets.map(sanitize),
    })),
    process: sourcePage.process.map(([title, body]) => [sanitize(title), sanitize(body)]),
    cta_heading: sanitize(sourcePage.cta_heading),
    cta_body: sanitize(sourcePage.cta_body),
    primary_cta: sanitize(sourcePage.primary_cta),
    secondary_cta: sanitize(sourcePage.secondary_cta),
    faqs: sourcePage.faqs.map(([question, answer]) => [sanitize(question), sanitize(answer)]),
  };

  if (sourcePage.slug === "/") {
    page.proof = [
      "Schoonmaak, beveiliging en facilitaire ondersteuning",
      "Eén aanspreekpunt voor alle diensten",
      "Afspraken afgestemd op uw locatie",
      "Inzicht in planning en opvolging",
    ];
  }

  if (sourcePage.slug === "/beveiliging") {
    page.faqs[0] = [
      "Welke voorwaarden gelden voor beveiligingsdiensten?",
      "We bevestigen relevante registraties, bevoegdheden, inzetbaarheid en opdrachtvoorwaarden voordat we een beveiligingsopdracht aannemen.",
    ];
    page.faqs[1] = [
      "Is inzet buiten reguliere tijden mogelijk?",
      "De feitelijke bezetting wordt per opdracht gepland en hangt af van scope, locatie en beschikbaarheid.",
    ];
    page.sections[0] = {
      ...page.sections[0],
      bullets: page.sections[0].bullets.map((bullet) =>
        bullet === "Persoonsbeveiliging en chauffeursdiensten"
          ? "Persoonsbeveiliging en chauffeursdiensten na een geschiktheids- en haalbaarheidscheck"
          : bullet,
      ),
    };
  }

  if (sourcePage.slug === "/beveiliging/persoonsbeveiliging") {
    page.meta =
      "Bespreek vertrouwelijk of persoonsbeveiliging passend, bevoegd en uitvoerbaar is voor uw situatie in Den Haag of de Randstad.";
    page.intro =
      "Persoonsbeveiliging vraagt vertrouwelijkheid, passende expertise en maatwerk. Iedere aanvraag begint daarom met een geschiktheids- en haalbaarheidscheck; inzet wordt niet vooraf gegarandeerd.";
  }

  if (sourcePage.slug === "/beveiliging/chauffeursdiensten") {
    page.meta =
      "Bespreek de haalbaarheid van professionele of beveiligde chauffeursdiensten voor uw situatie in Den Haag of de Randstad.";
    page.intro =
      "Professionele of beveiligde chauffeursdiensten vragen een zorgvuldige beoordeling van voertuig, chauffeur, route en eventuele beveiligingscomponent. Beschikbaarheid wordt per aanvraag bevestigd.";
  }

  if (sourcePage.slug === "/over-ons") {
    page.seo_title = "Over Veele Services | Dienstverlener uit Den Haag";
    page.intro =
      "Veele Services werkt vanuit Den Haag aan schoonmaak, beveiliging en facilitaire ondersteuning, met persoonlijke regie als uitgangspunt. Bedrijfshistorie, registraties en ervaringsclaims worden vóór publicatie formeel gevalideerd.";
    page.proof = [
      "Persoonlijke regie",
      "Ervaring in meerdere dienstdisciplines",
      "Werkend vanuit Den Haag",
      "Beveiligingsvoorwaarden worden per opdracht bevestigd",
    ];
    page.sections[1] = {
      ...page.sections[1],
      bullets: page.sections[1].bullets.map((bullet) =>
        bullet.includes("registratienummer ND 8096")
          ? "<b>Professioneel</b> - Vereiste registraties en opdrachtvoorwaarden worden vóór inzet gecontroleerd."
          : bullet,
      ),
    };
    page.faqs[1] = [
      "Welke voorwaarden gelden voor beveiligingsdiensten?",
      "Relevante registraties, bevoegdheden en opdrachtvoorwaarden worden vóór inzet gecontroleerd en bevestigd.",
    ];
  }

  if (sourcePage.slug === "/contact") {
    page.faqs[0] = [
      "Wanneer krijg ik antwoord?",
      "Na ontvangst bekijken we welke collega uw vraag het beste kan beantwoorden. Bij spoed volgt u de vooraf afgesproken noodprocedure.",
    ];
    page.faqs[1] = [
      "Kan ik WhatsApp gebruiken?",
      "Gebruik vooralsnog het contactformulier. Een berichtenroute wordt pas aangeboden nadat privacy, beheer en responstijden zijn ingericht.",
    ];
  }

  if (sourcePage.slug === "/portaal") {
    page.h1 = "Een helder beeld van de voorgestelde portaalervaring.";
    page.intro =
      "Deze marketingdemo laat zien hoe planning, meldingen, goedkeuringen en rapportages later in een beveiligde omgeving kunnen samenkomen. De pagina bevat geen productie-authenticatie of klantdata.";
    page.proof = page.proof.map((item) => `Voorgesteld: ${item.toLocaleLowerCase("nl-NL")}`);
    page.faqs = [
      [
        "Is dit al het productieportaal?",
        "Nee. Dit is een marketingdemo zonder echte accounts, authenticatie of klantdata.",
      ],
      [
        "Welke functies kunnen later beschikbaar zijn?",
        "Planning, meldingen, rapportages en documenttoegang zijn voorgestelde modules. Beschikbaarheid wordt pas na technische en securityvalidatie bevestigd.",
      ],
      [
        "Hoe worden accounts straks beveiligd?",
        "Authenticatie, rollen, multifactorauthenticatie en gegevensscheiding moeten vóór productie afzonderlijk worden ontworpen en getest.",
      ],
    ];
  }

  return page;
}

export const pages = sourcePages.map(sanitizePage);

function resolveSiteUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_MARKETING_SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!configuredUrl) return DEFAULT_SITE_URL;

  try {
    const parsed = new URL(configuredUrl);
    return parsed.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export const siteUrl = resolveSiteUrl();

export function pathnameFromSegments(segments?: string[]) {
  if (!segments?.length) return "/";

  return `/${segments.join("/")}`;
}

export function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/";

  const pathOnly = pathname.split(/[?#]/, 1)[0] ?? "/";
  const withLeadingSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  return withLeadingSlash.replace(/\/{2,}/g, "/").replace(/\/$/, "");
}

export function getPage(pathname: string) {
  const cleanPathname = normalizePathname(pathname);
  return pages.find((page) => page.slug === cleanPathname);
}

export function absoluteUrl(pathname = "/") {
  return new URL(normalizePathname(pathname), `${siteUrl}/`).toString();
}

export function getPageTemplate(page: SitePage): PageTemplate {
  if (page.slug === "/") return "home";
  if (["/diensten", "/schoonmaak", "/beveiliging", "/facilitair"].includes(page.slug)) {
    return "services-overview";
  }
  if (serviceGroups.has(page.group)) return "service-detail";
  if (page.slug === "/oplossingen") return "sectors-overview";
  if (page.group === "Oplossingen per sector") return "sector-detail";
  if (page.group === "Lokale SEO") return "local";
  if (page.group === "Conversie" || page.slug === "/werken-bij") return "conversion";
  if (page.slug === "/portaal") return "portal";
  if (page.group === "Bewijs en content") return "editorial";
  return "organization";
}

/**
 * These routes remain available for stakeholder review but are deliberately
 * noindex until the evidence required by the supplied content has been approved.
 */
export function isIndexablePage(page: SitePage) {
  return page.group !== "Lokale SEO" && page.slug !== "/oplossingen/zorg-onderwijs";
}

export function getBreadcrumbs(page: SitePage): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = [{ name: "Home", href: "/" }];
  const segments = page.slug.split("/").filter(Boolean);

  if (segments.length > 1) {
    const parent = getPage(`/${segments[0]}`);
    if (parent) breadcrumbs.push({ name: parent.name, href: parent.slug });
  } else if (["/cases", "/kennis"].includes(page.slug)) {
    breadcrumbs.push({ name: "Over ons", href: "/over-ons" });
  }

  breadcrumbs.push({ name: page.name, href: page.slug });
  return breadcrumbs;
}

function asInternalLink(page: SitePage): InternalLink {
  return {
    name: page.name,
    href: page.slug,
    description: page.intro,
  };
}

function pagesForSlugs(slugs: string[]) {
  return slugs
    .map((slug) => getPage(slug))
    .filter((page): page is SitePage => Boolean(page))
    .map(asInternalLink);
}

export function getRelatedPages(page: SitePage): InternalLink[] {
  const template = getPageTemplate(page);

  if (page.slug === "/") {
    return pagesForSlugs(["/schoonmaak", "/beveiliging", "/facilitair", "/oplossingen"]);
  }

  if (page.slug === "/diensten") {
    return pagesForSlugs(["/schoonmaak", "/beveiliging", "/facilitair", "/oplossingen"]);
  }

  if (template === "services-overview" || template === "sectors-overview") {
    return pages
      .filter(
        (candidate) =>
          candidate.slug !== page.slug &&
          candidate.slug.startsWith(`${page.slug}/`) &&
          candidate.slug.split("/").filter(Boolean).length === 2,
      )
      .map(asInternalLink);
  }

  if (template === "service-detail" || template === "sector-detail") {
    const parentSlug = `/${page.slug.split("/").filter(Boolean)[0]}`;
    const siblings = pages.filter(
      (candidate) =>
        candidate.slug !== page.slug &&
        candidate.slug.startsWith(`${parentSlug}/`) &&
        candidate.slug.split("/").filter(Boolean).length === 2,
    );
    const parent = getPage(parentSlug);
    return [...(parent ? [parent] : []), ...siblings.slice(0, 3)].map(asInternalLink);
  }

  if (template === "local") {
    const localPages = pages.filter(
      (candidate) => candidate.group === "Lokale SEO" && candidate.slug !== page.slug,
    );
    return [getPage("/diensten"), ...localPages.slice(0, 3)]
      .filter((candidate): candidate is SitePage => Boolean(candidate))
      .map(asInternalLink);
  }

  const contextualRoutes: Record<string, string[]> = {
    "/over-ons": ["/diensten", "/cases", "/werken-bij", "/contact"],
    "/cases": ["/diensten", "/oplossingen", "/kennis", "/contact"],
    "/kennis": ["/diensten", "/oplossingen", "/cases", "/contact"],
    "/werken-bij": ["/over-ons", "/diensten", "/contact"],
    "/contact": ["/diensten", "/offerte", "/portaal"],
    "/offerte": ["/diensten", "/oplossingen", "/contact"],
    "/portaal": ["/contact", "/diensten", "/offerte"],
  };

  return pagesForSlugs(contextualRoutes[page.slug] ?? ["/diensten", "/contact"]);
}

const truncatedMetaEnding = /\s(?:aan|b|bi|bij|V|Ve|Vee|Veel|Veele|transpara)$/i;

/**
 * Metadata must be publishable before the claims in docs/CLAIMS_VALIDATION.md
 * have been verified. The complete supplied copy remains in the content source.
 */
export function getPublicTitle(page: SitePage) {
  return page.seo_title
    .replace(/\s*\|\s*Erkend ND 8096/i, " | Zakelijke beveiliging")
    .trim();
}

export function getPublicDescription(page: SitePage) {
  if (page.group === "Lokale SEO") {
    const place = page.name.replace(/^Dienstverlening\s+/i, "");
    return `Bespreek de mogelijkheden voor schoonmaak, beveiliging en facilitaire ondersteuning in ${place}. Eén aanspreekpunt en een aanpak op maat.`;
  }

  if (page.slug === "/over-ons") {
    return "Maak kennis met Veele Services uit Den Haag en onze aanpak voor schoonmaak, beveiliging en facilitaire ondersteuning.";
  }

  if (page.slug === "/contact") {
    return "Neem contact op met Veele Services over schoonmaak, beveiliging of facilitaire ondersteuning voor uw zakelijke locatie.";
  }

  if (page.meta.length >= 158 || truncatedMetaEnding.test(page.meta)) {
    return `${page.name} voor zakelijke locaties in Den Haag en de Randstad, met persoonlijke aansturing, duidelijke afspraken en een voorstel op maat.`;
  }

  return page.meta
    .replace(/,?\s*24\/7 bereikbaar(?:heid)?/gi, "")
    .replace(/Persoonlijk,\s*en/gi, "Persoonlijk en")
    .replace(/Erkend beveiligingsbedrijf/gi, "Zakelijke beveiligingspartner")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function stripMarkup(value: string) {
  return value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s{2,}/g, " ").trim();
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export const navigation = [
  { label: "Diensten", href: "/diensten" },
  { label: "Schoonmaak", href: "/schoonmaak" },
  { label: "Beveiliging", href: "/beveiliging" },
  { label: "Facilitair", href: "/facilitair" },
  { label: "Sectoren", href: "/oplossingen" },
  { label: "Over ons", href: "/over-ons" },
  { label: "Kennis", href: "/kennis" },
];

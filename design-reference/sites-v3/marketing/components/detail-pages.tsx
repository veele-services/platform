import {
  ArrowUpRight,
  Building2,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Layers3,
  MapPin,
  Users,
} from 'lucide-react';
import { products, sectors, type Product, type Sector } from '@/lib/content';
import { Reveal, ButtonLink, SectionHeading, FAQ } from '@/components/ui';
import { ProductDemo, PhoneDemo } from '@/components/product-demo';
import { ClosingCTA } from '@/components/sections';

const sectorIcons = [Building2, ClipboardCheck, Users];
const productIcons = [Layers3, ClipboardCheck, FileText];

function Breadcrumb({
  concept,
  category,
  categorySlug,
  current,
}: {
  concept: string;
  category: string;
  categorySlug: string;
  current: string;
}) {
  return (
    <nav className="breadcrumb" aria-label="Kruimelpad">
      <a href="/">Home</a>
      <ChevronRight size={12} aria-hidden="true" />
      <a href={`/${categorySlug}`}>{category}</a>
      <ChevronRight size={12} aria-hidden="true" />
      <span aria-current="page">{current}</span>
    </nav>
  );
}

export function SectorPage({ sector, concept }: { sector: Sector; concept: string }) {
  const isFuture = Boolean(sector.future);

  return (
    <>
      <section className="detail-hero" aria-labelledby="sector-title">
        <div className="container">
          <Breadcrumb concept={concept} category="Branches" categorySlug="branches" current={sector.name} />
          <div className="detail-hero-grid">
            <Reveal>
              <span className="eyebrow"><span aria-hidden="true" />{sector.eyebrow}</span>
              <h1 id="sector-title">{sector.headline}</h1>
              <p>{sector.intro}</p>
              <div className="hero-buttons">
                <ButtonLink href={isFuture?'/afspraak':'/proberen'}>
                  {isFuture ? 'Plan een afspraak in' : 'Probeer nu 30 dagen gratis'}
                </ButtonLink>
                <ButtonLink href={isFuture?'#werkwijze':'/afspraak'} variant="outline">
                  {isFuture ? 'Bekijk de ontwikkelrichting' : 'Plan een afspraak in'}
                </ButtonLink>
              </div>
              {sector.future && <p className="future-note">{sector.future}</p>}
            </Reveal>
            <Reveal className="detail-visual" delay={0.12}>
              <img src={sector.image} alt={sector.imageAlt} width={960} height={1120} fetchPriority="high" />
              <div className="image-caption">
                <MapPin size={24} aria-hidden="true" />
                <div>
                  <strong>{sector.name}</strong>
                  <small>{isFuture ? 'Een volgende stap, samen met de sector.' : 'Mensen, locaties en werk verbonden.'}</small>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <div className="challenge-bar" aria-label="Herkenbare vragen uit de praktijk">
        <div className="container">
          {sector.challenges.map((challenge) => (
            <span key={challenge}><Check size={17} aria-hidden="true" />{challenge}</span>
          ))}
        </div>
      </div>

      <section className="section-pad">
        <div className="container">
          <Reveal>
            <SectionHeading
              eyebrow={isFuture ? 'DE BESTAANDE BASIS' : 'DUIDELIJKHEID IN DE DAGELIJKSE PRAKTIJK'}
              title={isFuture ? 'Een vertrekpunt om op verder te bouwen.' : 'Geef goed werk de ruimte.'}
              text={isFuture
                ? 'Deze onderdelen van Fieldgrid vormen het vertrekpunt. De sectorspecifieke verdieping onderzoeken we samen met dienstverleners.'
                : 'Van een goed voorbereide opdracht tot een heldere terugkoppeling: breng de mensen en informatie rond het werk bij elkaar.'}
            />
          </Reveal>
          <div className="benefits-grid">
            {sector.benefits.map((benefit, index) => {
              const Icon = sectorIcons[index % sectorIcons.length];
              return (
                <Reveal className="benefit-card" key={benefit.title} delay={index * 0.07}>
                  <div className="benefit-icon"><Icon size={21} aria-hidden="true" /></div>
                  <h3>{benefit.title}</h3>
                  <p>{benefit.text}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="article-band" aria-label={`Fieldgrid voor ${sector.name.toLowerCase()}`}>
        <div className="container article-grid">
          {sector.sections.map((section, index) => (
            <Reveal key={section.title} delay={index * 0.08}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section-pad" id="werkwijze">
        <div className="container">
          <Reveal>
            <SectionHeading
              eyebrow={isFuture ? 'SAMEN DE VOLGENDE STAP ZETTEN' : 'VAN AFSPRAAK TOT AFRONDING'}
              title={isFuture ? 'Een zorgvuldige route naar de praktijk.' : 'Een werkstroom die bij je vak past.'}
              text={isFuture
                ? 'Een bruikbare sectoroplossing begint met de werkprocessen, verantwoordelijkheden en vragen van jouw organisatie.'
                : 'Iedere stap blijft verbonden met de klant, de locatie en de opdracht. Zo kan iedereen verder op de informatie die al is vastgelegd.'}
            />
          </Reveal>
          <div className="step-grid">
            {sector.workflow.map((step, index) => (
              <Reveal className="step-card" key={step.title} delay={index * 0.06}>
                <span className="step-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="content-product-section" aria-label="Interactief productvoorbeeld">
        <div className="container">
          <SectionHeading
            eyebrow="PROBEER DE VERBINDING"
            title={isFuture ? 'Ontdek de bestaande platformbasis.' : 'Dezelfde opdracht. Drie perspectieven.'}
            text={isFuture
              ? 'Bekijk de huidige basis met een fictieve serviceopdracht. Dit voorbeeld toont algemene werkprocessen; de sectorspecifieke functies zijn in ontwikkeling.'
              : 'Wissel tussen kantoor, uitvoering en klant. Open een werkbon, vink taken af en bekijk hoe de informatie samenkomt. Je werkt met fictieve voorbeeldgegevens.'}
            light
          />
          <Reveal><ProductDemo /></Reveal>
        </div>
      </section>

      <section className="section-pad">
        <div className="container faq-section">
          <SectionHeading
            eyebrow="GOED OM TE WETEN"
            title={`Vragen over ${sector.name.toLowerCase()}.`}
            text="Iedere organisatie werkt anders. Dit zijn de uitgangspunten; tijdens een gesprek bekijken we wat bij jouw werkwijze past."
          />
          <FAQ items={sector.faqs} />
        </div>
      </section>

      <section className="article-band">
        <div className="container">
          <SectionHeading
            eyebrow="DEZELFDE BASIS, EEN ANDER VAK"
            title="Ontdek de andere branches."
            text="Verschillende werkzaamheden, dezelfde behoefte aan duidelijke opdrachten en verbonden informatie."
          />
          <nav className="related-links" aria-label="Andere branches">
            {sectors.filter((item) => item.slug !== sector.slug).map((item) => (
              <a href={`/branches/${item.slug}`} key={item.slug}>
                {item.name}{item.future ? ' · in ontwikkeling' : ''}
              </a>
            ))}
          </nav>
        </div>
      </section>
      <ClosingCTA concept={concept} />
    </>
  );
}

export function ProductPage({ product, concept }: { product: Product; concept: string }) {
  const initialTab = product.slug === 'werkbonnen' ? 'werkbon' : product.slug === 'klantportaal' || product.slug === 'objecten' ? 'klant' : 'planning';
  const isPersonnel = product.slug === 'personeelsapp';

  return (
    <>
      <section className="product-hero" aria-labelledby="product-title">
        <div className="container">
          <Breadcrumb concept={concept} category="Platform" categorySlug="platform" current={product.name} />
          <div className="detail-hero-grid">
            <Reveal>
              <span className="eyebrow"><span aria-hidden="true" />{product.eyebrow}</span>
              <h1 id="product-title">{product.headline}</h1>
              <p>{product.intro}</p>
              <div className="hero-buttons">
                <ButtonLink href="/proberen">Probeer nu 30 dagen gratis</ButtonLink>
                <ButtonLink href="/afspraak" variant="outline">Plan een afspraak in</ButtonLink>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="sr-only">Interactief voorbeeld van {product.name.toLowerCase()}</h2>
              {isPersonnel ? <PhoneDemo /> : <ProductDemo initialTab={initialTab} compact />}
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section-pad" id="mogelijkheden">
        <div className="container">
          <Reveal>
            <SectionHeading
              eyebrow={product.name.toUpperCase()}
              title="De juiste informatie. Op het juiste moment."
              text="Maak afspraken concreet, houd de uitvoering verbonden en geef iedere rol een passend overzicht."
            />
          </Reveal>
          <div className="benefits-grid">
            {product.features.map((feature, index) => {
              const Icon = productIcons[index % productIcons.length];
              return (
                <Reveal className="benefit-card" key={feature.title} delay={index * 0.06}>
                  <div className="benefit-icon"><Icon size={22} aria-hidden="true" /></div>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="article-band">
        <div className="container product-story">
          <div className="product-story-visual"><img src={product.slug==='personeelsapp'||product.slug==='onboarding'?'/images/onboarding.webp':'/images/kantoor-planning.webp'} alt={product.slug==='onboarding'||product.slug==='personeelsapp'?'Een nieuwe medewerker en teamleider bekijken samen de eerste werkafspraken':'Een planner werkt aan de dagelijkse organisatie van dienstverlening'} loading="lazy"/><div><span>VAN KANTOOR TOT KLANTLOCATIE</span><strong>Goed werk vraagt om<br/>een heldere basis.</strong></div></div>
          <Reveal className="long-text">
            <span className="eyebrow"><span aria-hidden="true" />SAMENHANG IN JE WERKPROCES</span>
            <h2>{product.name} als onderdeel van je werkdag.</h2>
            {product.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            <a href={`/werkwijze`} className="text-link">
              Bekijk de volledige werkwijze<ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </Reveal>
        </div>
      </section>

      <section className="section-pad">
        <div className="container faq-section">
          <SectionHeading
            eyebrow="PRAKTISCHE VRAGEN"
            title="Wat wil je weten?"
            text={`Lees hoe ${product.name.toLowerCase()} past binnen Fieldgrid. De beschikbare onderdelen hangen samen met de gekozen inrichting en rechten.`}
          />
          <FAQ items={product.faqs} />
        </div>
      </section>

      <section className="article-band">
        <div className="container">
          <SectionHeading
            eyebrow="ÉÉN VERBONDEN PLATFORM"
            title="Ontdek wat hierop aansluit."
            text="Volg de verbinding tussen planning, locaties, uitvoering en het contact met je opdrachtgever."
          />
          <nav className="related-links" aria-label="Andere onderdelen van Fieldgrid">
            {products.filter((item) => item.slug !== product.slug).map((item) => (
              <a href={`/platform/${item.slug}`} key={item.slug}>{item.name}</a>
            ))}
          </nav>
        </div>
      </section>
      <ClosingCTA concept={concept} />
    </>
  );
}

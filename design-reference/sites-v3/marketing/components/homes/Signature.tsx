'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronLeft, ChevronRight, CalendarDays, ClipboardCheck, MapPin, Monitor, Smartphone, Users, MessageSquare, FileText, Building2, Layers3, CalendarCheck, Plus, Clock3, ShieldCheck, Sparkles } from 'lucide-react';
import { Reveal, ButtonLink, SectionHeading, FAQ } from '@/components/ui';
import { ProductDemo, PhoneDemo } from '@/components/product-demo';
import { SectorGrid, VerticalBanner, ClosingCTA } from '@/components/sections';
import s from './Signature.module.css';

const perspectives = [
  { id: 'planning' as const, label: 'Voor kantoor', icon: Monitor, title: 'Een helder begin van iedere werkdag.', copy: 'Plan het werk, houd je klantlocaties bij en volg wat aandacht vraagt. Van de eerste aanvraag tot de laatste terugkoppeling: je team werkt vanuit één gedeelde basis.', items: ['Planning en medewerkers bij elkaar', 'Afspraken gekoppeld aan klantlocaties', 'Werkbonnen en opvolging in beeld'] },
  { id: 'werkbon' as const, label: 'Voor je team', icon: Smartphone, title: 'De juiste informatie gaat mee naar buiten.', copy: 'Je medewerkers openen hun planning, vinden instructies voor de locatie en leggen het uitgevoerde werk vast. Minder zoeken naar informatie, meer aandacht voor de opdracht.', items: ['Je werkdag op je telefoon', 'Objectinstructies binnen handbereik', 'Terugkoppeling bij de juiste opdracht'] },
  { id: 'klant' as const, label: 'Voor je klant', icon: Users, title: 'Een eigen plek voor afspraken en service.', copy: 'Geef klanten een herkenbare omgeving voor hun locaties, afspraken en documenten. Vragen en serviceverzoeken houden hun context, ook als je meerdere diensten levert.', items: ['Overzicht van eigen locaties', 'Afspraken en rapportages inzien', 'Service aanvragen en contact houden'] },
];

function PlanningTile() {
  return <div className={s.planningTile}><div className={s.tileTop}><strong>Planning</strong><span>Demogegevens</span></div><div className={s.miniDate}><ChevronLeft size={11} /><span>Woensdag 14 oktober</span><ChevronRight size={11} /></div><div className={s.planPeople}><span /><span><i>SV</i>Sam</span><span><i>NB</i>Noor</span><span><i>MJ</i>Mila</span></div><div className={s.planGrid}><div className={s.times}><span>08:00</span><span>10:00</span><span>12:00</span></div><div><span className={s.planGreen}>Glasbewassing<small>Duinzicht</small></span><span className={s.planBlue}>Onderhoud<small>Havenkwartier</small></span></div><div><span className={s.planMint}>Schoonmaak<small>Westpoint</small></span><span className={s.planGray}>Werkoverleg</span></div><div><span className={s.planBlue}>Inspectie<small>Duinzicht</small></span><span className={s.planGreen}>Groenbeheer<small>Buitenplaats</small></span></div></div></div>;
}

export default function SignatureHome({ concept }: { concept: string }) {
  const [perspective, setPerspective] = useState(0);
  const selected = perspectives[perspective];
  return <>
    <section className={s.hero}>
      <div className={`container ${s.heroLayout}`}>
        <Reveal className={s.heroCopy}><span className={s.eyebrow}><span /> Planningsoftware voor servicebedrijven</span><h1>Je mensen.<br />Je locaties.<br /><em>Alles verbonden.</em></h1><p>Van de eerste planning tot de laatste werkbon. Breng medewerkers, klantlocaties en klantcontact samen in één overzichtelijk platform voor jouw servicebedrijf.</p><div className={s.heroActions}><ButtonLink href="/proberen">Probeer nu 30 dagen gratis</ButtonLink><ButtonLink href="/afspraak" variant="outline">Plan een afspraak in</ButtonLink></div><div className={s.heroNote}><span className={s.checkStack}><Check size={10} /><Check size={10} /><Check size={10} /></span>Voor kantoor, medewerker én klant.</div></Reveal>
        <Reveal className={s.heroArt} delay={0.15}>
          <div className={s.softShape} /><div className={s.heroGrid}>
            <div className={s.planningWrapper}><PlanningTile /><div className={s.connectDot} /></div>
            <div className={s.workPhoto}><img src="/images/glasbewassing.webp" alt="Professionele glasbewasser aan het werk bij een klantlocatie" fetchPriority="high" /><span className={s.photoCaption}><span /> Buiten goed geregeld.</span><div className={s.workStatus}><span><ClipboardCheck size={15} /><strong>Werkbon bijgewerkt</strong><CheckCircle2 size={14} /></span><p>Glasbewassing · Duinzicht</p><small>Instructies gelezen. Klaar voor de werkdag.</small></div></div>
            <div className={s.buildingTile}><img src="/images/horizon.webp" alt="Moderne kantoorlocatie met groene buitenruimte" /><div className={s.buildingLabel}><span><MapPin size={17} /></span><div><strong>Kantoor Duinzicht</strong><small>Alles over deze locatie, bij elkaar.</small></div></div></div>
            <div className={s.customerTile}><span className={s.customerIcon}><CalendarCheck size={23} /></span><div className={s.customerHeading}><span>Jouw klantomgeving</span><strong>Goedemorgen, Eva.</strong></div><div className={s.nextAppointment}><span>Je volgende afspraak</span><strong>Glasbewassing</strong><div><CalendarDays size={12} /><span>Vandaag · 08:00 – 10:00</span></div><div><MapPin size={12} /><span>Kantoor Duinzicht</span></div></div><a href="/platform/klantportaal">Bekijk de klantomgeving <ArrowRight size={13} /></a></div>
          </div><small className={s.demoLabel}>Een verbonden werkdag · Voorbeeldgegevens</small>
        </Reveal>
      </div>
    </section>

    <section className={s.connectionStrip}><div className={`container ${s.connectionInner}`}><p>Goed werk begint met<br /><strong>goed samenwerken.</strong></p><span><Monitor size={23} /><strong>Kantoor</strong><small>Houd de regie</small></span><i /><span><Smartphone size={23} /><strong>Medewerker</strong><small>Weet wat er speelt</small></span><i /><span><Users size={23} /><strong>Klant</strong><small>Blijf betrokken</small></span><div className={s.stripEnd}><Layers3 size={22} /><span>Eén platform.<br />Een gedeeld overzicht.</span></div></div></section>

    <section className={s.perspectivesSection} id="platform"><div className="container"><Reveal><div className={s.centerHeading}><SectionHeading eyebrow="Samenwerken zonder losse eindjes" title="Eén opdracht. Drie perspectieven." text="Iedereen werkt aan dezelfde dienstverlening. Geef iedereen het overzicht dat bij zijn rol hoort, met de informatie die je team en je klant verbindt." /></div></Reveal><Reveal delay={0.1}><div className={s.perspectivePanel}><div className={s.roleTabs} role="tablist" aria-label="Kies je perspectief">{perspectives.map((item,index)=><button key={item.id} id={`signature-role-${index}`} role="tab" aria-controls="signature-perspective" aria-selected={perspective===index} tabIndex={perspective===index?0:-1} onKeyDown={event=>{const delta=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;if(delta){event.preventDefault();const next=(index+delta+perspectives.length)%perspectives.length;setPerspective(next);document.getElementById(`signature-role-${next}`)?.focus();}}} className={perspective===index?s.activeRole:''} onClick={()=>setPerspective(index)}><item.icon size={18}/>{item.label}<ArrowUpRight size={15}/></button>)}</div><div className={s.perspectiveBody} id="signature-perspective" role="tabpanel" aria-labelledby={`signature-role-${perspective}`}><div className={s.perspectiveCopy}><span className={s.tinyLabel}>Jouw werk, jouw overzicht</span><h3>{selected.title}</h3><p>{selected.copy}</p><ul>{selected.items.map(item=><li key={item}><CheckCircle2 size={15}/>{item}</li>)}</ul><a href="/platform">Ontdek alle mogelijkheden <ArrowRight size={15}/></a></div><div className={s.productFrame}><ProductDemo key={selected.id} initialTab={selected.id} compact /></div></div></div></Reveal></div></section>

    <SectorGrid concept={concept}/>

    <section className={s.peopleSection}><div className={`container ${s.peopleLayout}`}><Reveal className={s.peopleVisual}><div className={s.visualPhoto}><img src="/images/glasbewassing.webp" alt="Een vakmens voert glasbewassing uit aan de buitenkant van een gebouw" loading="lazy"/><div><span>Voor de mensen die het doen.</span><strong>Het werk gaat mee.<br />Het overzicht ook.</strong></div></div><div className={s.phoneWrap}><PhoneDemo/></div></Reveal><Reveal className={s.peopleCopy}><SectionHeading eyebrow="Gemaakt voor de werkdag" title="Sterk op kantoor. Net zo sterk op locatie." text="De beste planning werkt pas als je team ermee uit de voeten kan. Daarom hoort een duidelijke personeelsapp bij de basis van Fieldgrid."/><div className={s.featureRows}><article><span><CalendarDays size={20}/></span><div><h3>Je werkdag begint met duidelijkheid</h3><p>Open je planning en zie waar je wordt verwacht. Met de opdracht, locatie en beschikbare informatie direct bij elkaar.</p></div></article><article><span><ClipboardCheck size={20}/></span><div><h3>Instructies bij de juiste opdracht</h3><p>Laat afspraken, aandachtspunten en objectinformatie meereizen naar de werkvloer. Ook bij een collega die inspringt.</p></div></article><article><span><MessageSquare size={20}/></span><div><h3>Van uitvoering naar terugkoppeling</h3><p>Leg vast wat er is gedaan en deel bijzonderheden via de werkbon. Zo kan kantoor verder met actuele informatie uit de praktijk.</p></div></article></div><a className={s.textLink} href="/platform/personeelsapp">Meer over de personeelsapp <ArrowUpRight size={17}/></a></Reveal></div></section>

    <section className={s.rolesSection} aria-labelledby="roles-heading">
      <div className={`container ${s.rolesLayout}`}>
        <Reveal className={s.rolesCopy}>
          <span className={s.lightEyebrow}><span /> Iedereen op dezelfde pagina</span>
          <h2 id="roles-heading">Op kantoor bedacht.<br />Buiten goed uitgevoerd.</h2>
          <p>Een wijziging in de planning raakt je mensen op locatie én je klant. Fieldgrid brengt die werelden samen in herkenbare omgevingen. Ieder met een eigen overzicht, verbonden met dezelfde dienstverlening.</p>
          <ButtonLink href="/werkwijze" variant="light">Zo werken de portalen samen</ButtonLink>
        </Reveal>
        <div className={s.roleCards}>{[
          { icon: Monitor, n: '01', title: 'Kantoor houdt de regie', text: 'Verdeel het werk, beheer je klantlocaties en volg wat aandacht vraagt. Je planning vormt het vertrekpunt voor een goed georganiseerde werkdag.' },
          { icon: Smartphone, n: '02', title: 'Je team weet wat te doen', text: 'Medewerkers vinden hun afspraken, objectinstructies en werkbonnen in de personeelsapp. De relevante informatie gaat mee naar buiten.' },
          { icon: Users, n: '03', title: 'Je klant blijft betrokken', text: 'Afspraken, rapportages en facturen komen samen in een eigen klantomgeving. Ook wanneer je voor één klant op meerdere locaties werkt.' },
        ].map((role, index) => <Reveal delay={index * .07} key={role.n}><article className={s.roleCard}><span className={s.roleIcon}><role.icon size={23} /></span><div><span className={s.roleNumber}>{role.n}</span><h3>{role.title}</h3><p>{role.text}</p></div></article></Reveal>)}</div>
      </div>
    </section>

    <section className={`container ${s.onboardingSection}`} aria-labelledby="onboarding-heading">
      <Reveal className={s.onboardingVisual}>
        <img className={s.onboardingDecoration} src="/branding/icon.svg" alt="" aria-hidden="true" />
        <OnboardingPreview />
      </Reveal>
      <Reveal delay={.1} className={s.onboardingCopy}>
        <span className={s.eyebrow}><span /> Iedereen goed op weg</span>
        <h2 id="onboarding-heading">Een nieuwe collega.<br />Een warm welkom.<br /><em>Een heldere start.</em></h2>
        <p>Een team groeit beter wanneer nieuwe mensen weten waar ze moeten beginnen. Begeleid medewerkers stap voor stap bij hun gegevens, documenten en eerste planning.</p>
        <p>Een herkenbare omgeving geeft vertrouwen. En kantoor houdt de informatie bij elkaar, zonder dat elke nieuwe collega hetzelfde rondje losse berichten hoeft te doorlopen.</p>
        <ul><li><Check size={16} /> Een overzichtelijke onboarding</li><li><Check size={16} /> Praktische informatie per werkplek</li><li><Check size={16} /> Een eigen omgeving voor iedere medewerker</li></ul>
        <ButtonLink href="/platform/personeelsapp">Ontdek de personeelsapp</ButtonLink>
        <div className={s.onboardingPeople}><img src="/images/onboarding.webp" alt="Een nieuwe medewerker krijgt uitleg van een collega op kantoor" loading="lazy"/><span>Een fijne eerste dag<br /><strong>begint met een duidelijke start.</strong></span></div>
      </Reveal>
    </section>

    <section className={s.workflowSection}><div className="container"><Reveal><div className={s.workflowIntro}><SectionHeading eyebrow="Eén lijn in je dienstverlening" title="Van eerste aanvraag tot goed afgerond werk." text="Elke stap hoort bij dezelfde klantrelatie. Fieldgrid verbindt de voorbereiding, uitvoering en afhandeling, zodat je bedrijf verder kan bouwen op wat al bekend is."/><ButtonLink href="/werkwijze" variant="outline">Zo werkt Fieldgrid</ButtonLink></div></Reveal><div className={s.flowGrid}>{[{icon:MessageSquare,n:'01',title:'De vraag komt binnen',text:'Verzamel klantgegevens, locaties en de vraag achter de opdracht. Een helder begin voor terugkerend werk of een nieuwe aanvraag.'},{icon:CalendarDays,n:'02',title:'Je maakt het concreet',text:'Vertaal afspraken naar werk voor de juiste mensen. Breng planning, objectinformatie en instructies samen voordat de werkdag begint.'},{icon:ClipboardCheck,n:'03',title:'Je team gaat aan de slag',text:'Medewerkers weten waar ze moeten zijn en wat er van hen wordt verwacht. Bevindingen blijven verbonden aan de uitgevoerde opdracht.'},{icon:FileText,n:'04',title:'Je rondt het goed af',text:'Gebruik de vastgelegde uitvoering voor terugkoppeling, rapportage en verdere afhandeling. Met een dossier dat bij elk bezoek rijker wordt.'}].map((step,index)=><Reveal delay={index*.06} key={step.n}><article className={s.flowCard}><div className={s.flowTop}><span><step.icon size={22}/></span><small>{step.n}</small></div><h3>{step.title}</h3><p>{step.text}</p>{index<3&&<span className={s.flowConnector}><ArrowRight size={14}/></span>}</article></Reveal>)}</div></div></section>

    <section className={s.brandSection}><div className={`container ${s.brandLayout}`}><Reveal><span className={s.eyebrow}><span/> Jouw bedrijf blijft herkenbaar</span><h2>Eén platform.<br /><em>Jouw uitstraling.</em></h2><p>Je klanten kiezen voor jouw dienstverlening. Laat je digitale omgeving daarbij aansluiten met je eigen logo, kleuren en bedrijfsgegevens. Professioneel van het eerste klantcontact tot de volgende afspraak.</p><a className={s.textLink} href="/platform">Ontdek je eigen klantomgeving <ArrowUpRight size={17}/></a></Reveal><Reveal className={s.brandVisual} delay={0.1}><div className={s.brandWindow}><div className={s.brandBar}><span/><span/><span/></div><div className={s.brandWindowBody}><span className={s.sampleLogo}><span><Building2 size={20}/></span>Jouw bedrijf<small>KLANTOMGEVING</small></span><p>Welkom terug, Eva.</p><strong>Je locaties. Je afspraken.<br/>Alles op één plek.</strong><div className={s.brandCards}><div><CalendarDays size={19}/><span>Afspraken</span><small>Bekijk je planning <ArrowUpRight size={11}/></small></div><div><Building2 size={19}/><span>Mijn locaties</span><small>Alle objecten <ArrowUpRight size={11}/></small></div><div><FileText size={19}/><span>Documenten</span><small>Inzicht en overzicht <ArrowUpRight size={11}/></small></div></div></div></div><div className={s.brandPalette}><div><span className={s.paletteBlue}/><span className={s.paletteGreen}/><span className={s.paletteWhite}/><Plus size={13}/></div><span>Vertrouwd voor je klant. Eigen aan jouw bedrijf.</span></div><small className={s.brandDemo}>Voorbeeld van eigen branding</small></Reveal></div></section>

    <VerticalBanner concept={concept}/>
    <section className={s.faqSection}><div className={`container ${s.faqLayout}`}><Reveal><SectionHeading eyebrow="Goed om te weten" title="Een helder antwoord. Een goede start." text="Ontdek wat Fieldgrid voor jouw servicebedrijf kan betekenen. Bespreek je werkproces met ons, of verken de mogelijkheden in een proefperiode."/><a className={s.textLink} href="/afspraak">Stel je vraag in een kennismaking <ArrowUpRight size={17}/></a></Reveal><Reveal delay={.1}><FAQ items={[
      { q: 'Voor welke servicebedrijven is Fieldgrid geschikt?', a: 'Fieldgrid sluit aan op bedrijven die mensen en werkzaamheden op klantlocaties organiseren. Denk aan schoonmaakbedrijven, glasbewassers, facilitaire dienstverleners, groenonderhoud en vastgoedservice. Planning, objectinformatie, werkbonnen en klantcontact vormen de gedeelde basis. Voor beveiliging en evenementen werken we de sectorspecifieke processen verder uit.' },
      { q: 'Wat brengt Fieldgrid samen in één platform?', a: 'Je beheert de planning, medewerkers, klanten en klantlocaties vanuit een centrale werkomgeving. Medewerkers gebruiken de personeelsapp voor hun afspraken, instructies en terugkoppeling. Klanten krijgen een eigen portaal voor onder meer locaties, afspraken, rapportages, facturen en servicevragen.' },
      { q: 'Kunnen medewerkers Fieldgrid op hun telefoon gebruiken?', a: 'Ja. De personeelsapp is een webapp die je op een geschikte telefoon als PWA kunt installeren. Medewerkers vinden er hun planning, informatie over de locatie en hun werkbonnen. Zo gaat de informatie uit de voorbereiding mee naar de werkvloer.' },
      { q: 'Kan ik met mijn eigen logo en kleuren werken?', a: 'Ja. Fieldgrid ondersteunt een herkenbare bedrijfsomgeving met je eigen logo, kleuren en bedrijfsgegevens. Zo sluit de digitale samenwerking met je medewerkers en klanten aan op jouw dienstverlening.' },
      { q: 'Hoe ontdek ik of Fieldgrid bij mijn bedrijf past?', a: 'Je kunt een proefperiode van 30 dagen aanvragen of een afspraak inplannen. Tijdens een kennismaking bespreken we je diensten, team en klantlocaties. Vervolgens kijken we welke processen een goede basis vormen voor jouw start met Fieldgrid.' },
    ]}/></Reveal></div></section>
    <ClosingCTA concept={concept}/>
  </>;
}


const onboardingSteps = [
  { name: 'Persoonlijke gegevens', note: 'Een herkenbaar profiel voor je team', icon: Users },
  { name: 'Documenten bekijken', note: 'De informatie voor een goede start', icon: FileText },
  { name: 'Beschikbaarheid doorgeven', note: 'Als jouw organisatie dit gebruikt', icon: Clock3 },
  { name: 'Je eerste werkdag', note: 'Planning en locatie-instructies bekijken', icon: ClipboardCheck },
];

function OnboardingPreview() {
  const [steps, setSteps] = useState([true, true, false, false]);
  const completed = steps.filter(Boolean).length;
  return <>
    <div className={s.onboardingCard}>
      <div className={s.onboardingTop}><img src="/branding/logo.svg" alt="Fieldgrid"/><span>Interactief voorbeeld</span></div>
      <div className={s.welcome}><span className={s.welcomeAvatar}>NM</span><div><span>Goed dat je er bent</span><h3>Welkom, Noor.</h3></div><Sparkles size={23} aria-hidden="true" /></div>
      <p>Maak je klaar voor je eerste werkdag.</p>
      <div className={s.progressLabels}><span>Jouw start</span><b aria-live="polite">{completed} van 4 stappen</b></div>
      <div className={s.progressTrack} role="progressbar" aria-label="Voortgang onboarding" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={4}><span style={{ width: `${completed * 25}%` }}/></div>
      <div className={s.onboardingList}>{onboardingSteps.map((step, index) => <button key={step.name} onClick={() => setSteps(current => current.map((done, i) => i === index ? !done : done))} className={steps[index] ? s.completedStep : ''} aria-pressed={steps[index]}><span className={s.onboardingCheck}>{steps[index] ? <Check size={15}/> : <step.icon size={16}/>}</span><span><b>{step.name}</b><small>{step.note}</small></span><ChevronRight size={15}/></button>)}</div>
      <div className={s.onboardingFooter}><ShieldCheck size={15}/><span>{completed === 4 ? 'Je bent klaar voor een fijne start.' : 'Probeer het: vink de stappen af.'}</span></div>
    </div>
    <span className={s.welcomeSticker}><CheckCircle2 size={18}/>{completed === 4 ? 'Een goede eerste werkdag.' : 'Een heldere start, stap voor stap.'}</span>
  </>;
}

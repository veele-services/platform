'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Building2, CalendarDays, Check, CheckCheck, ClipboardList, Clock3, Mail, MapPin, Phone, RotateCcw, Sparkles, Users } from 'lucide-react';
import { FAQ } from '@/components/fieldgrid/marketing/ui';
import s from './conversion-pages.module.css';

const sectorOptions = ['Schoonmaak', 'Glasbewassing', 'Facilitaire dienstverlening', 'Groenonderhoud', 'Vastgoedservice', 'Beveiliging', 'Evenementen', 'Andere dienstverlening'];
const sizes = ['1–10 medewerkers', '11–25 medewerkers', '26–50 medewerkers', '51–100 medewerkers', 'Meer dan 100 medewerkers'];
const goals = ['Meer grip op de planning', 'Duidelijker werken op locatie', 'Beter contact met klanten', 'Alles op één plek organiseren'];
const trialSteps = [
  { title: 'Bepaal je vertrekpunt', text: 'Kies één proces waarin je meer overzicht wilt. Maak vooraf duidelijk wat je team aan het einde van de proefperiode wil kunnen beoordelen.', icon: Sparkles },
  { title: 'Neem je team mee', text: 'Verken hoe de backoffice, de medewerker op locatie en de opdrachtgever elk hun eigen plek krijgen in dezelfde werkwijze.', icon: Users },
  { title: 'Richt een object in', text: 'Breng een locatie, contactpersoon en werkinstructies samen. Begin klein, zodat de opzet herkenbaar blijft voor je medewerkers.', icon: Building2 },
  { title: 'Doorloop een werkbon', text: 'Volg een opdracht van planning naar uitvoering. Bekijk hoe instructies, een checklist en terugkoppeling op elkaar aansluiten.', icon: ClipboardList },
  { title: 'Bespreek het resultaat', text: 'Vergelijk de werkwijze met je huidige proces. Verzamel de vragen van je team en bepaal welke inrichting jouw organisatie nodig heeft.', icon: CheckCheck },
];

type IntakeResult = { ok: true; leadId: string; requestId: string; appointmentId?: string; notificationStatus?: string };
type IntakeInput = { kind: 'appointment' | 'demo' | 'trial'; name: string; company: string; email: string; phone: string; sector?: string; team?: string; goal?: string; message?: string; date?: string; time?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
async function readResponse(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value : null;
  } catch { return null; }
}
function isIntakeResult(value: unknown): value is IntakeResult {
  return isRecord(value) && value.ok === true && typeof value.leadId === 'string' && typeof value.requestId === 'string'
    && (value.appointmentId === undefined || typeof value.appointmentId === 'string')
    && (value.notificationStatus === undefined || typeof value.notificationStatus === 'string');
}
function isAvailability(value: unknown): value is { date: string; slots: string[] } {
  return isRecord(value) && typeof value.date === 'string' && Array.isArray(value.slots)
    && value.slots.every((slot: unknown) => typeof slot === 'string' && /^\d{2}:\d{2}$/.test(slot));
}

class IntakeError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

function useIntake() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<IntakeResult | null>(null);
  const busy = useRef(false);
  const idempotencyKey = useRef('');
  function invalidate() { idempotencyKey.current = ''; setError(''); }
  function reset() { invalidate(); setResult(null); }
  async function submit(input: IntakeInput) {
    if (busy.current) return null;
    busy.current = true;
    setPending(true);
    setError('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
      const response = await fetch('/api/crm/intake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ ...input, idempotencyKey: idempotencyKey.current }),
      });
      const body = await readResponse(response);
      if (!response.ok) throw new IntakeError(typeof body?.error === 'string' ? body.error : 'Je aanvraag kon nog niet worden opgeslagen. Probeer het opnieuw.', response.status);
      if (!isIntakeResult(body) || (input.date && !body.appointmentId)) throw new IntakeError('Opslaan is nog niet bevestigd. Probeer opnieuw; dezelfde aanvraag wordt niet dubbel geregistreerd.');
      setResult(body);
      return body;
    } catch (cause) {
      const failure = cause instanceof IntakeError ? cause : new IntakeError('We konden het opslaan niet bevestigen. Probeer opnieuw; dezelfde aanvraag wordt niet dubbel geregistreerd.');
      setError(failure.message);
      throw failure;
    } finally {
      window.clearTimeout(timeout);
      busy.current = false;
      setPending(false);
    }
  }
  return { pending, error, result, submit, reset, invalidate };
}

function PrototypeNote({ kind }: { kind: 'trial' | 'appointment' }) {
  return <div className={s.prototypeNote}><span className={s.noteDot} /><p><strong>Rechtstreeks naar Fieldgrid.</strong> Je aanvraag wordt opgeslagen in het CRM van Fieldgrid. {kind === 'trial' ? 'Er wordt nog geen proefaccount geactiveerd.' : 'Je reserveert een moment in de Fieldgrid-agenda.'}</p></div>;
}

function Receipt({ result, appointment = false }: { result: IntakeResult; appointment?: boolean }) {
  const status = result.notificationStatus;
  const notification = status === 'accepted'
    ? 'De e-maildienst heeft de beheerdersmelding geaccepteerd. De uiteindelijke bezorging is daarmee nog niet bevestigd.'
    : status === 'failed'
      ? 'De beheerdersmelding vraagt nog aandacht. Je aanvraag is wel opgeslagen en zichtbaar in het CRM.'
      : status === 'queued' || status === 'sending'
        ? 'De beheerdersmelding staat klaar voor verwerking; dit is nog geen bevestiging van e-mailbezorging.'
        : status === 'pending_config'
          ? 'Je aanvraag staat in het CRM. De beheerdersmelding wacht nog op verwerking of configuratie.'
          : status === 'demo'
            ? 'De beheerdersmelding is als voorbeeld in het CRM klaargezet. Er is geen echte e-mail verstuurd.'
            : 'De status van de beheerdersmelding staat bij je aanvraag in het CRM.';
  return <div className={s.receipt}><div><CheckCheck size={17} aria-hidden="true" /><p><strong>Aanvraag geregistreerd</strong><span>Referentie: {result.requestId}</span></p></div><div><Mail size={17} aria-hidden="true" /><p>{notification}</p></div>{appointment && <div><CalendarDays size={17} aria-hidden="true" /><p>Je gekozen tijd is gereserveerd in de Fieldgrid-agenda. Er is geen synchronisatie met een externe agenda.</p></div>}</div>;
}

function Progress({ items, current }: { items: string[]; current: number }) {
  return <ol className={s.progress} aria-label="Voortgang">{items.map((label, i) => <li key={label} className={i === current ? s.currentStep : i < current ? s.doneStep : ''} aria-current={i === current ? 'step' : undefined}><span>{i < current ? <Check size={13} aria-hidden="true" /> : String(i + 1).padStart(2, '0')}</span><strong>{label}</strong></li>)}</ol>;
}

function TrialForm() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ company: '', sector: '', team: '', goal: goals[0], name: '', email: '', phone: '' });
  const intake = useIntake();
  const heading = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);
  useEffect(() => { if (started.current) heading.current?.focus({ preventScroll: true }); else started.current = true; }, [step, intake.result]);
  const update = (key: keyof typeof data, value: string) => { intake.invalidate(); setData(old => ({ ...old, [key]: value })); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 2) { setStep(step + 1); return; }
    try { await intake.submit({ kind: 'trial', ...data }); } catch { /* The form keeps its values and shows the server error. */ }
  }
  function reset() { setStep(0); intake.reset(); setData({ company: '', sector: '', team: '', goal: goals[0], name: '', email: '', phone: '' }); }
  return <div className={s.formCard} id="proefopzet">
    <div className={s.cardTop}><span><span className={s.greenDot} /> Jouw volgende stap</span><strong>30 dagen verkennen</strong></div>
    <PrototypeNote kind="trial" />
    {intake.result ? <section className={s.success} aria-live="polite">
      <div className={s.successIcon}><CheckCheck size={28} aria-hidden="true" /></div><span className={s.eyebrow}>Jouw aanvraag is ontvangen</span>
      <h2 ref={heading} tabIndex={-1}>Een helder begin voor {data.company}.</h2>
      <p>Je aanvraag voor een proefperiode van 30 dagen staat in het Fieldgrid CRM. Je gekozen aandachtspunt: <strong>{data.goal.toLowerCase()}.</strong></p>
      <div className={s.summaryLine}><span>{data.sector}</span><span>{data.team}</span></div>
      <ol className={s.personalPlan}>{trialSteps.map((item, i) => <li key={item.title}><span>{i + 1}</span><div><strong>{item.title}</strong><p>{i === 0 ? `Begin met een herkenbare opdracht binnen ${data.sector.toLowerCase()}. Bespreek met je team wat “${data.goal.toLowerCase()}” in de praktijk betekent.` : item.text}</p></div></li>)}</ol>
      <Receipt result={intake.result} />
      <p className={s.submitNote}>De aanvraag is geregistreerd. Er is nog geen proefaccount of abonnement aangemaakt.</p>
      <a className={s.primaryButton} href="/platform">Verken het platform <ArrowUpRight size={17} aria-hidden="true" /></a>
      <button className={s.resetButton} onClick={reset}><RotateCcw size={15} aria-hidden="true" /> Nieuwe aanvraag</button>
    </section> : <>
      <Progress items={['Je organisatie', 'Kennismaken', 'Je proefopzet']} current={step} />
      <form onSubmit={submit} className={s.form} aria-busy={intake.pending}>
        <fieldset disabled={intake.pending} className={s.formFields}>
          <div className={s.formHeading}><span className={s.eyebrow}>Stap {step + 1} van 3</span><h2 ref={heading} tabIndex={-1}>{['Hoe ziet jouw organisatie eruit?', 'Met wie maken we kennis?', 'Klaar om verder te kijken?'][step]}</h2><p>{['Vertel kort wat je doet. Zo krijgt je proefopzet een vertrekpunt dat bij jouw dienstverlening past.', 'We koppelen je contactgegevens aan je aanvraag, zodat alle informatie overzichtelijk bij elkaar blijft.', 'Bekijk je keuzes en dien je aanvraag in. We leggen je proefopzet vast in het Fieldgrid CRM.'][step]}</p></div>
          {step === 0 && <div className={s.fields}>
            <label className={s.field} htmlFor="trial-company">Bedrijfsnaam<input id="trial-company" name="company" autoComplete="organization" required pattern=".*\S.*" maxLength={100} placeholder="Bijvoorbeeld: Van Dijk Services" value={data.company} onChange={e => update('company', e.target.value)} /></label>
            <div className={s.fieldRow}><label className={s.field} htmlFor="trial-sector">Jouw branche<select id="trial-sector" name="sector" required value={data.sector} onChange={e => update('sector', e.target.value)}><option value="" disabled>Selecteer je branche</option>{sectorOptions.map(x => <option key={x}>{x}</option>)}</select></label><label className={s.field} htmlFor="trial-team">Grootte van je team<select id="trial-team" name="team" required value={data.team} onChange={e => update('team', e.target.value)}><option value="" disabled>Selecteer teamgrootte</option>{sizes.map(x => <option key={x}>{x}</option>)}</select></label></div>
            <label className={s.field} htmlFor="trial-goal">Waar wil je mee beginnen?<select id="trial-goal" name="goal" value={data.goal} onChange={e => update('goal', e.target.value)}>{goals.map(x => <option key={x}>{x}</option>)}</select></label>
            {['Beveiliging', 'Evenementen'].includes(data.sector) && <p className={s.inlineNote}>Voor {data.sector.toLowerCase()} onderzoeken we de sectorspecifieke verdieping. Je kunt de basis voor planning, medewerkers en locaties alvast verkennen.</p>}
          </div>}
          {step === 1 && <div className={s.fields}>
            <label className={s.field} htmlFor="trial-name">Je naam<input id="trial-name" name="name" autoComplete="name" required pattern=".*\S.*" maxLength={80} placeholder="Voor- en achternaam" value={data.name} onChange={e => update('name', e.target.value)} /></label>
            <label className={s.field} htmlFor="trial-email">Zakelijk e-mailadres<input id="trial-email" name="email" type="email" autoComplete="email" required maxLength={150} placeholder="naam@bedrijf.nl" value={data.email} onChange={e => update('email', e.target.value)} /></label>
            <label className={s.field} htmlFor="trial-phone">Telefoonnummer <span>optioneel</span><input id="trial-phone" name="phone" type="tel" autoComplete="tel" maxLength={30} placeholder="06 1234 5678" value={data.phone} onChange={e => update('phone', e.target.value)} /></label>
            <div className={s.helpCard}><Mail size={20} aria-hidden="true" /><p>Je aanvraag komt bij de platformbeheerder terecht. Na het indienen zie je direct of de registratie is gelukt.</p></div>
          </div>}
          {step === 2 && <div className={s.review}><div className={s.reviewHeading}><Building2 size={24} aria-hidden="true" /><div><span>Jouw organisatie</span><h3>{data.company}</h3></div><button type="button" onClick={() => setStep(0)}>Wijzigen</button></div><dl><div><dt>Branche</dt><dd>{data.sector}</dd></div><div><dt>Team</dt><dd>{data.team}</dd></div><div><dt>Vertrekpunt</dt><dd>{data.goal}</dd></div><div><dt>Contactpersoon</dt><dd>{data.name}</dd></div><div><dt>E-mailadres</dt><dd>{data.email}</dd></div></dl><div className={s.reviewFoot}><CalendarDays size={19} aria-hidden="true" /><p>Een opzet voor 30 dagen: van je eerste locatie tot een gezamenlijke evaluatie.</p></div></div>}
          {intake.error && <div className={s.submitError} role="alert">{intake.error}</div>}
          <div className={s.formActions}>{step > 0 && <button className={s.backButton} type="button" onClick={() => setStep(step - 1)}><ArrowLeft size={16} aria-hidden="true" /> Vorige</button>}<button className={s.primaryButton} type="submit" disabled={intake.pending}>{intake.pending ? 'Aanvraag opslaan…' : step === 2 ? 'Vraag mijn proefperiode aan' : 'Volgende stap'}<ArrowRight size={17} aria-hidden="true" /></button></div>
          {step === 2 && <p className={s.submitNote}>Je aanvraag wordt opgeslagen in het CRM. Je activeert hiermee nog geen account of abonnement.</p>}
        </fieldset>
      </form>
    </>}
  </div>;
}

function amsterdamToday() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
}
function friendlyDate(value: string) { if (!value) return 'Nog geen datum gekozen'; return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(new Date(`${value}T12:00:00Z`)); }

function AppointmentForm({initialKind='appointment'}:{initialKind?:'appointment'|'demo'}) {
  const [step, setStep] = useState(0);
  const [minDate] = useState(amsterdamToday);
  const [dateError, setDateError] = useState('');
  const [timeError, setTimeError] = useState(false);
  const [data, setData] = useState({ date: '', time: '', kind: initialKind, name: '', company: '', email: '', phone: '', message: '' });
  const [slots, setSlots] = useState<string[]>([]);
  const [loadedSlotKey,setLoadedSlotKey] = useState('');
  const [slotsError, setSlotsError] = useState('');
  const [refreshSlots, setRefreshSlots] = useState(0);
  const availabilityRequest = useRef({version:0});
  const heading = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);
  const intake = useIntake();
  const slotsLoading=!!data.date&&loadedSlotKey!==data.date+':'+refreshSlots;
  const conversation = data.kind === 'demo' ? 'Productdemo' : 'Kennismaking';
  useEffect(() => { if (started.current) heading.current?.focus({ preventScroll: true }); else started.current = true; }, [step, intake.result]);
  useEffect(() => {
    const requests=availabilityRequest.current;
    const version = ++requests.version;
    const controller = new AbortController();
    if (!data.date) return () => controller.abort();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    async function load() {
      try {
        const response = await fetch(`/api/crm/availability?date=${encodeURIComponent(data.date)}`, { signal: controller.signal, cache: 'no-store' });
        const body = await readResponse(response);
        if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'De beschikbare tijden konden niet worden geladen.');
        if (!isAvailability(body) || body.date !== data.date) throw new Error('De agenda gaf geen geldige tijden terug. Probeer opnieuw.');
        if (version !== requests.version || controller.signal.aborted) return;
        const available = [...new Set<string>(body.slots)].sort();
        setSlots(available);setSlotsError('');
        setData(old => ({ ...old, time: available.includes(old.time) ? old.time : '' }));
      } catch (cause) {
        if (version !== requests.version) return;
        setSlotsError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'De agenda reageert niet. Probeer de tijden opnieuw te laden.');
      } finally {
        window.clearTimeout(timeout);
        if (version === requests.version) setLoadedSlotKey(data.date+':'+refreshSlots);
      }
    }
    void load();
    return () => { ++requests.version; window.clearTimeout(timeout); controller.abort(); };
  }, [data.date, refreshSlots]);
  const update = (key: keyof typeof data, value: string) => {
    intake.invalidate();
    setData(old => ({ ...old, [key]: value, ...(key === 'date' ? { time: '' } : {}) }));
    if (key === 'date') { setDateError(''); setTimeError(false); }
    if (key === 'time') setTimeError(false);
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 0) {
      if (!data.date || data.date < amsterdamToday()) { setDateError('Kies een datum vanaf vandaag.'); return; }
      if (slotsLoading || slotsError || !data.time || !slots.includes(data.time)) { setTimeError(true); return; }
      setStep(1);
      return;
    }
    try { await intake.submit(data); }
    catch (failure) {
      if (failure instanceof IntakeError && failure.status === 409) {
        setData(old => ({ ...old, time: '' }));
        setStep(0);
        setRefreshSlots(old => old + 1);
      }
    }
  }
  function reset() {
    intake.reset(); setStep(0); setDateError(''); setTimeError(false);
    setData({ date: '', time: '', kind: data.kind, name: '', company: '', email: '', phone: '', message: '' });
  }
  return <div className={s.formCard} id="afspraak-kiezen">
    <div className={s.cardTop}><span><span className={s.greenDot} /> Tijd voor jouw werkdag</span><strong>Telefonisch · 30 minuten</strong></div><PrototypeNote kind="appointment" />
    {intake.result ? <section className={s.success} aria-live="polite">
      <div className={s.successIcon}><CalendarDays size={28} aria-hidden="true" /></div><span className={s.eyebrow}>Jouw moment is gereserveerd</span>
      <h2 ref={heading} tabIndex={-1}>Je staat in de agenda, {data.name.trim().split(' ')[0]}.</h2>
      <p>Je {conversation.toLowerCase()} is vastgelegd in de Fieldgrid-agenda. Alle gegevens en je gespreksonderwerp staan samen in het CRM.</p>
      <div className={s.appointmentSummary}><div><CalendarDays size={20} aria-hidden="true" /><span>{friendlyDate(data.date)}</span></div><div><Clock3 size={20} aria-hidden="true" /><span>{data.time} uur · 30 minuten · Nederlandse tijd</span></div><div><Phone size={20} aria-hidden="true" /><span>{conversation} · telefonisch op {data.phone}</span></div><div><Building2 size={20} aria-hidden="true" /><span>{data.company}</span></div></div>
      {data.message.trim() && <div className={s.questionSummary}><strong>Jouw gespreksonderwerp</strong><p>{data.message}</p></div>}
      <Receipt result={intake.result} appointment />
      <a className={s.primaryButton} href="/platform">Ontdek alvast het platform <ArrowUpRight size={17} aria-hidden="true" /></a>
      <button className={s.resetButton} onClick={reset}><RotateCcw size={15} aria-hidden="true" /> Nieuwe aanvraag</button>
    </section> : <>
      <Progress items={['Een moment kiezen', 'Jouw gegevens']} current={step} />
      <form className={s.form} onSubmit={submit} aria-busy={intake.pending}>
        <fieldset disabled={intake.pending} className={s.formFields}>
          <div className={s.formHeading}><span className={s.eyebrow}>Stap {step + 1} van 2</span><h2 ref={heading} tabIndex={-1}>{step === 0 ? 'Wanneer past het jou?' : 'Maak het gesprek persoonlijk.'}</h2><p>{step === 0 ? 'Kies je gespreksonderwerp en een vrij moment in onze agenda. We maken telefonisch kennis en nemen rustig de tijd voor je vragen.' : 'Vertel wie je bent en welke vraag je wilt bespreken. We gebruiken je telefoonnummer voor het gesprek.'}</p></div>
          {step === 0 ? <div className={s.fields}>
            <fieldset className={s.choiceField}><legend>Waar wil je over praten?</legend><div className={s.meetingChoices}>{[{ kind: 'appointment', name: 'Kennismaking', icon: Phone, detail: 'Je organisatie en vragen bespreken' }, { kind: 'demo', name: 'Productdemo', icon: ClipboardList, detail: 'Samen de mogelijkheden doorlopen' }].map(item => <label key={item.kind} className={data.kind === item.kind ? s.selectedChoice : ''}><input type="radio" name="kind" value={item.kind} checked={data.kind === item.kind} onChange={e => update('kind', e.target.value)} /><item.icon size={20} aria-hidden="true" /><strong>{item.name}</strong><small>{item.detail}</small></label>)}</div></fieldset>
            <div className={s.callNote}><Phone size={16} aria-hidden="true" /><span>Een persoonlijk telefoongesprek van 30 minuten.</span></div>
            <label className={s.field} htmlFor="appointment-date">Kies een datum<input id="appointment-date" type="date" name="date" required min={minDate || undefined} value={data.date} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? 'date-error' : 'date-help'} onChange={e => update('date', e.target.value)} /><small id="date-help">De agenda toont de vrijgegeven momenten. Alle tijden zijn Nederlandse tijd (Europe/Amsterdam).</small>{dateError && <span className={s.error} id="date-error" role="alert">{dateError}</span>}</label>
            <fieldset className={s.choiceField} aria-busy={slotsLoading} aria-describedby={timeError ? 'time-error' : undefined}><legend>Kies een beschikbare tijd</legend>
              <div aria-live="polite">{!data.date ? <p className={s.availabilityNote}>Kies eerst een datum om de vrije momenten te bekijken.</p> : slotsLoading ? <p className={s.availabilityNote}><Clock3 size={16} aria-hidden="true" /> Beschikbare momenten ophalen…</p> : slotsError ? <div className={s.availabilityError}><p>{slotsError}</p><button type="button" onClick={() => setRefreshSlots(old => old + 1)}>Opnieuw laden <RotateCcw size={13} aria-hidden="true" /></button></div> : slots.length === 0 ? <p className={s.availabilityNote}>Er zijn op deze dag geen vrije momenten. Kies een andere datum.</p> : <div className={s.timeChoices}>{slots.map(time => <label key={time} className={data.time === time ? s.selectedTime : ''}><input type="radio" name="time" value={time} checked={data.time === time} onChange={e => update('time', e.target.value)} /><Clock3 size={14} aria-hidden="true" />{time}</label>)}</div>}</div>
              {timeError && <p className={s.error} id="time-error" role="alert">Kies een beschikbare tijd om verder te gaan.</p>}
            </fieldset>
          </div> : <div className={s.fields}>
            <div className={s.momentPill}><CalendarDays size={18} aria-hidden="true" /><span>{friendlyDate(data.date)}<strong>{data.time} uur · {conversation} · telefonisch</strong></span><button type="button" onClick={() => setStep(0)}>Wijzigen</button></div>
            <div className={s.fieldRow}><label className={s.field} htmlFor="appointment-name">Je naam<input id="appointment-name" name="name" autoComplete="name" required pattern=".*\S.*" maxLength={80} placeholder="Voor- en achternaam" value={data.name} onChange={e => update('name', e.target.value)} /></label><label className={s.field} htmlFor="appointment-company">Bedrijfsnaam<input id="appointment-company" name="company" autoComplete="organization" required pattern=".*\S.*" maxLength={100} placeholder="Naam van je organisatie" value={data.company} onChange={e => update('company', e.target.value)} /></label></div>
            <label className={s.field} htmlFor="appointment-email">Zakelijk e-mailadres<input id="appointment-email" type="email" name="email" autoComplete="email" required maxLength={150} placeholder="naam@bedrijf.nl" value={data.email} onChange={e => update('email', e.target.value)} /></label>
            <label className={s.field} htmlFor="appointment-phone">Telefoonnummer<input id="appointment-phone" type="tel" name="phone" autoComplete="tel" required pattern="[0-9+\s\.\(\)\-]{7,30}" maxLength={30} placeholder="06 1234 5678" value={data.phone} onChange={e => update('phone', e.target.value)} /><small>Op dit nummer vindt het telefoongesprek plaats.</small></label>
            <label className={s.field} htmlFor="appointment-question">Wat wil je graag bespreken? <span>optioneel</span><textarea id="appointment-question" name="message" rows={3} maxLength={1500} placeholder="Bijvoorbeeld: hoe richten we terugkerend werk in voor verschillende klantlocaties?" value={data.message} onChange={e => update('message', e.target.value)} /></label>
          </div>}
          {intake.error && <div className={s.submitError} role="alert">{intake.error}</div>}
          <div className={s.formActions}>{step > 0 && <button className={s.backButton} type="button" onClick={() => setStep(0)}><ArrowLeft size={16} aria-hidden="true" /> Vorige</button>}<button className={s.primaryButton} type="submit" disabled={intake.pending || (step === 0 && (slotsLoading || !data.time))}>{intake.pending ? 'Afspraak vastleggen…' : step === 0 ? 'Verder met dit moment' : 'Bevestig mijn afspraak'}<ArrowRight size={17} aria-hidden="true" /></button></div>
          {step === 1 && <p className={s.submitNote}>Na bevestiging leggen we je aanvraag en gekozen moment vast in de Fieldgrid-agenda.</p>}
        </fieldset>
      </form>
    </>}
  </div>;
}

export function TrialPage() {
  return <div className={s.page}><section className={s.hero}><div className={`container ${s.heroGrid}`}><div className={s.heroCopy}><span className={s.eyebrow}><span /> Ontdek Fieldgrid in jouw werkdag</span><h1>Probeer Fieldgrid<br /><em>30 dagen gratis.</em></h1><p className={s.intro}>Meer overzicht begint met ervaren wat er anders kan. Verken hoe planning, digitale werkbonnen en klantlocaties samenkomen in één omgeving voor jouw dienstverlening.</p><ul className={s.checkList}><li><Check size={17} aria-hidden="true" /> Begin bij één herkenbaar werkproces.</li><li><Check size={17} aria-hidden="true" /> Bekijk de rollen van kantoor, team en klant.</li><li><Check size={17} aria-hidden="true" /> Ontdek welke inrichting bij je organisatie past.</li></ul><div className={s.heroPhoto}><img src="/fieldgrid-site-assets/images/people.webp" width={1200} height={800} alt="Medewerkers bespreken samen de werkzaamheden op een tablet" /><div><span>Van eerste overzicht</span><strong>naar samen vooruit.</strong></div><span className={s.photoBadge}><Sparkles size={17} aria-hidden="true" /> Jouw werk. Verbonden.</span></div><p className={s.alternative}>Liever eerst persoonlijk kennismaken? <a href="/afspraak">Plan een afspraak in <ArrowUpRight size={14} aria-hidden="true" /></a></p></div><TrialForm /></div></section><section className={`container ${s.contentSection}`}><div className={s.sectionHead}><span className={s.eyebrow}>Een proefperiode met richting</span><h2>Van nieuwsgierig naar<br />een werkbare volgende stap.</h2><p>Nieuwe bedrijfssoftware kies je op wat het jouw dagelijkse praktijk brengt. Gebruik de proefperiode om het hele proces te bekijken: van de voorbereiding op kantoor tot een afgeronde opdracht en terugkoppeling aan je klant.</p></div><div className={s.exploreGrid}>{[{ icon: CalendarDays, title: 'Overzicht voor je backoffice', text: 'Bekijk hoe je opdrachten plant, medewerkers betrekt en terugkerend werk organiseert. Begin met een beperkte selectie van locaties en werkzaamheden, zodat het proces overzichtelijk blijft.' }, { icon: ClipboardList, title: 'Duidelijkheid op de werkvloer', text: 'Onderzoek welke informatie je medewerkers op locatie nodig hebben. Een duidelijke opdracht, praktische instructies en een passende checklist vormen de basis voor een herkenbare werkwijze.' }, { icon: Building2, title: 'Een verbonden klantdossier', text: 'Verken hoe locaties, afspraken en terugkoppeling bij elkaar staan. Bekijk ook de klantomgeving, zodat je niet alleen vanuit de planning, maar vanuit de hele dienstverlening beoordeelt.' }].map(item => <article key={item.title}><span className={s.featureIcon}><item.icon size={23} aria-hidden="true" /></span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section><section className={s.blueBand}><div className={`container ${s.blueGrid}`}><div><span className={s.eyebrow}>Klein beginnen. Bewust verder.</span><h2>Jouw eerste stappen<br />in Fieldgrid.</h2><p>Je hoeft je organisatie niet in één keer opnieuw in te richten. Kies een herkenbare opdracht en gebruik die als rode draad voor jouw verkenning.</p><a href="#proefopzet" className={s.lightButton}>Maak jouw proefopzet <ArrowUpRight size={17} aria-hidden="true" /></a></div><ol className={s.timeline}>{trialSteps.map((item, i) => <li key={item.title}><span>{String(i + 1).padStart(2, '0')}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></li>)}</ol></div></section><section className={`container ${s.faqSection}`}><div className={s.sectionHead}><span className={s.eyebrow}>Goed om te weten</span><h2>Jouw vragen,<br />helder beantwoord.</h2><p>Heb je een specifieke vraag over jouw proces of branche? Een persoonlijk gesprek helpt om de juiste uitgangspunten te bepalen.</p><a href="/afspraak" className={s.textLink}>Plan een afspraak in <ArrowUpRight size={17} aria-hidden="true" /></a></div><FAQ items={[{ q: 'Wat kan ik tijdens een proefperiode onderzoeken?', a: 'Richt je op een complete, herkenbare werkstroom: een locatie vastleggen, een opdracht voorbereiden, werk plannen en de uitvoering bekijken. Betrek zowel iemand van kantoor als iemand uit het team. Zo beoordeel je of de werkwijze aansluit bij jouw dagelijkse dienstverlening.' }, { q: 'Is Fieldgrid geschikt voor mijn branche?', a: 'De basis sluit aan op schoonmaak, glasbewassing, facilitaire dienstverlening, groenonderhoud en vastgoedservice. Planning, locaties, medewerkers en terugkoppeling spelen in elk van deze branches een centrale rol. Voor beveiliging en evenementen is sectorspecifieke verdieping een ontwikkelrichting die we apart bespreken.' }, { q: 'Start ik via dit formulier al een echte proefperiode?', a: 'Je aanvraag wordt opgeslagen in het gekoppelde Fieldgrid CRM, samen met je contactgegevens en gekozen proefopzet. Het prototype activeert nog geen account of abonnement. Gebruik daarom testgegevens; de platformbeheerder kan de aanvraag en vervolgstappen bekijken in de pipeline.' }]} /></section></div>;
}

export function AppointmentPage({initialKind='appointment'}:{initialKind?:'appointment'|'demo'}) {
  return <div className={s.page}><section className={`${s.hero} ${s.appointmentHero}`}><div className={`container ${s.heroGrid}`}><div className={s.heroCopy}><span className={s.eyebrow}><span /> Laten we kennismaken</span><h1>Jouw werkdag.<br /><em>Ons vertrekpunt.</em></h1><p className={s.intro}>Plan een afspraak in en ontdek wat Fieldgrid voor jouw organisatie kan betekenen. We beginnen bij hoe jouw team vandaag werkt en kijken samen waar planning, uitvoering en klantcontact beter kunnen aansluiten.</p><div className={s.conversationPoints}><div><span>01</span><p><strong>Jouw organisatie</strong>Wat loopt goed, en waar kost de werkdag onnodig veel afstemming?</p></div><div><span>02</span><p><strong>Een herkenbaar werkproces</strong>Volg een opdracht langs kantoor, medewerker en klant.</p></div><div><span>03</span><p><strong>Een concrete vervolgstap</strong>Bepaal welke inrichting en verdieping aandacht verdienen.</p></div></div><div className={s.heroPhoto}><img src="/fieldgrid-site-assets/images/facilitair.webp" width={1200} height={800} alt="Facilitair medewerker op een klantlocatie met een tablet" /><div><span>Persoonlijk kennismaken.</span><strong>Praktisch vooruitkijken.</strong></div></div><p className={s.alternative}>Liever eerst zelf verkennen? <a href="/proberen">Probeer nu 30 dagen gratis <ArrowUpRight size={14} aria-hidden="true" /></a></p></div><AppointmentForm initialKind={initialKind} /></div></section><section className={`container ${s.contentSection}`}><div className={s.sectionHead}><span className={s.eyebrow}>Een gesprek dat ergens over gaat</span><h2>Maak van jouw praktijk<br />een helder vertrekpunt.</h2><p>Een goede kennismaking gaat verder dan een rondleiding langs schermen. Daarom kijken we naar de samenhang tussen je mensen, klantlocaties, werkzaamheden en afspraken.</p></div><div className={s.exploreGrid}>{[{ icon: MapPin, title: 'Neem een locatie als voorbeeld', text: 'Denk aan een klantlocatie waar jouw team regelmatig komt. Welke werkzaamheden horen erbij? Wie doet de voorbereiding? Welke informatie heeft een medewerker ter plaatse nodig? Met een concreet voorbeeld wordt de werking van Fieldgrid direct herkenbaar.' }, { icon: Users, title: 'Betrek de juiste mensen', text: 'Een planner, uitvoerder en eigenaar kijken elk anders naar dezelfde opdracht. Bedenk vooraf welke vragen bij die verschillende rollen leven. Zo ontstaat een vollediger beeld van wat een nieuwe werkwijze voor jouw organisatie moet ondersteunen.' }, { icon: ClipboardList, title: 'Kies wat je wilt verbeteren', text: 'Van losse instructies tot terugkerende planning: niet alles hoeft tegelijk. Kies één of twee processen die nu veel aandacht vragen. Dat helpt om samen te bepalen waar een eerste inrichting van Fieldgrid het meest logisch begint.' }].map(item => <article key={item.title}><span className={s.featureIcon}><item.icon size={23} aria-hidden="true" /></span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section><section className={s.softBand}><div className={`container ${s.prepareGrid}`}><div><span className={s.eyebrow}>Goed voorbereid, goed gesprek</span><h2>Drie dingen om<br />alvast over na te denken.</h2><p>Je hoeft geen uitgebreid document klaar te hebben. Een korte omschrijving van je dienstverlening en een paar herkenbare situaties geven het gesprek al richting.</p><a href="#afspraak-kiezen" className={s.primaryButton}>Plan een afspraak in <ArrowUpRight size={17} aria-hidden="true" /></a></div><div className={s.preparationCards}><article><span>01 / Je werkstroom</span><h3>Hoe komt een opdracht bij je team terecht?</h3><p>Denk aan aanvragen, terugkerend werk, wijzigingen en de overdracht van kantoor naar locatie.</p></article><article><span>02 / Je informatie</span><h3>Waar staat wat je medewerkers nodig hebben?</h3><p>Bekijk hoe je nu adressen, contactpersonen, locatie-instructies en uitvoeringsinformatie deelt.</p></article><article><span>03 / Je terugkoppeling</span><h3>Wanneer weet je dat het werk klaar is?</h3><p>Denk aan controle, rapportages, vragen van klanten en de vervolgstappen op kantoor.</p></article></div></div></section><section className={`container ${s.faqSection}`}><div className={s.sectionHead}><span className={s.eyebrow}>Voor je kennismaking</span><h2>Wat wil je<br />nog weten?</h2><p>Van een eerste oriëntatie tot een concrete vraag over je planning: begin bij de onderwerpen die voor jouw organisatie belangrijk zijn.</p></div><FAQ items={[{ q: 'Voor welke organisaties is een kennismaking zinvol?', a: 'Fieldgrid richt zich op dienstverleners met medewerkers en werkzaamheden op klantlocaties. Denk aan schoonmaak, glasbewassing, facilitair, groenonderhoud en vastgoedservice. Ook als je verschillende diensten combineert, is het zinvol om te kijken hoe planning, objectinformatie en uitvoering samen kunnen komen.' }, { q: 'Kan ik ook vragen stellen over beveiliging of evenementen?', a: 'Ja. De basis voor medewerkers, opdrachten en locaties is relevant, maar deze branches vragen ook om aanvullende processen. Denk aan diensten, briefings en bijzondere overdrachten. In een gesprek maken we onderscheid tussen de bestaande basis en de sectorspecifieke verdieping die nog nodig is.' }, { q: 'Is mijn afspraak direct ingepland?', a: 'Ja, na een geslaagde bevestiging wordt je moment gereserveerd in de Fieldgrid-agenda. Je ziet alleen vrijgegeven momenten die nog beschikbaar zijn. Je aanvraag komt met je contactgegevens in de CRM-pipeline. Een eventuele externe agenda en daadwerkelijke e-mailbezorging hebben een aparte koppeling en status.' }]} /></section></div>;
}

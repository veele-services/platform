"use client";

import { AddressInput } from "../address-input";
import { Bell, Check, Navigation, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { NotificationPreferences } from "@/lib/notifications/model";
import type { StaffOnboardingDraft } from "@/lib/staff/model";
import type { StaffPersonnel, StaffWorkspaceData } from "@/lib/staff/workspace";
import { defaultOnboarding } from "@/lib/staff/onboarding";
import { saveStaffOnboarding } from "@/app/staff/actions";
import { NotificationPushControl } from "@/components/fieldgrid/notifications/push";

const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const dayLabels: Record<(typeof dayKeys)[number], string> = { monday: "Maandag", tuesday: "Dinsdag", wednesday: "Woensdag", thursday: "Donderdag", friday: "Vrijdag", saturday: "Zaterdag", sunday: "Zondag" };
const shiftOptions = ["day", "evening", "night"] as const;
const vehicleLabels: Record<StaffOnboardingDraft["transport"]["vehicle"], string> = {
  car: "Auto", van: "Bedrijfsbus", motorcycle: "Motor", scooter: "Scooter", bicycle: "Fiets",
  electric_bicycle: "E-bike", public_transport: "Openbaar vervoer", walking: "Lopend", other: "Anders",
};

export function Onboarding({ profile, depots, email, notificationPreferences, pending, run, onCompleted }: { profile: StaffPersonnel; depots: StaffWorkspaceData["staffDepots"]; email: string; notificationPreferences: NotificationPreferences; pending: boolean; run: (task: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) => void; onCompleted: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const signout = useRef<HTMLFormElement>(null);
  const availabilityEnabled = Boolean(profile.availability_self_service_enabled);
  const labels = availabilityEnabled ? ["Welkom", "Profiel", "Vervoer", "Beschikbaarheid", "Meldingen", "Controleren"] : ["Welkom", "Profiel", "Vervoer", "Meldingen", "Controleren"];
  const [stepKey, setStepKey] = useState(() => labels[Math.min(profile.onboarding_step ?? 0, labels.length - 1)] ?? "Welkom");
  const [draft, setDraft] = useState(() => defaultOnboarding(profile, notificationPreferences));
  const [version, setVersion] = useState(profile.onboarding_version ?? 1);
  const [personnelVersion, setPersonnelVersion] = useState(profile.version ?? 1);
  const [pushDecision, setPushDecision] = useState<"enable" | "skip" | null>(null);
  const [showPolicy, setShowPolicy] = useState(false);
  const effectiveStepKey = labels.includes(stepKey) ? stepKey : "Meldingen";
  const step = Math.max(0, labels.indexOf(effectiveStepKey));
  const setStep = (next: number) => setStepKey(labels[Math.max(0, Math.min(next, labels.length - 1))] ?? "Welkom");
  const review = labels.length - 1;
  const notificationStep = availabilityEnabled ? 4 : 3;
  const [firstName, ...lastNameParts] = draft.profile.fullName.trim().split(/\s+/);
  const lastName = lastNameParts.join(" ");
  const setNamePart = (part: "first" | "last", value: string) => setDraft((current) => {
    const [currentFirst, ...currentLastParts] = current.profile.fullName.trim().split(/\s+/);
    const fullName = part === "first" ? `${value} ${currentLastParts.join(" ")}`.trim() : `${currentFirst ?? ""} ${value}`.trim();
    return { ...current, profile: { ...current.profile, fullName } };
  });
  const save = (complete: boolean, after?: () => void) => run(
    () => saveStaffOnboarding({
      // Never adopt a newer server version for an older in-memory draft. If
      // another session or management changed the record, the RPC must reject
      // this draft so the employee can reload and review the current values.
      onboardingVersion: version,
      personnelVersion,
      draft,
      step,
      complete,
    }),
    complete ? "Je profiel is klaar" : "Voortgang opgeslagen",
    () => {
      setVersion((current) => current + 1);
      setPersonnelVersion((current) => current + 1);
      after?.();
    },
  );
  const onboardingCountry = draft.profile.homeAddress.country.trim().toLocaleUpperCase("nl-NL");
  const onboardingPostalCodeValid = !["NL", "NEDERLAND", "NETHERLANDS"].includes(onboardingCountry) || /^\d{4}\s?[A-Z]{2}$/i.test(draft.profile.homeAddress.postalCode.trim());
  const profileReady = firstName.length >= 1 && lastName.length >= 1
    && draft.profile.mobilePhone.trim().length >= 7
    && Boolean(draft.profile.homeAddress.street.trim() && draft.profile.homeAddress.postalCode.trim() && draft.profile.homeAddress.city.trim() && draft.profile.homeAddress.country.trim())
    && onboardingPostalCodeValid;
  const transportReady = (draft.transport.departureKind !== "depot" || Boolean(draft.transport.departureDepotId))
    && (draft.transport.departureKind !== "alternate" || Boolean(draft.transport.alternateDepartureAddress?.street.trim() && draft.transport.alternateDepartureAddress.postalCode.trim() && draft.transport.alternateDepartureAddress.city.trim()))
    && (!draft.transport.drivingLicense || draft.transport.drivingLicenseCategories.length > 0);
  const availabilityReady = Object.values(draft.availability.week).some((day) => day.enabled && day.start < day.end) && draft.availability.shifts.length > 0;
  const canNext = step === 0 ? true : step === 1 ? profileReady : step === 2 ? transportReady : availabilityEnabled && step === 3 ? availabilityReady : step === notificationStep ? pushDecision !== null : step === review ? draft.confirmations.details && (!availabilityEnabled || draft.confirmations.availability) && draft.confirmations.notifications && draft.confirmations.privacy && draft.confirmations.terms : true;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("main")?.focus();
    return () => { document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    const content = panel.current?.querySelector<HTMLElement>("main");
    if (content) { content.scrollTop = 0; content.focus(); }
  }, [step, showPolicy]);
  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
      .filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div className="ps-onboarding-backdrop" role="presentation">
    <div ref={panel} className="ps-onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" onKeyDown={trapFocus}>
      <section className="ps-onboarding-main">
        <header className="ps-onboarding-header">
          <div>
            <span className="ps-onboarding-kicker">Personeelsapp · Eerste bezoek</span>
            <h1 id="onboarding-title">Account instellen</h1>
            <p>{showPolicy ? "Privacy en gebruik" : `Stap ${step + 1} van ${labels.length} · ${labels[step]}`}</p>
          </div>
          <form ref={signout} action="/auth/signout" method="post"><button className="ps-secondary" disabled={pending}>Afmelden</button></form>
        </header>
        <nav className="ps-onboarding-stepper" aria-label="Voortgang account instellen">
          <ol className="ps-onboarding-progress">
            {labels.map((label, index) => <li className={index === step ? "active" : index < step ? "done" : ""} aria-current={index === step ? "step" : undefined} key={label}>
              <span>{index < step ? <Check aria-label="Voltooid"/> : index + 1}</span><strong>{label}</strong>
            </li>)}
          </ol>
          <div className="ps-onboarding-stepbar" aria-hidden="true"><i><b style={{ width: `${step / labels.length * 100}%` }}/></i></div>
        </nav>
        <main tabIndex={-1} aria-labelledby="onboarding-step-title">
          {showPolicy ? <div className="ps-policy-information">
            <span className="ps-onboarding-kicker">Privacy en gebruik</span>
            <h2 id="onboarding-step-title">Zo gaan we met je gegevens om</h2>
            <p>Deze korte uitleg helpt je om de instellingen te controleren. De formele privacy-informatie en gebruiksvoorwaarden van jouw organisatie blijven leidend.</p>
            <section><h3>Welke gegevens gebruikt je organisatie?</h3><p>Je profiel- en contactgegevens, vervoer, eventuele beschikbaarheid en meldingskeuzes worden gebruikt om je werk te plannen, uit te voeren en je daarover te informeren. In werkbonnen kunnen ook notities, bestanden en ondertekeningen staan.</p></section>
            <section><h3>Wie kan de gegevens zien?</h3><p>Alleen bevoegde gebruikers binnen je huidige organisatie krijgen toegang voor hun werkzaamheden. Wat je zelf mag bekijken of aanpassen hangt af van de rechten die je organisatie heeft ingesteld.</p></section>
            <section><h3>Jouw keuzes en verzoeken</h3><p>Je kunt je gegevens en meldingskeuzes in de personeelsapp controleren en, waar toegestaan, wijzigen. Vraag je organisatiebeheerder om de volledige privacy-informatie of om een verzoek voor inzage, correctie, bewaartermijnen of verwijdering te behandelen.</p></section>
            <section><h3>Veilig en zorgvuldig gebruik</h3><p>Gebruik je account persoonlijk, deel geen inloggegevens en voeg alleen informatie toe die nodig is voor je werk. Meld verlies van een apparaat of vermoed misbruik direct bij je organisatie.</p></section>
          </div> : <>
            {step === 0 && <div className="ps-onboarding-step ps-onboarding-welcome">
              <div><span className="ps-onboarding-kicker">Jouw eerste werkdag</span><h2 id="onboarding-step-title">Welkom, {profile.preferred_name || profile.full_name.split(" ")[0]}.</h2><p>Laten we je account klaarzetten voor je eerste werkdag. Controleer je gegevens en stel je account in voor jouw werkdag.</p></div>
              <div className="ps-onboarding-feature-grid">
                <article><UserRound/><div><strong>Je profiel</strong><p>Contactgegevens en bereikbaarheid</p></div></article>
                <article><Navigation/><div><strong>Onderweg naar werk</strong><p>Je vervoer en vertreklocatie</p></div></article>
                {availabilityEnabled && <article><Check/><div><strong>Je beschikbaarheid</strong><p>Werkdagen en dienstvoorkeuren</p></div></article>}
                <article><Bell/><div><strong>Op de hoogte</strong><p>E-mail, push en meldingen in de app</p></div></article>
              </div>
              <div className="ps-onboarding-note">Je logt in met <strong>{email}</strong>. Je voortgang wordt bij iedere stap bewaard. Je gegevens zijn alleen zichtbaar voor bevoegde collega’s binnen je organisatie.</div>
              <button type="button" className="ps-text-button" onClick={() => setShowPolicy(true)}>Lees privacy- en gebruiksinformatie</button>
            </div>}
            {step === 1 && <div className="ps-onboarding-step">
              <div><h2 id="onboarding-step-title">Je profiel</h2><p>Controleer je contactgegevens en vul aan waar nodig.</p></div>
              <div className="ps-form-grid">
                <label className="ps-field">Voornaam *<input autoComplete="given-name" value={firstName} onChange={(event) => setNamePart("first", event.target.value)}/></label>
                <label className="ps-field">Achternaam *<input autoComplete="family-name" value={lastName} onChange={(event) => setNamePart("last", event.target.value)}/></label>
                <label className="ps-field">Roepnaam<input value={draft.profile.preferredName} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, preferredName: event.target.value } })}/></label>
                <label className="ps-field">Mobiel nummer *<input type="tel" autoComplete="tel" value={draft.profile.mobilePhone} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, mobilePhone: event.target.value } })}/></label>
                <label className="ps-field">Tweede telefoonnummer<input type="tel" value={draft.profile.phone} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, phone: event.target.value } })}/></label>
                <label className="ps-field">Login-e-mail<input type="email" value={email} readOnly/></label>
                <AddressInput required disabled={pending} name="homeAddress" initial={draft.profile.homeAddress.address??{street:draft.profile.homeAddress.street,postal_code:draft.profile.homeAddress.postalCode,city:draft.profile.homeAddress.city,country:draft.profile.homeAddress.country}} onChange={address=>setDraft({...draft,profile:{...draft.profile,homeAddress:{street:address.street,postalCode:address.postal_code,city:address.city,country:address.country,address}}})}/>
                <label className="ps-field">Geboortedatum (optioneel)<input type="date" autoComplete="bday" value={draft.profile.birthDate} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, birthDate: event.target.value } })}/></label>
              </div>
              <fieldset className="ps-onboarding-group"><legend>Noodcontact <span>(optioneel)</span></legend><div className="ps-form-grid">
                <label className="ps-field">Naam noodcontact<input value={draft.profile.emergencyContact.name} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, emergencyContact: { ...draft.profile.emergencyContact, name: event.target.value } } })}/></label>
                <label className="ps-field">Telefoon noodcontact<input type="tel" value={draft.profile.emergencyContact.phone} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, emergencyContact: { ...draft.profile.emergencyContact, phone: event.target.value } } })}/></label>
                <label className="ps-field">Relatie tot noodcontact<input value={draft.profile.emergencyContact.relation} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, emergencyContact: { ...draft.profile.emergencyContact, relation: event.target.value } } })}/></label>
              </div></fieldset>
            </div>}
            {step === 2 && <div className="ps-onboarding-step">
              <div><h2 id="onboarding-step-title">Vervoer</h2><p>Vertel de planning hoe je op locatie komt en waar je vertrekt.</p></div>
              <label className="ps-field">Meest gebruikte vervoermiddel *<select value={draft.transport.vehicle} onChange={(event) => setDraft({ ...draft, transport: { ...draft.transport, vehicle: event.target.value as StaffOnboardingDraft["transport"]["vehicle"] } })}>{Object.entries(vehicleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <div className="ps-form-grid">
                <label className="ps-check"><input type="checkbox" checked={draft.transport.ownTransport} onChange={(event) => setDraft({ ...draft, transport: { ...draft.transport, ownTransport: event.target.checked } })}/>Ik beschik over eigen vervoer</label>
                <label className="ps-check"><input type="checkbox" checked={draft.transport.drivingLicense} onChange={(event) => setDraft({ ...draft, transport: { ...draft.transport, drivingLicense: event.target.checked, drivingLicenseCategories: event.target.checked ? draft.transport.drivingLicenseCategories : [] } })}/>Ik heb een geldig rijbewijs</label>
                <label className="ps-check"><input type="checkbox" checked={draft.transport.carpoolAllowed} onChange={(event) => setDraft({ ...draft, transport: { ...draft.transport, carpoolAllowed: event.target.checked } })}/>Ik wil collega’s meenemen</label>
                <label className="ps-check"><input type="checkbox" checked={draft.transport.departureKind === "home"} onChange={(event) => setDraft({ ...draft, transport: { ...draft.transport, departureKind: event.target.checked ? "home" : "alternate", alternateDepartureAddress: draft.transport.alternateDepartureAddress ?? { street: "", postalCode: "", city: "", country: "NL" } } })}/>Vertreklocatie is mijn woonadres</label>
              </div>
              {draft.transport.drivingLicense && <fieldset className="ps-onboarding-group"><legend>Rijbewijscategorieën</legend><div className="ps-onboarding-license-options">{["AM", "A", "B", "BE", "C", "CE", "D"].map((category) => <label className="ps-check" key={category}><input type="checkbox" checked={draft.transport.drivingLicenseCategories.includes(category)} onChange={(event) => setDraft({ ...draft, transport: { ...draft.transport, drivingLicenseCategories: event.target.checked ? [...new Set([...draft.transport.drivingLicenseCategories, category])] : draft.transport.drivingLicenseCategories.filter((item) => item !== category) } })}/>{category}</label>)}</div></fieldset>}
              {draft.transport.departureKind !== "home" && <fieldset className="ps-onboarding-group"><legend>Afwijkende vertreklocatie</legend><div className="ps-form-grid">
                <label className="ps-field wide">Vertreklocatie<select value={draft.transport.departureKind} onChange={(event) => setDraft({ ...draft, transport: { ...draft.transport, departureKind: event.target.value as StaffOnboardingDraft["transport"]["departureKind"], departureDepotId: event.target.value === "depot" ? draft.transport.departureDepotId ?? depots[0]?.id ?? null : draft.transport.departureDepotId, alternateDepartureAddress: draft.transport.alternateDepartureAddress ?? { street: "", postalCode: "", city: "", country: "NL" } } })}>{depots.length > 0 && <option value="depot">Vestiging</option>}<option value="alternate">Andere locatie</option></select></label>
                {draft.transport.departureKind === "depot" && <label className="ps-field wide">Vestiging<select value={draft.transport.departureDepotId ?? ""} required onChange={(event) => setDraft({ ...draft, transport: { ...draft.transport, departureDepotId: event.target.value || null } })}><option value="" disabled>Kies een vestiging</option>{depots.map((depot) => <option value={depot.id} key={depot.id}>{depot.name}</option>)}</select></label>}
                {draft.transport.departureKind === "alternate" && <AddressInput required disabled={pending} name="alternateAddress" initial={draft.transport.alternateDepartureAddress?.address??draft.transport.alternateDepartureAddress} onChange={address=>setDraft({...draft,transport:{...draft.transport,alternateDepartureAddress:{street:address.street,postalCode:address.postal_code,city:address.city,country:address.country,address}}})}/>}

              </div></fieldset>}
              <label className="ps-field">Bijzonderheden voor onderweg<textarea rows={3} maxLength={1000} value={draft.transport.limitations} onChange={(event) => setDraft({ ...draft, transport: { ...draft.transport, limitations: event.target.value } })}/></label>
            </div>}
            {availabilityEnabled && step === 3 && <div className="ps-onboarding-step">
              <div><h2 id="onboarding-step-title">Wanneer ben je beschikbaar?</h2><p>Kies je gebruikelijke werkdagen en dienstvoorkeuren.</p></div>
              <div className="ps-week-form">{dayKeys.map((key) => <div className="ps-week-form-row" key={key}><label className="ps-check"><input type="checkbox" checked={draft.availability.week[key].enabled} onChange={(event) => setDraft({ ...draft, availability: { ...draft.availability, week: { ...draft.availability.week, [key]: { ...draft.availability.week[key], enabled: event.target.checked } } } })}/>{dayLabels[key]}</label><input aria-label={`${dayLabels[key]} vanaf`} type="time" value={draft.availability.week[key].start} disabled={!draft.availability.week[key].enabled} onChange={(event) => setDraft({ ...draft, availability: { ...draft.availability, week: { ...draft.availability.week, [key]: { ...draft.availability.week[key], start: event.target.value } } } })}/><input aria-label={`${dayLabels[key]} tot`} type="time" value={draft.availability.week[key].end} disabled={!draft.availability.week[key].enabled} onChange={(event) => setDraft({ ...draft, availability: { ...draft.availability, week: { ...draft.availability.week, [key]: { ...draft.availability.week[key], end: event.target.value } } } })}/></div>)}</div>
              <fieldset className="ps-onboarding-group"><legend>Dienstvoorkeur</legend><div className="ps-form-grid">{shiftOptions.map((shift) => <label className="ps-check" key={shift}><input type="checkbox" checked={draft.availability.shifts.includes(shift)} onChange={(event) => setDraft({ ...draft, availability: { ...draft.availability, shifts: event.target.checked ? [...new Set([...draft.availability.shifts, shift])] : draft.availability.shifts.filter((item) => item !== shift) } })}/>{shift === "day" ? "Dag" : shift === "evening" ? "Avond" : "Nacht"}</label>)}</div></fieldset>
              <div className="ps-form-grid"><label className="ps-check"><input type="checkbox" checked={draft.availability.weekends} onChange={(event) => setDraft({ ...draft, availability: { ...draft.availability, weekends: event.target.checked } })}/>Weekend inzetbaar</label><label className="ps-check"><input type="checkbox" checked={draft.availability.holidays} onChange={(event) => setDraft({ ...draft, availability: { ...draft.availability, holidays: event.target.checked } })}/>Feestdagen inzetbaar</label></div>
              <label className="ps-field">Planningsopmerking<textarea maxLength={1000} rows={3} value={draft.availability.planningNote} onChange={(event) => setDraft({ ...draft, availability: { ...draft.availability, planningNote: event.target.value } })}/></label>
            </div>}
            {step === notificationStep && <div className="ps-onboarding-step">
              <div><h2 id="onboarding-step-title">Meldingen die bij je passen</h2><p>Kies per onderwerp hoe je op de hoogte blijft. Meldingen in de app blijven beschikbaar zolang je toegang hebt.</p></div>
              <section className="ps-onboarding-push">
                <div className="ps-onboarding-push-heading"><Bell/><div><h3>Pushmeldingen</h3><p>Ontvang een seintje bij wijzigingen in je werkdag.</p></div></div>
                <div className="ps-onboarding-choice-row">
                  <button type="button" className="ps-primary" aria-pressed={pushDecision === "enable"} onClick={() => { setPushDecision("enable"); setDraft({ ...draft, notifications: { ...draft.notifications, push: true } }); }}>Push instellen</button>
                  <button type="button" className="ps-text-button" aria-pressed={pushDecision === "skip"} onClick={() => { setPushDecision("skip"); setDraft({ ...draft, notifications: { ...draft.notifications, push: false, types: draft.notifications.types.map((type) => ({ ...type, push: false })) } }); }}>Nu niet, later instellen</button>
                </div>
                {pushDecision === "enable" && <div className="ps-push-setup"><NotificationPushControl workspace="staff"/></div>}
                <p className="ps-onboarding-required" role="status">{pushDecision === null ? "Kies of je push nu of later wilt instellen." : pushDecision === "skip" ? "Je kunt push later inschakelen via Instellingen." : "Stel push in op dit apparaat. Je kunt je keuze later wijzigen."}</p>
              </section>
              <label className="ps-check"><input type="checkbox" checked={draft.notifications.email} onChange={(event) => setDraft({ ...draft, notifications: { ...draft.notifications, email: event.target.checked } })}/>Meldingen per e-mail ontvangen</label>
              {draft.notifications.types.length > 0 && <div className="ps-onboarding-topic-list">{draft.notifications.types.map((type, index) => <fieldset className="ps-onboarding-group" key={type.code}><legend>{type.name}</legend><div className="ps-onboarding-channels">
                {type.channels.includes("email") && <label className="ps-check"><input type="checkbox" disabled={!draft.notifications.email} checked={type.email} onChange={(event) => setDraft({ ...draft, notifications: { ...draft.notifications, types: draft.notifications.types.map((item, position) => position === index ? { ...item, email: event.target.checked } : item) } })}/>E-mail</label>}
                {type.channels.includes("push") && <label className="ps-check"><input type="checkbox" disabled={!draft.notifications.push} checked={type.push} onChange={(event) => setDraft({ ...draft, notifications: { ...draft.notifications, types: draft.notifications.types.map((item, position) => position === index ? { ...item, push: event.target.checked } : item) } })}/>Push</label>}
                {type.channels.includes("in_app") && <label className="ps-check"><input type="checkbox" checked disabled/>In app</label>}
              </div></fieldset>)}</div>}
              <details className="ps-onboarding-quiet"><summary>Rusttijden instellen</summary><div className="ps-onboarding-step">
                <label className="ps-check"><input type="checkbox" checked={draft.notifications.quietEnabled} onChange={(event) => setDraft({ ...draft, notifications: { ...draft.notifications, quietEnabled: event.target.checked } })}/>Meldingen uitstellen tijdens rusttijd</label>
                <div className="ps-form-grid"><label className="ps-field">Van<input type="time" disabled={!draft.notifications.quietEnabled} value={draft.notifications.quietStart} onChange={(event) => setDraft({ ...draft, notifications: { ...draft.notifications, quietStart: event.target.value } })}/></label><label className="ps-field">Tot<input type="time" disabled={!draft.notifications.quietEnabled} value={draft.notifications.quietEnd} onChange={(event) => setDraft({ ...draft, notifications: { ...draft.notifications, quietEnd: event.target.value } })}/></label></div>
              </div></details>
              <p className="ps-onboarding-muted">Urgente veiligheids- en accountmeldingen blijven binnen het actuele organisatiebeleid beschikbaar.</p>
            </div>}
            {step === review && <div className="ps-onboarding-step">
              <h2 id="onboarding-step-title" className="ps-sr-only">Controleer je account</h2>
              <div className="ps-onboarding-review-grid">
                <article className="ps-onboarding-review-card"><header><h3>Profiel</h3><button type="button" className="ps-text-button" onClick={() => setStep(1)}>Wijzigen<span className="ps-sr-only"> profiel</span></button></header><p>{draft.profile.fullName}<br/>{email}<br/>{draft.profile.mobilePhone}<br/>{draft.profile.homeAddress.street}<br/>{draft.profile.homeAddress.postalCode} {draft.profile.homeAddress.city}</p></article>
                <article className="ps-onboarding-review-card"><header><h3>Vervoer</h3><button type="button" className="ps-text-button" onClick={() => setStep(2)}>Wijzigen<span className="ps-sr-only"> vervoer</span></button></header><p>{vehicleLabels[draft.transport.vehicle]}<br/>{draft.transport.departureKind === "home" ? "Vertrek vanaf woonadres" : draft.transport.departureKind === "depot" ? `Vertrek vanaf ${depots.find(depot => depot.id === draft.transport.departureDepotId)?.name ?? "vestiging"}` : `Vertrek vanaf ${draft.transport.alternateDepartureAddress?.street ?? "andere locatie"}`}</p></article>
                {availabilityEnabled && <article className="ps-onboarding-review-card"><header><h3>Beschikbaarheid</h3><button type="button" className="ps-text-button" onClick={() => setStep(3)}>Wijzigen<span className="ps-sr-only"> beschikbaarheid</span></button></header><p>{Object.values(draft.availability.week).filter((day) => day.enabled).length} beschikbare dagen<br/>{draft.availability.shifts.length} dienstvoorkeuren</p></article>}
                <article className="ps-onboarding-review-card"><header><h3>Meldingen</h3><button type="button" className="ps-text-button" onClick={() => setStep(notificationStep)}>Wijzigen<span className="ps-sr-only"> meldingen</span></button></header><p>{draft.notifications.email ? draft.notifications.types.filter((type) => type.email).length : 0} onderwerpen per e-mail<br/>{draft.notifications.push ? draft.notifications.types.filter((type) => type.push).length : 0} onderwerpen via push</p></article>
              </div>
              <div className="ps-onboarding-confirmations">
                <label className="ps-check"><input type="checkbox" checked={draft.confirmations.details} onChange={(event) => setDraft({ ...draft, confirmations: { ...draft.confirmations, details: event.target.checked } })}/>Mijn profielgegevens zijn correct.</label>
                {availabilityEnabled && <label className="ps-check"><input type="checkbox" checked={draft.confirmations.availability} onChange={(event) => setDraft({ ...draft, confirmations: { ...draft.confirmations, availability: event.target.checked } })}/>Mijn beschikbaarheid is correct.</label>}
                <label className="ps-check"><input type="checkbox" checked={draft.confirmations.notifications} onChange={(event) => setDraft({ ...draft, confirmations: { ...draft.confirmations, notifications: event.target.checked } })}/>Ik heb mijn meldingsinstellingen gecontroleerd.</label>
                <label className="ps-check"><input type="checkbox" checked={draft.confirmations.privacy} onChange={(event) => setDraft({ ...draft, confirmations: { ...draft.confirmations, privacy: event.target.checked } })}/>Ik heb de privacy-informatie van mijn organisatie gecontroleerd.</label>
                <label className="ps-check"><input type="checkbox" checked={draft.confirmations.terms} onChange={(event) => setDraft({ ...draft, confirmations: { ...draft.confirmations, terms: event.target.checked } })}/>Ik heb de toepasselijke gebruiksvoorwaarden gecontroleerd.</label>
              </div>
              <button type="button" className="ps-text-button" onClick={() => setShowPolicy(true)}>Lees privacy- en gebruiksinformatie</button>
            </div>}
          </>}
        </main>
        {showPolicy ? <footer className="ps-onboarding-actions"><button type="button" className="ps-secondary" onClick={() => setShowPolicy(false)}>Terug naar onboarding</button></footer> : <footer className="ps-onboarding-actions">
          <div className="ps-onboarding-back-actions">
            <button type="button" className="ps-secondary" disabled={pending || step === 0} onClick={() => setStep(step - 1)}>Vorige</button>
            {step > 0 && <button type="button" className="ps-secondary" disabled={pending} onClick={() => save(false, () => signout.current?.requestSubmit())}>Opslaan en later</button>}
          </div>
          <button type="button" className="ps-primary" disabled={pending || !canNext} onClick={() => step === review ? save(true, onCompleted) : save(false, () => setStep(step + 1))}>{pending ? "Opslaan…" : step === 0 ? "Beginnen" : step === review ? "Bevestigen en afronden" : "Opslaan en verder"}</button>
        </footer>}
      </section>
    </div>
  </div>;
}

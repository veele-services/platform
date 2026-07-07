"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Mail,
  MessageSquareText,
  Palette,
  Send,
  Smartphone,
} from "lucide-react";
import {
  sendManualNotification,
  updateEmailTemplateStyle,
  updateNotificationEventSetting,
  type NotificationAudienceOptions,
  type NotificationEventSettingRow,
  type OrgSettings,
} from "@/app/actions/settings";
import { SettingsStickySaveBar } from "@/components/settings/SettingsStickySaveBar";

interface Props {
  settings: OrgSettings | null;
  events: NotificationEventSettingRow[];
  audienceOptions: NotificationAudienceOptions;
  canWrite: boolean;
}

type Notice = { type: "success" | "error"; text: string } | null;
type Channel = "email" | "push" | "in_app";

const CHANNELS: Array<{ key: Channel; label: string; Icon: typeof Mail; hint: string }> = [
  { key: "email", label: "E-mail", Icon: Mail, hint: "HTML-mail via de ingestelde e-mailprovider" },
  { key: "push", label: "Push", Icon: Smartphone, hint: "Pushbericht + inboxmelding" },
  { key: "in_app", label: "Inbox", Icon: Bell, hint: "Melding in portaal/PWA" },
];

const SHORTCODE_HELP = [
  ["recipient.name", "Naam ontvanger"],
  ["recipient.first_name", "Voornaam ontvanger"],
  ["recipient.email", "E-mailadres ontvanger"],
  ["organization.name", "Organisatienaam"],
  ["href", "Fieldgrid-link"],
  ["portal.name", "Portaalnaam"],
  ["portal.login_url", "Loginlink"],
  ["customer.name", "Klantnaam"],
  ["customer.contact_name", "Klantcontact"],
  ["object.name", "Objectnaam"],
  ["object.address", "Objectadres"],
  ["object.city", "Plaats"],
  ["assignment.code", "Werkbonnummer"],
  ["assignment.number", "Opdrachtnummer"],
  ["assignment.title", "Opdrachtnaam"],
  ["assignment.date", "Opdrachtdatum"],
  ["assignment.start", "Starttijd"],
  ["assignment.start_time", "Starttijd"],
  ["assignment.end", "Eindtijd"],
  ["assignment.end_time", "Eindtijd"],
  ["personnel.name", "Medewerkernaam"],
  ["personnel.first_name", "Voornaam medewerker"],
  ["leave.period", "Verlofperiode"],
  ["leave.type", "Verloftype"],
  ["leave.decision", "Beslissing verlof"],
  ["quote.number", "Offertenummer"],
  ["quote.amount", "Offertebedrag"],
  ["quote.valid_until", "Geldig tot"],
  ["invoice.number", "Factuurnummer"],
  ["invoice.amount", "Factuurbedrag"],
  ["invoice.due_date", "Vervaldatum"],
  ["report.number", "Rapportnummer"],
  ["ticket.number", "Ticketnummer"],
  ["ticket.subject", "Ticketonderwerp"],
  ["document.name", "Documentnaam"],
  ["article.title", "Artikel titel"],
  ["roadmap.title", "Roadmap titel"],
  ["release.version", "Release versie"],
  ["release.title", "Release titel"],
  ["highlight.title", "Highlight titel"],
] as const;

const SHORTCODE_LABELS = new Map<string, string>(SHORTCODE_HELP.map(([code, label]) => [code, label]));

function normalizeShortcode(code: string): string {
  return code.trim().replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "");
}

function shortcodeToken(code: string): string {
  return `{{${normalizeShortcode(code)}}}`;
}

function shortcodeLabel(code: string): string {
  const normalized = normalizeShortcode(code);
  return SHORTCODE_LABELS.get(normalized) ?? normalized;
}

function groupEvents(events: NotificationEventSettingRow[]) {
  return events.reduce<Record<string, NotificationEventSettingRow[]>>((acc, event) => {
    acc[event.eventGroup] = [...(acc[event.eventGroup] ?? []), event];
    return acc;
  }, {});
}

export function NotificatiesView({
  settings,
  events,
  audienceOptions,
  canWrite,
}: Props) {
  const grouped = useMemo(() => groupEvents(events), [events]);
  const [selectedEventKey, setSelectedEventKey] = useState(events[0]?.eventKey ?? "");
  const selectedEvent =
    events.find((event) => event.eventKey === selectedEventKey) ?? events[0] ?? null;

  return (
    <div className="space-y-6">
      <AnalysisCards events={events} />

      <section className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <div className="veele-card">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E0FAFB] text-[#075E5D]">
              <Bell className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "#081D3A" }}>
                Automatische meldingen
              </h2>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "#64748B" }}>
                Dit zijn de acties die e-mail, push of inboxmeldingen kunnen activeren.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {Object.entries(grouped).map(([group, groupEvents]) => (
              <div key={group}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>
                  {group}
                </p>
                <div className="space-y-2">
                  {groupEvents.map((event) => (
                    <button
                      key={event.eventKey}
                      type="button"
                      onClick={() => setSelectedEventKey(event.eventKey)}
                      className="w-full rounded-xl border p-3 text-left transition hover:bg-slate-50"
                      style={{
                        borderColor: event.eventKey === selectedEvent?.eventKey ? "#00B7B3" : "#E2E8F0",
                        background: event.eventKey === selectedEvent?.eventKey ? "#F0FDFA" : "#fff",
                      }}
                    >
                      <span className="block text-sm font-semibold" style={{ color: "#081D3A" }}>
                        {event.title}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed" style={{ color: "#64748B" }}>
                        {event.description}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        <ChannelBadge active={event.emailEnabled} label="Mail" />
                        <ChannelBadge active={event.pushEnabled} label="Push" />
                        <ChannelBadge active={event.inAppEnabled} label="Inbox" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedEvent && (
          <EventTemplateEditor
            event={selectedEvent}
            canWrite={canWrite}
          />
        )}
      </section>

      <ManualNotificationPanel
        audienceOptions={audienceOptions}
        canWrite={canWrite}
      />

      <EmailStylePanel settings={settings} canWrite={canWrite} />

      <ShortcodesPanel />
    </div>
  );
}

function ChannelBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{
        background: active ? "#D1FAE5" : "#F1F5F9",
        color: active ? "#047857" : "#64748B",
      }}
    >
      {label}
    </span>
  );
}

function AnalysisCards({ events }: { events: NotificationEventSettingRow[] }) {
  const emailCount = events.filter((event) => event.emailEnabled).length;
  const pushCount = events.filter((event) => event.pushEnabled).length;
  const inAppCount = events.filter((event) => event.inAppEnabled).length;

  return (
    <section className="grid gap-3 md:grid-cols-4">
      <MetricCard title="Triggers" value={events.length} text="Platformacties met template" Icon={Bell} />
      <MetricCard title="E-mail actief" value={emailCount} text="HTML-templates ingeschakeld" Icon={Mail} />
      <MetricCard title="Push actief" value={pushCount} text="Pushverzending voorbereid" Icon={Smartphone} />
      <MetricCard title="Inbox actief" value={inAppCount} text="Portaalmeldingen" Icon={MessageSquareText} />
    </section>
  );
}

function MetricCard({
  title,
  value,
  text,
  Icon,
}: {
  title: string;
  value: number;
  text: string;
  Icon: typeof Bell;
}) {
  return (
    <div className="veele-card flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E0FAFB] text-[#075E5D]">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>
          {title}
        </p>
        <p className="mt-1 text-2xl font-bold" style={{ color: "#081D3A" }}>
          {value}
        </p>
        <p className="mt-1 text-xs" style={{ color: "#64748B" }}>{text}</p>
      </div>
    </div>
  );
}

function EventTemplateEditor({
  event,
  canWrite,
}: {
  event: NotificationEventSettingRow;
  canWrite: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [emailEnabled, setEmailEnabled] = useState(event.emailEnabled);
  const [pushEnabled, setPushEnabled] = useState(event.pushEnabled);
  const [inAppEnabled, setInAppEnabled] = useState(event.inAppEnabled);
  const [emailSubject, setEmailSubject] = useState(event.emailSubject);
  const [emailPreheader, setEmailPreheader] = useState(event.emailPreheader ?? "");
  const [emailBody, setEmailBody] = useState(event.emailBody);
  const [pushTitle, setPushTitle] = useState(event.pushTitle);
  const [pushBody, setPushBody] = useState(event.pushBody);

  function handleSave() {
    setNotice(null);
    startTransition(async () => {
      const result = await updateNotificationEventSetting(event.eventKey, {
        emailEnabled,
        pushEnabled,
        inAppEnabled,
        emailSubject,
        emailPreheader,
        emailBody,
        pushTitle,
        pushBody,
      });
      setNotice(
        result.success
          ? { type: "success", text: "Template opgeslagen." }
          : { type: "error", text: result.message },
      );
    });
  }

  return (
    <div className="veele-card space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>
            {event.eventGroup} / {event.audience}
          </p>
          <h2 className="mt-1 text-lg font-semibold" style={{ color: "#081D3A" }}>
            {event.title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "#64748B" }}>
            {event.description}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ToggleCard label="E-mail" checked={emailEnabled} onChange={setEmailEnabled} disabled={!canWrite} />
        <ToggleCard label="Push" checked={pushEnabled} onChange={setPushEnabled} disabled={!canWrite} />
        <ToggleCard label="Inbox" checked={inAppEnabled} onChange={setInAppEnabled} disabled={!canWrite} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="E-mail onderwerp">
            <input className="veele-input w-full" value={emailSubject} disabled={!canWrite} onChange={(e) => setEmailSubject(e.target.value)} />
          </Field>
          <Field label="Preheader">
            <input className="veele-input w-full" value={emailPreheader} disabled={!canWrite} onChange={(e) => setEmailPreheader(e.target.value)} />
          </Field>
          <Field label="E-mail body">
            <textarea className="veele-input min-h-[220px] w-full resize-y" value={emailBody} disabled={!canWrite} onChange={(e) => setEmailBody(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-3">
          <Field label="Push titel">
            <input className="veele-input w-full" value={pushTitle} disabled={!canWrite} onChange={(e) => setPushTitle(e.target.value)} />
          </Field>
          <Field label="Push tekst">
            <textarea className="veele-input min-h-[120px] w-full resize-y" value={pushBody} disabled={!canWrite} onChange={(e) => setPushBody(e.target.value)} />
          </Field>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>
              Beschikbare shortcodes
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {event.shortcodes.map((code) => (
                <span key={code} className="rounded bg-white px-2 py-1 text-xs" style={{ color: "#075E5D" }}>
                  <span className="font-semibold">{shortcodeLabel(code)}</span>
                  <code className="ml-1 text-[11px] text-slate-500">{shortcodeToken(code)}</code>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <SettingsStickySaveBar
        canWrite={canWrite}
        pending={isPending}
        saved={notice?.type === "success"}
        error={notice?.type === "error" ? notice.text : undefined}
        submitLabel="Template opslaan"
        onSave={handleSave}
      />
    </div>
  );
}

function ManualNotificationPanel({
  audienceOptions,
  canWrite,
}: {
  audienceOptions: NotificationAudienceOptions;
  canWrite: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [audience, setAudience] = useState<"personnel" | "customer" | "both">("personnel");
  const [targetMode, setTargetMode] = useState<"all" | "sector" | "individual">("all");
  const [channels, setChannels] = useState<Channel[]>(["push", "in_app"]);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [personnelIds, setPersonnelIds] = useState<string[]>([]);
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [title, setTitle] = useState("Nieuwe melding");
  const [body, setBody] = useState(
    "Beste {{recipient.name}},\n\nEr staat een nieuwe melding klaar in het portaal. Log in om de details te bekijken.\n\nMet vriendelijke groet,\nFieldgrid",
  );
  const [href, setHref] = useState("");

  function toggle<T extends string>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function submit() {
    setNotice(null);
    startTransition(async () => {
      const result = await sendManualNotification({
        audience,
        targetMode,
        sectorIds,
        personnelIds,
        customerIds,
        channels,
        priority,
        title,
        body,
        href: href || null,
      });
      if (result.success) {
        const pushDelivery = result.data?.pushDelivery;
        const pushText =
          result.data?.pushQueuedCount && pushDelivery
            ? ` Push: ${result.data.pushQueuedCount} aangeboden, ${pushDelivery.sent} verzonden, ${pushDelivery.skipped} overgeslagen, ${pushDelivery.failed} mislukt${pushDelivery.ok ? "." : ` (${pushDelivery.error ?? "delivery niet gestart"}).`}`
            : result.data?.pushQueuedCount
              ? ` Push: ${result.data.pushQueuedCount} aangeboden.`
              : "";
        setNotice({
          type: "success",
          text: `Verstuurd naar ${result.data?.personnelCount ?? 0} medewerker(s) en ${result.data?.customerCount ?? 0} klant(en). E-mail: ${result.data?.emailSuccessCount ?? 0} succesvol, ${result.data?.emailFailedCount ?? 0} mislukt.${pushText}`,
        });
      } else {
        setNotice({ type: "error", text: result.message });
      }
    });
  }

  return (
    <section className="veele-card space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E0FAFB] text-[#075E5D]">
          <Send className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "#081D3A" }}>
            Handmatige melding sturen
          </h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "#64748B" }}>
            Verstuur een gerichte melding naar personeel, klanten, sectoren of individuele ontvangers.
            Push wordt klaargezet voor verzending en tegelijk als inboxmelding bewaard.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Doelgroep">
          <select className="veele-input w-full" value={audience} disabled={!canWrite} onChange={(e) => setAudience(e.target.value as typeof audience)}>
            <option value="personnel">Personeel</option>
            <option value="customer">Klanten</option>
            <option value="both">Personeel en klanten</option>
          </select>
        </Field>
        <Field label="Selectie">
          <select className="veele-input w-full" value={targetMode} disabled={!canWrite} onChange={(e) => setTargetMode(e.target.value as typeof targetMode)}>
            <option value="all">Iedereen binnen doelgroep</option>
            <option value="sector">Sector(en)</option>
            <option value="individual">Individuele ontvangers</option>
          </select>
        </Field>
        <Field label="Prioriteit">
          <select className="veele-input w-full" value={priority} disabled={!canWrite} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            <option value="low">Laag</option>
            <option value="normal">Normaal</option>
            <option value="high">Hoog</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {CHANNELS.map(({ key, label, Icon, hint }) => (
          <button
            key={key}
            type="button"
            disabled={!canWrite}
            onClick={() => setChannels((current) => toggle(current, key))}
            className="rounded-xl border p-3 text-left disabled:opacity-60"
            style={{
              borderColor: channels.includes(key) ? "#00B7B3" : "#E2E8F0",
              background: channels.includes(key) ? "#F0FDFA" : "#fff",
            }}
          >
            <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#081D3A" }}>
              <Icon className="h-4 w-4" />
              {label}
            </span>
            <span className="mt-1 block text-xs" style={{ color: "#64748B" }}>{hint}</span>
          </button>
        ))}
      </div>

      {targetMode === "sector" && (
        <CheckboxGrid
          title="Sectoren"
          items={audienceOptions.sectors}
          selected={sectorIds}
          onToggle={(id) => setSectorIds((current) => toggle(current, id))}
          disabled={!canWrite}
        />
      )}

      {targetMode === "individual" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {(audience === "personnel" || audience === "both") && (
            <CheckboxGrid
              title="Personeel"
              items={audienceOptions.personnel.map((person) => ({
                id: person.id,
                name: `${person.name} - ${person.email}`,
              }))}
              selected={personnelIds}
              onToggle={(id) => setPersonnelIds((current) => toggle(current, id))}
              disabled={!canWrite}
            />
          )}
          {(audience === "customer" || audience === "both") && (
            <CheckboxGrid
              title="Klanten"
              items={audienceOptions.customers.map((customer) => ({
                id: customer.id,
                name: `${customer.name}${customer.email ? ` - ${customer.email}` : " - geen e-mail"}`,
              }))}
              selected={customerIds}
              onToggle={(id) => setCustomerIds((current) => toggle(current, id))}
              disabled={!canWrite}
            />
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-3">
          <Field label="Titel">
            <input className="veele-input w-full" value={title} disabled={!canWrite} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Bericht">
            <textarea className="veele-input min-h-[180px] w-full resize-y" value={body} disabled={!canWrite} onChange={(e) => setBody(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-3">
          <Field label="Link in melding">
            <input className="veele-input w-full" value={href} disabled={!canWrite} onChange={(e) => setHref(e.target.value)} placeholder="/meldingen" />
          </Field>
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed" style={{ color: "#64748B" }}>
            Gebruik bijvoorbeeld <code>{"{{recipient.name}}"}</code> voor een persoonlijke aanhef.
            Voor handmatige berichten zijn ook <code>{"{{customer.name}}"}</code> en <code>{"{{personnel.first_name}}"}</code> beschikbaar.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canWrite || isPending}
          onClick={submit}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "#081D3A" }}
        >
          <Send className="h-4 w-4" />
          {isPending ? "Versturen..." : "Notificatie versturen"}
        </button>
        {notice && <NoticeMessage notice={notice} />}
      </div>
    </section>
  );
}

function EmailStylePanel({
  settings,
  canWrite,
}: {
  settings: OrgSettings | null;
  canWrite: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [brandColor, setBrandColor] = useState(settings?.emailTemplateBrandColor ?? "#081D3A");
  const [accentColor, setAccentColor] = useState(settings?.emailTemplateAccentColor ?? "#00B7B3");
  const [footerText, setFooterText] = useState(settings?.emailTemplateFooterText ?? "");
  const [signature, setSignature] = useState(settings?.emailTemplateSignature ?? "");

  function save() {
    setNotice(null);
    startTransition(async () => {
      const result = await updateEmailTemplateStyle({
        brandColor,
        accentColor,
        footerText,
        signature,
      });
      setNotice(
        result.success
          ? { type: "success", text: "E-mailstijl opgeslagen." }
          : { type: "error", text: result.message },
      );
    });
  }

  return (
    <section className="veele-card space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E0FAFB] text-[#075E5D]">
          <Palette className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "#081D3A" }}>
            E-mail huisstijl
          </h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "#64748B" }}>
            Deze stijl wordt gebruikt door alle nieuwe professionele HTML e-mails.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Primaire kleur">
          <input className="veele-input w-full" value={brandColor} disabled={!canWrite} onChange={(e) => setBrandColor(e.target.value)} />
        </Field>
        <Field label="Accentkleur">
          <input className="veele-input w-full" value={accentColor} disabled={!canWrite} onChange={(e) => setAccentColor(e.target.value)} />
        </Field>
      </div>
      <Field label="Handtekening">
        <textarea className="veele-input min-h-[90px] w-full resize-y" value={signature} disabled={!canWrite} onChange={(e) => setSignature(e.target.value)} />
      </Field>
      <Field label="Voettekst">
        <textarea className="veele-input min-h-[100px] w-full resize-y" value={footerText} disabled={!canWrite} onChange={(e) => setFooterText(e.target.value)} />
      </Field>
      <SettingsStickySaveBar
        canWrite={canWrite}
        pending={isPending}
        saved={notice?.type === "success"}
        error={notice?.type === "error" ? notice.text : undefined}
        submitLabel="Huisstijl opslaan"
        onSave={save}
      />
    </section>
  );
}

function ShortcodesPanel() {
  return (
    <section className="veele-card">
      <h2 className="text-sm font-semibold" style={{ color: "#081D3A" }}>
        Shortcodes
      </h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "#64748B" }}>
        Shortcodes worden bij automatische events vervangen door de context van de opdracht, klant,
        medewerker, offerte, factuur of nieuwsbericht. Per event ziet u de toegestane shortcodes in de editor.
      </p>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {SHORTCODE_HELP.map(([code, label]) => (
          <div key={code} className="rounded-xl border bg-slate-50 px-3 py-2" style={{ borderColor: "#E2E8F0" }}>
            <p className="text-xs font-semibold" style={{ color: "#075E5D" }}>{label}</p>
            <code className="mt-1 block text-xs" style={{ color: "#64748B" }}>{shortcodeToken(code)}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

function ToggleCard({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="rounded-xl border p-3 text-left disabled:opacity-60"
      style={{
        borderColor: checked ? "#00B7B3" : "#E2E8F0",
        background: checked ? "#F0FDFA" : "#fff",
      }}
    >
      <span className="text-sm font-semibold" style={{ color: "#081D3A" }}>{label}</span>
      <span className="mt-1 block text-xs" style={{ color: checked ? "#047857" : "#64748B" }}>
        {checked ? "Ingeschakeld" : "Uitgeschakeld"}
      </span>
    </button>
  );
}

function CheckboxGrid({
  title,
  items,
  selected,
  onToggle,
  disabled,
}: {
  title: string;
  items: Array<{ id: string; name: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "#E2E8F0" }}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>{title}</p>
      <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
        {items.map((item) => (
          <label key={item.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs" style={{ color: "#334155" }}>
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              disabled={disabled}
              onChange={() => onToggle(item.id)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="min-w-0 truncate">{item.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "#374151" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function NoticeMessage({ notice }: { notice: NonNullable<Notice> }) {
  const ok = notice.type === "success";
  const Icon = ok ? CheckCircle2 : AlertCircle;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm"
      style={{ color: ok ? "#059669" : "#DC2626" }}
    >
      <Icon className="h-4 w-4" />
      {notice.text}
    </span>
  );
}

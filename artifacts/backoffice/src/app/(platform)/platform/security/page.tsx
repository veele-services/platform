import Link from "next/link";
import {
  FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES,
  FIELDGRID_SUPPORT_RUNTIME_PERMISSION_KEYS,
} from "@workspace/db";
import {
  createSupportAccessGrantFromForm,
  listPlatformSecurityDashboard,
  listPlatformUsers,
  revokeSupportAccessGrantFromForm,
  type PlatformSecurityDashboardFilters,
  type PlatformSecurityDenialType,
  type PlatformSecurityEventRow,
  type PlatformSecuritySeverity,
  type PlatformUserRow,
  type SupportAccessGrantRow,
} from "@/app/actions/platform";
import {
  approveSensitiveAccessRequestFromForm,
  createBreakGlassSensitiveAccessFromForm,
  denySensitiveAccessRequestFromForm,
  listSensitiveAccessDashboard,
  requestSensitiveAccessFromForm,
  revokeSensitiveAccessGrantFromForm,
  type SensitiveAccessDashboard,
  type SensitiveAccessGrantRow,
  type SensitiveAccessRequestRow,
} from "@/app/actions/sensitive-access";

export const metadata = {
  title: "Securitydashboard",
};

type Props = {
  searchParams: Promise<{
    tenantId?: string;
    actorId?: string;
    eventType?: string;
    scope?: string;
    resource?: string;
    dateFrom?: string;
    dateTo?: string;
    severity?: string;
    supportGrantId?: string;
  }>;
};

const severityLabels: Record<PlatformSecuritySeverity, string> = {
  info: "Info",
  warning: "Waarschuwing",
  critical: "Kritiek",
};

const denialLabels: Record<PlatformSecurityDenialType, string> = {
  direct_id_denial: "Direct-ID",
  module_denial: "Module",
  storage_denial: "Storage",
  tenant_mismatch: "Tenant mismatch",
  platform_access_denial: "Platform access",
  other_denial: "Overig",
};

async function createSupportGrantAction(formData: FormData): Promise<void> {
  "use server";
  await createSupportAccessGrantFromForm(formData);
}

async function revokeSupportGrantAction(formData: FormData): Promise<void> {
  "use server";
  await revokeSupportAccessGrantFromForm(formData);
}

async function requestSensitiveAccessAction(formData: FormData): Promise<void> {
  "use server";
  await requestSensitiveAccessFromForm(formData);
}

async function approveSensitiveAccessAction(formData: FormData): Promise<void> {
  "use server";
  await approveSensitiveAccessRequestFromForm(formData);
}

async function denySensitiveAccessAction(formData: FormData): Promise<void> {
  "use server";
  await denySensitiveAccessRequestFromForm(formData);
}

async function revokeSensitiveAccessAction(formData: FormData): Promise<void> {
  "use server";
  await revokeSensitiveAccessGrantFromForm(formData);
}

async function breakGlassSensitiveAccessAction(formData: FormData): Promise<void> {
  "use server";
  await createBreakGlassSensitiveAccessFromForm(formData);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function metadataLabel(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "-";

  const grantType = typeof metadata["grantType"] === "string" ? metadata["grantType"] : null;
  const ttlMinutes = typeof metadata["ttlMinutes"] === "number" ? metadata["ttlMinutes"] : null;
  const maxTtlMinutes = typeof metadata["maxTtlMinutes"] === "number" ? metadata["maxTtlMinutes"] : null;
  const message = typeof metadata["message"] === "string" ? metadata["message"] : null;

  if (message) return message;
  if (grantType && ttlMinutes !== null) {
    return `${grantType} / ${ttlMinutes}m${maxTtlMinutes !== null ? ` / max ${maxTtlMinutes}m` : ""}`;
  }
  if (grantType) return grantType;
  return JSON.stringify(metadata).slice(0, 140);
}

function parseFilterValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function parseSecurityFilters(searchParams: Awaited<Props["searchParams"]>): PlatformSecurityDashboardFilters {
  return {
    tenantId: parseFilterValue(searchParams.tenantId),
    actorId: parseFilterValue(searchParams.actorId),
    eventType: parseFilterValue(searchParams.eventType) as PlatformSecurityDashboardFilters["eventType"],
    scope: parseFilterValue(searchParams.scope) as PlatformSecurityDashboardFilters["scope"],
    resource: parseFilterValue(searchParams.resource),
    dateFrom: parseFilterValue(searchParams.dateFrom),
    dateTo: parseFilterValue(searchParams.dateTo),
    severity: parseFilterValue(searchParams.severity) as PlatformSecurityDashboardFilters["severity"],
    supportGrantId: parseFilterValue(searchParams.supportGrantId),
  };
}

function dateInputValue(value: string | undefined): string {
  return value ? value.slice(0, 16) : "";
}

function exportHref(filters: PlatformSecurityDashboardFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value && value !== "all") params.set(key, value);
  }
  const query = params.toString();
  return query ? `/api/platform/security/export?${query}` : "/api/platform/security/export";
}

function categoryLabel(event: PlatformSecurityEventRow): string {
  return event.categories.length > 0 ? event.categories.join(", ") : "-";
}

function severityClass(severity: PlatformSecuritySeverity): string {
  if (severity === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function grantStatusLabel(status: SupportAccessGrantRow["status"]): string {
  if (status === "active") return "Actief";
  if (status === "scheduled") return "Gepland";
  if (status === "revoked") return "Ingetrokken";
  return "Verlopen";
}

function StatCard({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warning" | "danger" }) {
  const toneClass = tone === "danger"
    ? "border-rose-200 bg-rose-50 text-rose-900"
    : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-white text-slate-950";

  return (
    <div className={`rounded border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function EventCard({ event }: { event: PlatformSecurityEventRow }) {
  return (
    <article className="rounded border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded border px-2 py-1 text-xs font-semibold ${severityClass(event.severity)}`}>
          {severityLabels[event.severity]}
        </span>
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
          {event.scope} / {categoryLabel(event)}
        </span>
        {event.denialType && (
          <span className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
            {denialLabels[event.denialType]}
          </span>
        )}
      </div>
      <h3 className="mt-3 break-words text-base font-semibold tracking-normal text-slate-950">{event.action}</h3>
      <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500">Tenant</dt>
          <dd className="break-words text-slate-900">{event.tenantName}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Resource</dt>
          <dd className="break-words">{event.resource ?? "-"} {event.resourceId ? `/ ${event.resourceId}` : ""}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Actor</dt>
          <dd className="break-all">{event.actorId}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Tijd</dt>
          <dd>{formatDate(event.createdAt)}</dd>
        </div>
      </dl>
      <p className="mt-3 break-words rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {metadataLabel(event.metadata)}
      </p>
    </article>
  );
}

function EventSection({ title, helper, events }: { title: string; helper: string; events: PlatformSecurityEventRow[] }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{helper}</p>
        </div>
        <span className="w-fit rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{events.length}</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {events.map((event) => <EventCard key={`${event.source}:${event.id}`} event={event} />)}
        {events.length === 0 && (
          <p className="rounded border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
            Geen events gevonden voor deze filters.
          </p>
        )}
      </div>
    </section>
  );
}

function SupportGrantCard({ grant }: { grant: SupportAccessGrantRow }) {
  return (
    <article className="rounded border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
              {grantStatusLabel(grant.status)}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
              Scope: {grant.scope}
            </span>
          </div>
          <p className="mt-3 font-semibold text-slate-950">{grant.tenantName}</p>
          <p className="mt-1 break-words text-slate-600">{grant.reason}</p>
          <p className="mt-2 text-xs text-slate-500">
            {formatDate(grant.startsAt)} tot {formatDate(grant.expiresAt)} / TTL {grant.ttlMinutes}m
          </p>
          <p className="mt-1 break-all text-xs text-slate-500">Platform user: {grant.platformUserId}</p>
        </div>
        {!grant.revokedAt && (
          <form action={revokeSupportGrantAction}>
            <input type="hidden" name="grantId" value={grant.id} />
            <button type="submit" className="rounded border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-50">
              Revoke
            </button>
          </form>
        )}
      </div>
    </article>
  );
}

function SupportGrantForm({
  tenants,
  platformUsers,
}: {
  tenants: { id: string; name: string }[];
  platformUsers: PlatformUserRow[];
}) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-normal text-slate-950">Support break-glass</h2>
        <p className="mt-1 text-sm text-slate-500">
          Reden, scope en expiry zijn verplicht. Max TTL: {FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES} minuten.
        </p>
      </div>
      <form action={createSupportGrantAction} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Tenant
          <select name="tenantId" required className="h-10 rounded border border-slate-300 px-3 text-sm">
            <option value="">Kies tenant</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Platformgebruiker
          <select name="platformUserId" required className="h-10 rounded border border-slate-300 px-3 text-sm">
            <option value="">Kies gebruiker</option>
            {platformUsers.map((user) => (
              <option key={user.id} value={user.id}>{user.role} - {user.userId}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Scope
          <select name="scope" required defaultValue="tenant" className="h-10 rounded border border-slate-300 px-3 text-sm">
            <option value="tenant">Tenant support</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Start
          <input name="startsAt" type="datetime-local" className="h-10 rounded border border-slate-300 px-3 text-sm" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Verloopt
          <input name="expiresAt" type="datetime-local" required className="h-10 rounded border border-slate-300 px-3 text-sm" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
          Toegestane handelingen
          <select name="permissions" required multiple size={7} className="rounded border border-slate-300 px-3 py-2 text-sm">
            {FIELDGRID_SUPPORT_RUNTIME_PERMISSION_KEYS.map((permission) => (
              <option key={permission} value={permission}>{permission}</option>
            ))}
          </select>
          <span className="text-xs font-normal text-slate-500">Selecteer alleen wat voor deze interventie nodig is.</span>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
          Reden
          <textarea
            name="reason"
            required
            minLength={12}
            rows={3}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Beschrijf waarom supporttoegang nodig is"
          />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="h-10 rounded bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
            Grant maken
          </button>
        </div>
      </form>
    </section>
  );
}

function sensitiveGrantStatusLabel(status: SensitiveAccessGrantRow["status"]): string {
  if (status === "active") return "Actief";
  if (status === "revoked") return "Ingetrokken";
  return "Verlopen";
}

function SensitiveAccessGrantCard({ grant }: { grant: SensitiveAccessGrantRow }) {
  return (
    <article className="rounded border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded border px-2 py-1 text-xs font-medium ${grant.isActive ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              {sensitiveGrantStatusLabel(grant.status)}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
              {grant.scope} / {grant.permission}
            </span>
          </div>
          <p className="mt-3 font-semibold text-slate-950">{grant.tenantName}</p>
          <p className="mt-1 break-all text-xs text-slate-500">User: {grant.userId}</p>
          <p className="mt-1 text-xs text-slate-500">Verloopt: {formatDate(grant.expiresAt)}</p>
        </div>
        {grant.isActive && (
          <form action={revokeSensitiveAccessAction} className="grid min-w-52 gap-2">
            <input type="hidden" name="grantId" value={grant.id} />
            <input name="reason" required minLength={12} className="h-9 rounded border border-slate-300 px-2 text-xs" placeholder="Reden intrekken" />
            <button type="submit" className="rounded border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-50">
              Revoke
            </button>
          </form>
        )}
      </div>
    </article>
  );
}

function SensitiveAccessRequestCard({
  request,
  permissions,
}: {
  request: SensitiveAccessRequestRow;
  permissions: SensitiveAccessDashboard["permissionOptions"];
}) {
  return (
    <article className="rounded border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
          {request.status}
        </span>
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
          Level {request.classification} / {request.scope}
        </span>
      </div>
      <p className="mt-3 font-semibold text-slate-950">{request.tenantName}</p>
      <p className="mt-1 break-words text-slate-600">{request.reason}</p>
      <p className="mt-2 break-all text-xs text-slate-500">
        Aanvrager: {request.requestedByUserId} / {request.requestedRole}
      </p>
      <p className="mt-1 text-xs text-slate-500">Vervalt: {formatDate(request.expiresAt)}</p>
      {request.status === "pending" && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <form action={approveSensitiveAccessAction} className="grid gap-2 rounded border border-emerald-200 bg-emerald-50 p-3">
            <input type="hidden" name="requestId" value={request.id} />
            <select name="permission" defaultValue="full_read" className="h-9 rounded border border-emerald-200 px-2 text-xs">
              {permissions.map((permission) => <option key={permission} value={permission}>{permission}</option>)}
            </select>
            <input name="durationMinutes" type="number" min={1} max={240} defaultValue={60} className="h-9 rounded border border-emerald-200 px-2 text-xs" />
            <input name="reason" minLength={12} className="h-9 rounded border border-emerald-200 px-2 text-xs" placeholder="Goedkeuringsreden" />
            <button type="submit" className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">
              Goedkeuren
            </button>
          </form>
          <form action={denySensitiveAccessAction} className="grid gap-2 rounded border border-rose-200 bg-rose-50 p-3">
            <input type="hidden" name="requestId" value={request.id} />
            <input name="reason" required minLength={12} className="h-9 rounded border border-rose-200 px-2 text-xs" placeholder="Reden weigering" />
            <button type="submit" className="rounded bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-800">
              Weigeren
            </button>
          </form>
        </div>
      )}
    </article>
  );
}

function SensitiveAccessPanel({ dashboard }: { dashboard: SensitiveAccessDashboard }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="grid gap-5">
        <section className="rounded border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Sensitive access aanvragen</h2>
            <p className="mt-1 text-sm text-slate-500">
              Full-read en export voor gevoelige tenantdata verlopen via tijdelijke grants met reden en audit.
            </p>
          </div>
          <form action={requestSensitiveAccessAction} className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Tenant
              <select name="tenantId" required className="h-10 rounded border border-slate-300 px-3 text-sm">
                <option value="">Kies tenant</option>
                {dashboard.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Scope
              <select name="scope" required className="h-10 rounded border border-slate-300 px-3 text-sm">
                {dashboard.scopeOptions.map((scope) => (
                  <option key={scope.value} value={scope.value}>{scope.label} / level {scope.classification}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Permissie
              <select name="permission" required defaultValue="full_read" className="h-10 rounded border border-slate-300 px-3 text-sm">
                {dashboard.permissionOptions.map((permission) => <option key={permission} value={permission}>{permission}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              TTL minuten
              <input name="durationMinutes" type="number" min={1} max={dashboard.maxTtlMinutes} defaultValue={60} className="h-10 rounded border border-slate-300 px-3 text-sm" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Ticket/reference
              <input name="supportTicketReference" className="h-10 rounded border border-slate-300 px-3 text-sm" placeholder="Ticket of incidentreferentie" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Reden
              <textarea name="reason" required minLength={12} rows={3} className="rounded border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <button type="submit" className="h-10 rounded bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
              Aanvraag maken
            </button>
          </form>
        </section>
        <section className="rounded border border-rose-200 bg-rose-50 p-5">
          <h2 className="text-lg font-semibold tracking-normal text-rose-950">Break-glass sensitive access</h2>
          <p className="mt-1 text-sm text-rose-700">
            Alleen voor urgente incidenten. Max TTL: {dashboard.maxTtlMinutes} minuten.
          </p>
          <form action={breakGlassSensitiveAccessAction} className="mt-4 grid gap-3">
            <select name="tenantId" required className="h-10 rounded border border-rose-200 px-3 text-sm">
              <option value="">Kies tenant</option>
              {dashboard.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
            <select name="scope" required className="h-10 rounded border border-rose-200 px-3 text-sm">
              {dashboard.scopeOptions.map((scope) => <option key={scope.value} value={scope.value}>{scope.label}</option>)}
            </select>
            <select name="permission" required defaultValue="full_read" className="h-10 rounded border border-rose-200 px-3 text-sm">
              {dashboard.permissionOptions.map((permission) => <option key={permission} value={permission}>{permission}</option>)}
            </select>
            <input name="durationMinutes" type="number" min={1} max={dashboard.maxTtlMinutes} defaultValue={30} className="h-10 rounded border border-rose-200 px-3 text-sm" />
            <input name="supportTicketReference" className="h-10 rounded border border-rose-200 px-3 text-sm" placeholder="Incident/ticket" />
            <textarea name="reason" required minLength={12} rows={3} className="rounded border border-rose-200 px-3 py-2 text-sm" placeholder="Urgente reden" />
            <button type="submit" className="h-10 rounded bg-rose-800 px-4 text-sm font-semibold text-white hover:bg-rose-900">
              Break-glass grant maken
            </button>
          </form>
        </section>
      </div>
      <div className="grid gap-5">
        {dashboard.activeGrants.length > 0 && (
          <section className="rounded border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-lg font-semibold tracking-normal text-amber-950">Actieve sensitive grants</h2>
            <p className="mt-1 text-sm text-amber-700">
              Deze grants maken full-read of export tijdelijk mogelijk voor de genoemde scope.
            </p>
            <div className="mt-4 grid gap-3">
              {dashboard.activeGrants.map((grant) => <SensitiveAccessGrantCard key={grant.id} grant={grant} />)}
            </div>
          </section>
        )}
        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Pending sensitive access</h2>
          <div className="mt-4 grid gap-3">
            {dashboard.pendingRequests.map((request) => (
              <SensitiveAccessRequestCard key={request.id} request={request} permissions={dashboard.permissionOptions} />
            ))}
            {dashboard.pendingRequests.length === 0 && (
              <p className="platform-empty-state text-sm">Geen open sensitive access aanvragen.</p>
            )}
          </div>
        </section>
        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Sensitive access audit trail</h2>
          <div className="mt-4 grid gap-3">
            {dashboard.requests.slice(0, 8).map((request) => (
              <SensitiveAccessRequestCard key={request.id} request={request} permissions={dashboard.permissionOptions} />
            ))}
            {dashboard.requests.length === 0 && (
              <p className="platform-empty-state text-sm">Nog geen sensitive access events.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

export default async function PlatformSecurityPage({ searchParams }: Props) {
  const filters = parseSecurityFilters(await searchParams);
  const [dashboard, platformUsers, sensitiveDashboard] = await Promise.all([
    listPlatformSecurityDashboard(filters),
    listPlatformUsers(),
    listSensitiveAccessDashboard(),
  ]);

  return (
    <main className="platform-page min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/platform" className="text-sm text-slate-500 underline-offset-2 hover:underline">
              Platformbeheer
            </Link>
            <p className="mt-4 text-sm font-medium text-slate-500">Fieldgrid security</p>
            <h1 className="text-3xl font-semibold tracking-normal">Security dashboard 2.0</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Read-only overzicht van support access events, denial events, downloads en platformwijzigingen met audit export.
            </p>
            <p className="mt-2 text-xs text-slate-400">Gegenereerd: {formatDate(dashboard.generatedAt)}</p>
          </div>
          <Link
            href={exportHref(dashboard.filters)}
            className="inline-flex h-10 w-fit items-center justify-center rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
          >
            Audit export
          </Link>
        </header>

        <form method="get" className="grid gap-3 rounded border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Tenant
            <select name="tenantId" defaultValue={dashboard.filters.tenantId ?? ""} className="h-10 rounded border border-slate-300 px-3 text-sm">
              <option value="">Alle tenants</option>
              {dashboard.tenantOptions.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Actor
            <input name="actorId" defaultValue={dashboard.filters.actorId ?? ""} className="h-10 rounded border border-slate-300 px-3 text-sm" placeholder="User of platform-user UUID" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Eventtype
            <select name="eventType" defaultValue={dashboard.filters.eventType} className="h-10 rounded border border-slate-300 px-3 text-sm">
              <option value="all">Alle events</option>
              <option value="support">Support</option>
              <option value="download">Downloads/PDF</option>
              <option value="denial">Denials</option>
              <option value="platform">Platform</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Resource
            <select name="resource" defaultValue={dashboard.filters.resource ?? ""} className="h-10 rounded border border-slate-300 px-3 text-sm">
              <option value="">Alle resources</option>
              {dashboard.resourceOptions.map((resource) => (
                <option key={resource.value} value={resource.value}>{resource.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Datum vanaf
            <input name="dateFrom" type="datetime-local" defaultValue={dateInputValue(dashboard.filters.dateFrom)} className="h-10 rounded border border-slate-300 px-3 text-sm" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Datum tot
            <input name="dateTo" type="datetime-local" defaultValue={dateInputValue(dashboard.filters.dateTo)} className="h-10 rounded border border-slate-300 px-3 text-sm" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Severity
            <select name="severity" defaultValue={dashboard.filters.severity} className="h-10 rounded border border-slate-300 px-3 text-sm">
              <option value="all">Alle severities</option>
              <option value="critical">Kritiek</option>
              <option value="warning">Waarschuwing</option>
              <option value="info">Info</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Support grant
            <select name="supportGrantId" defaultValue={dashboard.filters.supportGrantId ?? ""} className="h-10 rounded border border-slate-300 px-3 text-sm">
              <option value="">Alle grants</option>
              {dashboard.supportGrantOptions.map((grant) => (
                <option key={grant.id} value={grant.id}>
                  {grant.tenantName} / {grant.status} / {grant.platformUserId.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Scope
            <select name="scope" defaultValue={dashboard.filters.scope} className="h-10 rounded border border-slate-300 px-3 text-sm">
              <option value="all">Alle scopes</option>
              <option value="support">Support</option>
              <option value="tenant">Tenant-audit</option>
              <option value="platform">Platform-only</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="h-10 rounded bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
              Filter
            </button>
            <Link href="/platform/security" className="inline-flex h-10 items-center rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Reset
            </Link>
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Events" value={dashboard.events.length} />
          <StatCard label="Actieve support grants" value={dashboard.activeSupportGrants.length} tone={dashboard.activeSupportGrants.length > 0 ? "warning" : "neutral"} />
          <StatCard label="Denials" value={dashboard.denialEvents.length} tone={dashboard.denialEvents.length > 0 ? "danger" : "neutral"} />
          <StatCard label="Waarschuwingen" value={dashboard.severityCounts.warning} tone={dashboard.severityCounts.warning > 0 ? "warning" : "neutral"} />
          <StatCard label="Kritiek" value={dashboard.severityCounts.critical} tone={dashboard.severityCounts.critical > 0 ? "danger" : "neutral"} />
        </div>

        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Denial events</h2>
          <p className="mt-1 text-sm text-slate-500">
            Direct-ID denial, module denial, storage denial, tenant mismatch en platform access denial worden apart geteld.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.entries(denialLabels) as [PlatformSecurityDenialType, string][]).map(([key, label]) => (
              <div key={key} className="rounded border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{dashboard.denialBreakdown[key]}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <SupportGrantForm tenants={dashboard.tenantOptions} platformUsers={platformUsers} />
          <section className="rounded border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Actieve support grants</h2>
            <p className="mt-1 text-sm text-slate-500">
              Support grant zonder reden, scope of geldige expiry faalt. Verlopen grants zijn niet actief.
            </p>
            <div className="mt-4 grid gap-3">
              {dashboard.activeSupportGrants.map((grant) => <SupportGrantCard key={grant.id} grant={grant} />)}
              {dashboard.activeSupportGrants.length === 0 && (
                <p className="platform-empty-state text-sm">
                  Geen actieve support grants voor deze filters.
                </p>
              )}
            </div>
          </section>
        </div>

        <SensitiveAccessPanel dashboard={sensitiveDashboard} />

        <EventSection
          title="Support access events"
          helper="Grant-aanmaak, denied grantpogingen, revoke, supportmodus en support checks met break-glass risk label."
          events={dashboard.supportEvents}
        />
        <EventSection
          title="Downloads"
          helper="Download- en PDF-events die securityrelevant zijn voor storage, document en rapportcontrole."
          events={dashboard.downloadEvents}
        />
        <EventSection
          title="Denials"
          helper="Geweigerde acties en policy-denials zodra ze in audit_log of support_access_audit_log staan."
          events={dashboard.denialEvents}
        />
        <EventSection
          title="Platform changes"
          helper="Platformbeheer-acties en tenantwijzigingen die los van reguliere tenant-audit beoordeeld worden."
          events={dashboard.platformEvents}
        />
        <EventSection
          title="Security events"
          helper="Gecombineerde mobiele auditfeed met tenant, actor, resource, datum, severity en support grant context."
          events={dashboard.events}
        />
      </div>
    </main>
  );
}

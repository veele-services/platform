import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar,
  CheckCircle2, XCircle, ClipboardList, Building2,
  Briefcase, AlertCircle, FileText,
} from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { StatusBadge } from "@/components/ui/status-badge";
import { PersonnelDetailActions } from "@/components/personnel/PersonnelDetailActions";
import { PersonnelCompetenciesEditButton } from "@/components/personnel/PersonnelCompetenciesEditButton";
import { AssignmentHistoryTable } from "@/components/assignments/AssignmentHistoryTable";
import { EntityDocumentsPanel } from "@/components/documents/EntityDocumentsPanel";
import { InventoryItemsPanel } from "@/components/inventory/InventoryItemsPanel";
import { getPersonnel, listRoles, listSectors, getPersonnelAuthStatus, getLinkedObjects } from "@/app/actions/personnel";
import { getAvailabilityWindows, listLeavePeriods } from "@/app/actions/availability";
import { BeschikbaarheidView } from "@/components/personnel/BeschikbaarheidView";
import { PersonnelPortalAccessCard } from "@/components/personnel/PersonnelPortalAccessCard";
import { listAssignmentsForPersonnel } from "@/app/actions/assignments";
import { listDocuments } from "@/app/actions/documents";
import { listInventoryForPersonnel } from "@/app/actions/inventory";
import {
  listPersonnelQualifications,
  type QualificationLinkRow,
} from "@/app/actions/qualifications";
import {
  PERSONNEL_TYPE_LABELS,
  PERSONNEL_TYPE_COLORS,
  type PersonnelType,
} from "@/types/personnel";
import {
  TenantDetailActionPanel,
  TenantDetailHeader,
  TenantDetailLayout,
  TenantDetailSectionNav,
  TenantPageShell,
} from "@/components/tenant-ui";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const canRead = await hasPermission("personnel", "read");
    if (!canRead) return { title: "Access Denied" };
    const { id } = await params;
    const p = await getPersonnel(id);
    return { title: p ? `${p.firstName} ${p.lastName}` : "Personnel" };
  } catch {
    return { title: "Personnel" };
  }
}

export default async function PersonnelDetailPage({ params }: Props) {
  const canRead = await hasPermission("personnel", "read");
  if (!canRead) return <ForbiddenPage resource="personnel" action="read" />;

  const { id } = await params;

  const [canWrite, canReadAssignments, canReadDocuments, canWriteDocuments, canReadInventory] = await Promise.all([
    hasPermission("personnel", "write"),
    hasPermission("assignments", "read"),
    hasPermission("documents", "read"),
    hasPermission("documents", "write"),
    hasPermission("inventory", "view"),
  ]);

  const [
    person,
    roles,
    sectors,
    windows,
    leavePeriods,
    assignmentHistory,
    documents,
    authStatus,
    linkedObjects,
    qualificationLinks,
    inventoryItems,
  ] = await Promise.all([
    getPersonnel(id),
    listRoles(),
    listSectors(),
    getAvailabilityWindows(id),
    listLeavePeriods(id),
    listAssignmentsForPersonnel(id),
    listDocuments({ entityType: "personnel", entityId: id }),
    getPersonnelAuthStatus(id),
    getLinkedObjects(id),
    listPersonnelQualifications(id),
    canReadInventory ? listInventoryForPersonnel(id) : Promise.resolve([]),
  ]);

  if (!person) notFound();

  const fullName = `${person.firstName} ${person.lastName}`;

  const typeLabel = person.personnelType
    ? (PERSONNEL_TYPE_LABELS[person.personnelType as PersonnelType] ?? person.personnelType)
    : null;
  const typeColor = person.personnelType
    ? PERSONNEL_TYPE_COLORS[person.personnelType as PersonnelType]
    : null;

  return (
    <TenantPageShell size="default">
      <TenantDetailHeader
        backHref="/personnel"
        backLabel="Personeel"
        title={fullName}
        description={person.email}
        badges={
          <>
            <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {person.code}
            </span>
            {typeLabel && typeColor && (
              <span
                className="rounded px-2.5 py-1 text-xs font-semibold"
                style={{ backgroundColor: typeColor.bg, color: typeColor.color }}
              >
                {typeLabel}
              </span>
            )}
            {person.roleName && (
              <span className="rounded bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {person.roleName}
              </span>
            )}
            {person.sectorName && (
              <span className="rounded bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {person.sectorName}
              </span>
            )}
            <StatusBadge isActive={person.isActive} />
            {person.emergencyAvailable && (
              <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                <AlertCircle className="h-3 w-3" />
                Spoedsbeschikbaar
              </span>
            )}
          </>
        }
        meta={[
          { label: "Beschikbaar", value: person.isAvailable ? "Ja" : "Nee" },
          { label: "Regio", value: person.region ?? "Geen primaire regio" },
          { label: "Aangemaakt", value: new Date(person.createdAt).toLocaleDateString("nl-NL") },
        ]}
      />

      <TenantDetailSectionNav
        items={[
          { label: "Beschikbaarheid", href: "#availability", active: true },
          { label: "Profiel", href: "#profile" },
          { label: "Opdrachten", href: "#assignments", count: assignmentHistory.length },
          { label: "Inventaris", href: "#inventory", count: inventoryItems.length },
          { label: "Documenten", href: "#documents", count: documents.length },
        ]}
      />

      <TenantDetailLayout
        aside={
          canWrite ? (
            <TenantDetailActionPanel
              title="Personeelsacties"
              description="Beheer profiel, toegang en beschikbaarheid vanuit dit dossier."
            >
              <PersonnelDetailActions
                personnelId={person.id}
                personnelName={fullName}
                personnelEmail={person.email}
                isActive={person.isActive}
                userId={person.userId}
                inviteSentAt={person.inviteSentAt}
                authStatus={authStatus}
                roles={roles}
                sectors={sectors}
              />
            </TenantDetailActionPanel>
          ) : undefined
        }
      >
      {/* ── Header ──────────────────────────────────────── */}
      <div className="hidden">
        <div className="flex items-start gap-4">
          <Link
            href="/personnel"
            className="mt-1 flex items-center gap-1 text-sm transition-colors hover:underline"
            style={{ color: "#64748B" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Personeel
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
                {fullName}
              </h1>
              <span className="font-mono text-xs rounded px-1.5 py-0.5 bg-slate-100" style={{ color: "#475569" }}>
                {person.code}
              </span>
              {typeLabel && typeColor && (
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded"
                  style={{ backgroundColor: typeColor.bg, color: typeColor.color }}
                >
                  {typeLabel}
                </span>
              )}
              {person.roleName && (
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded"
                  style={{ backgroundColor: "#F0F4FF", color: "#3B5CE0" }}
                >
                  {person.roleName}
                </span>
              )}
              {person.sectorName && (
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded"
                  style={{ backgroundColor: "#ECFDF5", color: "#047857" }}
                >
                  {person.sectorName}
                </span>
              )}
              <StatusBadge isActive={person.isActive} />
              {person.emergencyAvailable && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded"
                  style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}
                >
                  <AlertCircle className="h-3 w-3" />
                  Spoedsbeschikbaar
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm" style={{ color: "#64748B" }}>{person.email}</p>
          </div>
        </div>

        {canWrite && (
          <PersonnelDetailActions
            personnelId={person.id}
            personnelName={fullName}
            personnelEmail={person.email}
            isActive={person.isActive}
            userId={person.userId}
            inviteSentAt={person.inviteSentAt}
            authStatus={authStatus}
            roles={roles}
            sectors={sectors}
          />
        )}
      </div>

      {/* ── Beschikbaarheid & verlof ─────────────────────────────── */}
      <section id="availability" className="mb-6 scroll-mt-24">
        <h2 className="font-heading text-base font-semibold mb-4" style={{ color: "#081D3A" }}>
          Beschikbaarheid &amp; verlof
        </h2>
        <BeschikbaarheidView
          personnelId={id}
          windows={windows}
          leavePeriods={leavePeriods}
          canWrite={canWrite}
        />
      </section>

      <div id="profile" className="grid scroll-mt-24 grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── Left column ──────────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Contact */}
          <div className="veele-card">
            <h2 className="font-heading text-sm font-semibold mb-4" style={{ color: "#081D3A" }}>
              Contact
            </h2>
            <dl className="space-y-3">
              <InfoRow
                icon={<Mail className="h-4 w-4" />}
                label="E-mail"
                value={
                  <a href={`mailto:${person.email}`} className="hover:underline" style={{ color: "#00B7B3" }}>
                    {person.email}
                  </a>
                }
              />
              {person.phone && (
                <InfoRow
                  icon={<Phone className="h-4 w-4" />}
                  label="Telefoon"
                  value={
                    <a href={`tel:${person.phone}`} className="hover:underline" style={{ color: "#00B7B3" }}>
                      {person.phone}
                    </a>
                  }
                />
              )}
              {person.region && (
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="Primaire regio" value={person.region} />
              )}
              {person.sectorName && (
                <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Sector" value={person.sectorName} />
              )}
              {person.preferredRegions.length > 0 && (
                <InfoRow
                  icon={<MapPin className="h-4 w-4" />}
                  label="Voorkeurregio's"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {person.preferredRegions.map((r) => (
                        <span
                          key={r}
                          className="inline-block rounded px-1.5 py-0.5 text-xs"
                          style={{ backgroundColor: "#F1F5F9", color: "#64748B" }}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  }
                />
              )}
            </dl>
          </div>

          {/* Qualifications */}
          <div className="veele-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>
                Kwalificaties
              </h2>
              {canWrite && (
                <PersonnelCompetenciesEditButton
                  personnelId={person.id}
                  personnelName={fullName}
                  roles={roles}
                  sectors={sectors}
                />
              )}
            </div>
            <div className="space-y-4">
              {qualificationLinks.length > 0 ? (
                <>
                  <QualificationLinkSection
                    label="Certificaten"
                    links={qualificationLinks.filter((link) => link.qualificationType === "certificate")}
                    color="#0A7E7A"
                    bg="#E0FAFB"
                  />
                  <QualificationLinkSection
                    label="Diploma's"
                    links={qualificationLinks.filter((link) => link.qualificationType === "diploma")}
                    color="#5A3B9A"
                    bg="#F0EBFF"
                  />
                  <QualificationLinkSection
                    label="Kennis"
                    links={qualificationLinks.filter((link) => link.qualificationType === "knowledge")}
                    color="#7C5A00"
                    bg="#FFF7E0"
                  />
                </>
              ) : (
                <>
                  <QualSection label="Certificaten" tags={person.certificates.map((c) => c.name)} color="#0A7E7A" bg="#E0FAFB" />
                  <QualSection label="Diploma's"    tags={person.diplomas}     color="#5A3B9A" bg="#F0EBFF" />
                  <QualSection label="Kennis"       tags={person.knowledge}    color="#7C5A00" bg="#FFF7E0" />
                </>
              )}
            </div>
          </div>

          {/* Contract info */}
          {person.contractInfo && (
            <div className="veele-card">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-4 w-4" style={{ color: "#00B7B3" }} />
                <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>
                  Contractgegevens
                </h2>
              </div>
              <dl className="space-y-3">
                {person.contractInfo.contract_type && (
                  <InfoRow
                    icon={<Briefcase className="h-4 w-4" />}
                    label="Contracttype"
                    value={person.contractInfo.contract_type}
                  />
                )}
                {person.contractInfo.start_date && (
                  <InfoRow
                    icon={<Calendar className="h-4 w-4" />}
                    label="Startdatum"
                    value={new Date(person.contractInfo.start_date).toLocaleDateString("nl-NL", {
                      day: "2-digit", month: "long", year: "numeric",
                    })}
                  />
                )}
                {person.contractInfo.end_date && (
                  <InfoRow
                    icon={<Calendar className="h-4 w-4" />}
                    label="Einddatum"
                    value={new Date(person.contractInfo.end_date).toLocaleDateString("nl-NL", {
                      day: "2-digit", month: "long", year: "numeric",
                    })}
                  />
                )}
                {person.contractInfo.hours_per_week != null && (
                  <InfoRow
                    icon={<ClipboardList className="h-4 w-4" />}
                    label="Uren per week"
                    value={`${person.contractInfo.hours_per_week} uur`}
                  />
                )}
              </dl>
            </div>
          )}
        </div>

        {/* ── Right column ─────────────────────────────── */}
        <div className="flex flex-col gap-5">
          <div className="veele-card">
            <h2 className="font-heading text-sm font-semibold mb-4" style={{ color: "#081D3A" }}>
              Gegevens
            </h2>
            <dl className="space-y-3">
              <InfoRow
                icon={<Calendar className="h-4 w-4" />}
                label="Aangemaakt"
                value={new Date(person.createdAt).toLocaleDateString("nl-NL", {
                  day: "2-digit", month: "short", year: "numeric",
                })}
              />
              <InfoRow
                icon={person.isAvailable
                  ? <CheckCircle2 className="h-4 w-4" style={{ color: "#00B7B3" }} />
                  : <XCircle     className="h-4 w-4" style={{ color: "#94A3B8" }} />}
                label="Beschikbaar voor planning"
                value={
                  <span style={{ color: person.isAvailable ? "#00B7B3" : "#94A3B8" }}>
                    {person.isAvailable ? "Ja" : "Nee"}
                  </span>
                }
              />
            </dl>
          </div>

          {/* Portaal-toegang */}
          {canWrite && (
            <PersonnelPortalAccessCard
              personnelId={person.id}
              personnelEmail={person.email}
              authStatus={authStatus}
              inviteSentAt={person.inviteSentAt}
            />
          )}

          {/* Gekoppelde objecten */}
          {linkedObjects.length > 0 && (
            <div className="veele-card">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="h-4 w-4" style={{ color: "#00B7B3" }} />
                <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>
                  Gekoppelde objecten
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                {linkedObjects.map((obj) => (
                  <Link
                    key={obj.objectId}
                    href={`/objects/${obj.objectId}`}
                    className="flex items-start gap-2 rounded-lg p-2 transition-colors hover:bg-slate-50"
                    style={{ border: "1px solid #F1F5F9" }}
                  >
                    <Building2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: "#94A3B8" }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "#081D3A" }}>
                        {obj.objectName}
                      </p>
                      <p className="text-xs truncate" style={{ color: "#94A3B8" }}>
                        {obj.customerName}{obj.city ? ` · ${obj.city}` : ""}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Assignment history ────────────────────────── */}
      {canReadAssignments && (
        <div id="assignments" className="mt-5 scroll-mt-24">
          <div className="veele-card overflow-hidden p-0">
            <div className="flex items-center justify-between px-5 py-4">
              <h2
                className="font-heading text-sm font-semibold flex items-center gap-2"
                style={{ color: "#081D3A" }}
              >
                <ClipboardList className="h-4 w-4" style={{ color: "#00B7B3" }} />
                Opdrachten
                <span className="text-xs font-normal" style={{ color: "#94A3B8" }}>
                  (laatste 10)
                </span>
              </h2>
              <Link
                href={`/assignments?personnelId=${person.id}`}
                className="text-xs font-medium hover:underline"
                style={{ color: "#00B7B3" }}
              >
                Alle bekijken →
              </Link>
            </div>
            <AssignmentHistoryTable
              rows={assignmentHistory}
              emptyMessage="Nog geen opdrachten voor dit personeelslid."
            />
          </div>
        </div>
      )}

      {/* ── Inventory ─────────────────────────────────── */}
      {canReadInventory && (
        <div id="inventory" className="mt-5 scroll-mt-24">
          <InventoryItemsPanel
            rows={inventoryItems}
            title="Inventaris"
            emptyMessage="Er is nog geen inventaris aan dit personeelslid gekoppeld."
          />
        </div>
      )}

      {/* ── Documents ─────────────────────────────────── */}
      {canReadDocuments && (
        <div id="documents" className="mt-5 scroll-mt-24">
          <EntityDocumentsPanel
            entityType="personnel"
            entityId={id}
            initialDocuments={documents}
            canWrite={canWriteDocuments}
          />
        </div>
      )}
      </TenantDetailLayout>
    </TenantPageShell>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
}: {
  icon:  React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex-shrink-0" style={{ color: "#94A3B8" }}>{icon}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs" style={{ color: "#94A3B8" }}>{label}</span>
        <span className="text-sm" style={{ color: "#475569" }}>{value}</span>
      </div>
    </div>
  );
}

function QualSection({
  label,
  tags,
  color,
  bg,
}: {
  label: string;
  tags:  string[];
  color: string;
  bg:    string;
}) {
  return (
    <div>
      <p className="text-xs font-medium mb-1.5" style={{ color: "#94A3B8" }}>{label}</p>
      {tags.length === 0 ? (
        <p className="text-sm" style={{ color: "#94A3B8" }}>Geen</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-block rounded px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: bg, color }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function QualificationLinkSection({
  label,
  links,
  color,
  bg,
}: {
  label: string;
  links: QualificationLinkRow[];
  color: string;
  bg: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium mb-1.5" style={{ color: "#94A3B8" }}>{label}</p>
      {links.length === 0 ? (
        <p className="text-sm" style={{ color: "#94A3B8" }}>Geen</p>
      ) : (
        <div className="flex flex-col gap-2">
          {links.map((link) => {
            const status =
              link.expiryStatus === "expired"
                ? { label: "Verlopen", bg: "#FEF2F2", color: "#DC2626" }
                : link.expiryStatus === "expiring"
                  ? { label: "Verloopt binnenkort", bg: "#FFFBEB", color: "#B45309" }
                  : link.expiryStatus === "valid"
                    ? { label: "Geldig", bg: "#ECFDF5", color: "#059669" }
                    : null;
            return (
              <div key={link.id} className="rounded-lg border p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-block rounded px-2.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: bg, color }}
                  >
                    {link.qualificationName}
                  </span>
                  {status && (
                    <span
                      className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: status.bg, color: status.color }}
                    >
                      {status.label}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs" style={{ color: "#64748B" }}>
                  {link.qualificationCode}
                  {link.issuedAt ? ` - afgegeven ${new Date(`${link.issuedAt}T00:00:00`).toLocaleDateString("nl-NL")}` : ""}
                  {link.expiresAt ? ` - verloopt ${new Date(`${link.expiresAt}T00:00:00`).toLocaleDateString("nl-NL")}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

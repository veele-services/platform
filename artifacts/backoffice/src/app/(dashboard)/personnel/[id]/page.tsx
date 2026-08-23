import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Mail, Phone, MapPin, Calendar,
  CheckCircle2, XCircle, ClipboardList, Building2,
  Briefcase, AlertCircle, FileText, Route,
} from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { isCurrentTenantModuleEnabled } from "@/lib/auth/modules";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { StatusBadge } from "@/components/ui/status-badge";
import { PersonnelDetailActions } from "@/components/personnel/PersonnelDetailActions";
import { PersonnelCompetenciesEditButton } from "@/components/personnel/PersonnelCompetenciesEditButton";
import { AssignmentHistoryTable } from "@/components/assignments/AssignmentHistoryTable";
import { EntityDocumentsPanel } from "@/components/documents/EntityDocumentsPanel";
import { InventoryItemsPanel } from "@/components/inventory/InventoryItemsPanel";
import { MaterialStockPanel } from "@/components/materials/MaterialStockPanel";
import { getPersonnel, listRoles, listSectors, getPersonnelAuthStatus, getLinkedObjects } from "@/app/actions/personnel";
import { getAvailabilityWindows, listLeavePeriods } from "@/app/actions/availability";
import { formatPersonnelRoleName } from "@/lib/personnel-role-labels";
import { BeschikbaarheidView } from "@/components/personnel/BeschikbaarheidView";
import { PersonnelPortalAccessCard } from "@/components/personnel/PersonnelPortalAccessCard";
import { listAssignmentsForPersonnel } from "@/app/actions/assignments";
import { listDocuments } from "@/app/actions/documents";
import { listInventoryForPersonnel } from "@/app/actions/inventory";
import { listMaterialStockForPersonnel } from "@/app/actions/materials";
import { getDossierSummary, getDossierWorkspace } from "@/app/actions/dossier360";
import { DossierStatusStrip } from "@/components/dossiers/DossierStatusStrip";
import { DossierWorkspacePanel } from "@/components/dossiers/DossierWorkspacePanel";
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

async function safeDossierOptional<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader();
  } catch {
    console.error("personnel detail optional dossier data failed");
    return fallback;
  }
}

function vehicleTypeLabel(value: string | null | undefined): string {
  switch (value) {
    case "BICYCLE":
      return "Fiets";
    case "WALK":
      return "Lopen";
    case "TRANSIT":
      return "Openbaar vervoer";
    case "DRIVE":
    default:
      return "Auto";
  }
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

  const [
    canWrite,
    canReadAssignments,
    canReadObjects,
    canReadDocuments,
    canWriteDocuments,
    canReadMaterials,
    canReadInventory,
    personnelPortalEnabled,
    canManageDossiers,
    canWriteDossierNotes,
    canWriteConfidentialDossierNotes,
    canWriteRestrictedDossierNotes,
    canReadDossierTimeline,
  ] = await Promise.all([
    hasPermission("personnel", "write"),
    hasPermission("assignments", "read"),
    hasPermission("objects", "read"),
    hasPermission("documents", "read"),
    hasPermission("documents", "write"),
    hasPermission("materials", "view"),
    hasPermission("inventory", "view"),
    isCurrentTenantModuleEnabled("personnel_portal"),
    hasPermission("dossiers", "manage"),
    hasPermission("dossiers", "notes"),
    hasPermission("dossiers", "notes_confidential"),
    hasPermission("dossiers", "notes_restricted"),
    hasPermission("dossiers", "timeline"),
  ]);
  const canManagePortal = canWrite && personnelPortalEnabled;

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
    materialStock,
    inventoryItems,
    dossier,
    dossierWorkspace,
  ] = await Promise.all([
    getPersonnel(id),
    canWrite ? listRoles() : Promise.resolve([]),
    canWrite ? listSectors() : Promise.resolve([]),
    getAvailabilityWindows(id),
    listLeavePeriods(id),
    canReadAssignments ? listAssignmentsForPersonnel(id) : Promise.resolve([]),
    canReadDocuments
      ? listDocuments({ entityType: "personnel", entityId: id })
      : Promise.resolve([]),
    canManagePortal ? getPersonnelAuthStatus(id) : Promise.resolve("none" as const),
    canReadObjects ? getLinkedObjects(id) : Promise.resolve([]),
    listPersonnelQualifications(id),
    canReadMaterials ? listMaterialStockForPersonnel(id) : Promise.resolve([]),
    canReadInventory ? listInventoryForPersonnel(id) : Promise.resolve([]),
    safeDossierOptional(
      () => getDossierSummary({ subjectType: "personnel", subjectId: id }),
      null,
    ),
    canManageDossiers || canWriteDossierNotes || canWriteConfidentialDossierNotes || canWriteRestrictedDossierNotes || canReadDossierTimeline
      ? safeDossierOptional(
          () => getDossierWorkspace({ subjectType: "personnel", subjectId: id }),
          null,
        )
      : Promise.resolve(null),
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
                {formatPersonnelRoleName(person.roleName)}
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
          { label: "Branch/regio", value: person.region ?? "Geen primaire branch/regio" },
          { label: "Standaard vervoer", value: vehicleTypeLabel(person.vehicleType) },
          { label: "Aangemaakt", value: new Date(person.createdAt).toLocaleDateString("nl-NL") },
        ]}
      />

      <DossierStatusStrip dossier={dossier} />
      {!dossier && (
        <div role="status" className="mb-5 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Dossierstatus is tijdelijk niet beschikbaar; het personeelsprofiel blijft bruikbaar.
        </div>
      )}
      {(canManageDossiers || canWriteDossierNotes || canWriteConfidentialDossierNotes || canWriteRestrictedDossierNotes || canReadDossierTimeline) && !dossierWorkspace && (
        <div role="status" className="mb-5 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          De Dossier 360-werkruimte kon niet worden geladen; overige profielonderdelen blijven beschikbaar.
        </div>
      )}

      <TenantDetailSectionNav
        items={[
          { label: "Beschikbaarheid", href: "#availability", active: true },
          { label: "Profiel", href: "#profile" },
          ...(canReadAssignments
            ? [{ label: "Opdrachten", href: "#assignments", count: assignmentHistory.length }]
            : []),
          ...(canReadMaterials
            ? [{ label: "Materiaal", href: "#materials", count: materialStock.length }]
            : []),
          ...(canReadInventory
            ? [{ label: "Inventaris", href: "#inventory", count: inventoryItems.length }]
            : []),
          ...(canReadDocuments
            ? [{ label: "Documenten", href: "#documents", count: documents.length }]
            : []),
          ...(dossierWorkspace ? [{ label: "Dossier 360", href: "#dossier-360" }] : []),
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
                canManagePortal={canManagePortal}
              />
            </TenantDetailActionPanel>
          ) : undefined
        }
      >
      {dossierWorkspace && (
        <DossierWorkspacePanel
          dossier={dossierWorkspace}
          subject={{ subjectType: "personnel", subjectId: id }}
        />
      )}
      {/* ── Beschikbaarheid & verlof ─────────────────────────────── */}
      <section id="availability" className="mb-6 scroll-mt-24">
        <h2 className="font-heading text-base font-semibold mb-4" style={{ color: "var(--color-foreground)" }}>
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
            <h2 className="font-heading text-sm font-semibold mb-4" style={{ color: "var(--color-foreground)" }}>
              Contact
            </h2>
            <dl className="space-y-3">
              <InfoRow
                icon={<Mail className="h-4 w-4" />}
                label="E-mail"
                value={
                  <a href={`mailto:${person.email}`} className="hover:underline" style={{ color: "var(--color-primary)" }}>
                    {person.email}
                  </a>
                }
              />
              {person.phone && (
                <InfoRow
                  icon={<Phone className="h-4 w-4" />}
                  label="Telefoon"
                  value={
                    <a href={`tel:${person.phone}`} className="hover:underline" style={{ color: "var(--color-primary)" }}>
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
              <InfoRow
                icon={<Route className="h-4 w-4" />}
                label="Standaard vervoersmiddel"
                value={vehicleTypeLabel(person.vehicleType)}
              />
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
              <h2 className="font-heading text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
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
                <FileText className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                <h2 className="font-heading text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
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
            <h2 className="font-heading text-sm font-semibold mb-4" style={{ color: "var(--color-foreground)" }}>
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
                  ? <CheckCircle2 className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                  : <XCircle     className="h-4 w-4" style={{ color: "#94A3B8" }} />}
                label="Beschikbaar voor planning"
                value={
                  <span style={{ color: person.isAvailable ? "var(--color-primary)" : "#94A3B8" }}>
                    {person.isAvailable ? "Ja" : "Nee"}
                  </span>
                }
              />
            </dl>
          </div>

          {/* Portaal-toegang */}
          {canManagePortal && (
            <PersonnelPortalAccessCard
              personnelId={person.id}
              personnelEmail={person.email}
              authStatus={authStatus}
              inviteSentAt={person.inviteSentAt}
            />
          )}

          {/* Gekoppelde objecten */}
          {canReadObjects && linkedObjects.length > 0 && (
            <div className="veele-card">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                <h2 className="font-heading text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
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
                      <p className="text-sm font-medium truncate" style={{ color: "var(--color-foreground)" }}>
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
                style={{ color: "var(--color-foreground)" }}
              >
                <ClipboardList className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                Opdrachten
                <span className="text-xs font-normal" style={{ color: "#94A3B8" }}>
                  (laatste 10)
                </span>
              </h2>
              <Link
                href={`/assignments?personnelId=${person.id}`}
                className="text-xs font-medium hover:underline"
                style={{ color: "var(--color-primary)" }}
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

      {/* Materiaal / voorraad */}
      {canReadMaterials && (
        <div id="materials" className="mt-5 scroll-mt-24">
          <MaterialStockPanel
            rows={materialStock}
            title="Materiaal / voorraad"
            emptyMessage="Er is nog geen materiaalvoorraad aan dit personeelslid gekoppeld."
          />
        </div>
      )}

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

"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  UserPlus,
  UserMinus,
  AlertCircle,
  Loader2,
  Users,
  MapPin,
} from "lucide-react";
import { assignPersonnel } from "@/app/actions/assignments";
import { unassignPersonnel, getPersonnelForAssignment } from "@/app/actions/planning";
import { formatPersonnelRoleName } from "@/lib/personnel-role-labels";
import type {
  AssignmentRequirements,
  PersonnelEligibilityEntry,
  PersonnelForAssignmentResult,
} from "@/app/actions/planning";
import { toast } from "sonner";

// ─── Availability config ──────────────────────────────────────────────────────

type AvailStatus = "beschikbaar" | "niet_beschikbaar" | "op_verlof" | "ziek" | "niet_ingesteld";

const AVAIL_CONFIG: Record<
  AvailStatus,
  { label: string; color: string; bg: string; dot: string }
> = {
  beschikbaar:      { label: "Beschikbaar",      color: "#16A34A", bg: "#DCFCE7", dot: "#16A34A" },
  niet_beschikbaar: { label: "Niet beschikbaar", color: "#DC2626", bg: "#FEE2E2", dot: "#DC2626" },
  op_verlof:        { label: "Op verlof",         color: "#D97706", bg: "#FEF3C7", dot: "#D97706" },
  ziek:             { label: "Ziek",              color: "#7C3AED", bg: "#EDE9FE", dot: "#7C3AED" },
  niet_ingesteld:   { label: "Onbekend",          color: "#94A3B8", bg: "#F1F5F9", dot: "#CBD5E1" },
};

// ─── Eligibility engine ───────────────────────────────────────────────────────

function checkEligibility(
  person: PersonnelEligibilityEntry,
  req: AssignmentRequirements,
): string[] {
  const missing: string[] = [];

  if (
    req.requiredRoleIds.length > 0 &&
    !req.requiredRoleIds.includes(person.roleId ?? "")
  ) {
    missing.push("Vereiste rol ontbreekt");
  }

  for (const cert of req.requiredCertificates) {
    if (!person.certificates.includes(cert)) {
      missing.push(`Certificaat: ${cert}`);
    }
  }

  for (const know of req.requiredKnowledge) {
    if (!person.knowledge.includes(know)) {
      missing.push(`Kennis: ${know}`);
    }
  }

  if (req.requiredDiplomas.length > 0) {
    const hasDiploma = req.requiredDiplomas.some((d) => person.diplomas.includes(d));
    if (!hasDiploma) {
      missing.push(`Diploma vereist (${req.requiredDiplomas.join(" of ")})`);
    }
  }

  return missing;
}

function regionMismatch(
  person: PersonnelEligibilityEntry,
  req: AssignmentRequirements,
): boolean {
  if (!req.assignmentRegion) return false;
  if (!person.region) return true; // region required but person has none
  return person.region.toLowerCase() !== req.assignmentRegion.toLowerCase();
}

// ─── Requirements summary ─────────────────────────────────────────────────────

function RequirementsTags({ req }: { req: AssignmentRequirements }) {
  const items = [
    ...req.requiredCertificates.map((c) => `Certificaat: ${c}`),
    ...req.requiredKnowledge.map((k) => `Kennis: ${k}`),
    ...req.requiredDiplomas.map((d) => `Diploma: ${d}`),
  ];
  if (req.requiredRoleIds.length > 0) items.unshift("Specifieke rol vereist");

  const regionLabel = req.assignmentRegion ? `Regio: ${req.assignmentRegion}` : null;

  if (items.length === 0 && !regionLabel) {
    return (
      <span className="text-xs" style={{ color: "#94A3B8" }}>
        Geen specifieke vereisten
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {regionLabel && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ background: "#FEF3C7", color: "#92400E" }}
        >
          <MapPin className="h-3 w-3" />
          {regionLabel}
        </span>
      )}
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ background: "#EFF6FF", color: "#1E40AF" }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

// ─── Availability badge ───────────────────────────────────────────────────────

function AvailabilityBadge({ status }: { status: string }) {
  const cfg = AVAIL_CONFIG[status as AvailStatus] ?? AVAIL_CONFIG.niet_ingesteld;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ background: cfg.dot }}
      />
      {cfg.label}
    </span>
  );
}

// ─── Region badge ─────────────────────────────────────────────────────────────

function RegionBadge({
  region,
  mismatch,
}: {
  region: string | null;
  mismatch: boolean;
}) {
  if (!region) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs flex-shrink-0"
      style={
        mismatch
          ? { background: "#FEF3C7", color: "#92400E" }
          : { background: "#F0FDF4", color: "#166534" }
      }
    >
      <MapPin className="h-2.5 w-2.5" />
      {region}
    </span>
  );
}

// ─── Personnel row ────────────────────────────────────────────────────────────

function SectorBadge({ sectorName }: { sectorName: string | null }) {
  if (!sectorName) return null;
  const normalized = sectorName.toLowerCase();
  const style = normalized.includes("schoonmaak")
    ? { background: "#E2FAF8", color: "#075E5D", borderColor: "#8CE7E2" }
    : normalized.includes("beveilig")
      ? { background: "#F2EEFF", color: "#4C1D95", borderColor: "#C4B5FD" }
      : normalized.includes("facilit")
        ? { background: "#E8F4FF", color: "#0F3A5F", borderColor: "#93C5FD" }
        : { background: "#F8FAFC", color: "#475569", borderColor: "#E2E8F0" };

  return (
    <span
      className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs flex-shrink-0"
      style={style}
    >
      {sectorName}
    </span>
  );
}

interface PersonnelRowProps {
  person:       PersonnelEligibilityEntry;
  missing:      string[];
  hasRegionMismatch: boolean;
  assignmentId: string;
  canWrite:     boolean;
  onChanged:    () => void;
}

function PersonnelRow({
  person,
  missing,
  hasRegionMismatch,
  assignmentId,
  canWrite,
  onChanged,
}: PersonnelRowProps) {
  const [isPending, startTransition] = useTransition();
  const [showUnassignment, setShowUnassignment] = useState(false);
  const [unassignmentReason, setUnassignmentReason] = useState("");
  const isAssigned = person.linkId !== null;
  const isEligible = missing.length === 0;
  const name       = `${person.firstName} ${person.lastName}`.trim();

  const availStatus = person.availabilityStatus as AvailStatus;
  const isUnavailable =
    availStatus === "ziek" ||
    availStatus === "op_verlof" ||
    availStatus === "niet_beschikbaar";

  function handleAssign() {
    startTransition(async () => {
      const result = await assignPersonnel(assignmentId, person.personnelId);
      if (result.success) {
        if ("warning" in result && result.warning) toast.warning(result.warning as string);
        else toast.success(`${name} ingepland.`);
        onChanged();
      } else {
        toast.error(result.message ?? "Inplannen mislukt.");
      }
    });
  }

  function handleUnassign() {
    if (!unassignmentReason.trim()) {
      toast.error("Een reden voor ontkoppelen is verplicht.");
      return;
    }
    startTransition(async () => {
      const result = await unassignPersonnel(assignmentId, person.personnelId, unassignmentReason, person.lifecycleVersion ?? undefined);
      if (result.success) {
        toast.success(`${name} ontkoppeld.`);
        setShowUnassignment(false);
        setUnassignmentReason("");
        onChanged();
      } else {
        toast.error(result.message ?? "Verwijderen mislukt.");
      }
    });
  }

  const cardBg = isAssigned
    ? "#F0FDF4"
    : isEligible && !isUnavailable
      ? "#FAFAFA"
      : "#F8FAFC";

  const cardBorder = isAssigned ? "1px solid #BBF7D0" : "1px solid #E2E8F0";
  const dimmed     = !isAssigned && (!isEligible || isUnavailable || hasRegionMismatch);

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg px-3 py-2.5"
      style={{
        background: cardBg,
        border:     cardBorder,
        opacity:    dimmed ? 0.65 : 1,
      }}
    >
      {/* Top row: icon + name + action */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {isAssigned ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#16A34A" }} />
          ) : isEligible ? (
            <Users className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#64748B" }} />
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertCircle
                    className="h-4 w-4 mt-0.5 flex-shrink-0 cursor-default"
                    style={{ color: "#F59E0B" }}
                  />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px]">
                  <p className="font-medium mb-1">Ontbrekende vereisten:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" style={{ color: "#0F172A" }}>
              {name}
            </p>
            <p className="text-xs truncate" style={{ color: "#64748B" }}>
              {formatPersonnelRoleName(person.roleName) || "Geen rol"}
            </p>
          </div>
        </div>

        {/* Action button */}
        {canWrite && (
          isAssigned ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => setShowUnassignment(true)}
              className="h-7 px-2 text-xs flex-shrink-0"
              style={{ color: "#DC2626" }}
            >
              {isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <UserMinus className="h-3 w-3" />
              )}
              <span className="ml-1">Verwijderen</span>
            </Button>
          ) : isEligible ? (
            <Button
              size="sm"
              disabled={isPending}
              onClick={handleAssign}
              className="h-7 px-2 text-xs flex-shrink-0"
              style={{ background: "#081D3A", color: "#fff" }}
            >
              {isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <UserPlus className="h-3 w-3" />
              )}
              <span className="ml-1">Inplannen</span>
            </Button>
          ) : (
            <span className="text-xs flex-shrink-0 px-2" style={{ color: "#94A3B8" }}>
              Niet geschikt
            </span>
          )
        )}
      </div>

      {/* Bottom row: badges */}
      <div className="flex items-center gap-1.5 flex-wrap ml-6">
        <AvailabilityBadge status={availStatus} />
        <SectorBadge sectorName={person.sectorName} />
        <RegionBadge region={person.region} mismatch={hasRegionMismatch} />
        {hasRegionMismatch && (
          <span className="text-xs" style={{ color: "#92400E" }}>
            Regio komt niet overeen
          </span>
        )}
      </div>
      {showUnassignment && (
        <div className="ml-6 space-y-2 rounded-md border border-red-200 bg-white p-2">
          <Textarea
            value={unassignmentReason}
            onChange={(event) => setUnassignmentReason(event.target.value)}
            placeholder="Reden voor ontkoppelen"
            aria-label={`Reden voor ontkoppelen van ${name}`}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => { setShowUnassignment(false); setUnassignmentReason(""); }}
            >
              Annuleren
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={isPending || !unassignmentReason.trim()}
              onClick={handleUnassign}
            >
              Ontkoppelen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

interface PlanningPersonnelDrawerProps {
  assignmentId: string | null;
  onClose:      () => void;
  canWrite:     boolean;
}

export function PlanningPersonnelDrawer({
  assignmentId,
  onClose,
  canWrite,
}: PlanningPersonnelDrawerProps) {
  const [data,      setData]      = useState<PersonnelForAssignmentResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  async function load(id: string) {
    setLoading(true);
    try {
      const result = await getPersonnelForAssignment(id);
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!assignmentId) { setData(null); return; }
    void load(assignmentId);
  }, [assignmentId, loadCount]);

  function refresh() {
    setLoadCount((n) => n + 1);
  }

  const req       = data?.requirements;
  const personnel = data?.personnel ?? [];

  // Sort: assigned first, then eligible+available, then region-mismatch, then ineligible/unavailable
  const withFlags = personnel.map((p) => {
    const missing    = req ? checkEligibility(p, req) : [];
    const hasMismatch = req ? regionMismatch(p, req) : false;
    const isUnavail  =
      p.availabilityStatus === "ziek" ||
      p.availabilityStatus === "op_verlof" ||
      p.availabilityStatus === "niet_beschikbaar";
    return { p, missing, hasMismatch, isUnavail };
  });

  const assignedList   = withFlags.filter(({ p }) => p.linkId !== null);
  const eligibleList   = withFlags.filter(
    ({ p, missing, hasMismatch, isUnavail }) =>
      p.linkId === null && missing.length === 0 && !hasMismatch && !isUnavail,
  );
  const warningList    = withFlags.filter(
    ({ p, missing, hasMismatch, isUnavail }) =>
      p.linkId === null && missing.length === 0 && (hasMismatch || isUnavail),
  );
  const ineligibleList = withFlags.filter(
    ({ p, missing }) => p.linkId === null && missing.length > 0,
  );

  return (
    <Sheet open={assignmentId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-[440px] sm:max-w-[440px] overflow-y-auto flex flex-col"
      >
        <SheetHeader className="pb-4">
          <SheetTitle style={{ color: "#081D3A" }}>Personeel inplannen</SheetTitle>
          <SheetDescription>
            Selecteer welke medewerkers worden ingepland voor deze opdracht.
          </SheetDescription>
        </SheetHeader>

        {/* Requirements */}
        {req && (
          <div
            className="rounded-lg p-3 mb-4"
            style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}
          >
            <p className="text-xs font-semibold mb-2" style={{ color: "#64748B" }}>
              VEREISTEN
            </p>
            <RequirementsTags req={req} />
            {req.scheduledDate && (
              <p className="text-xs mt-2" style={{ color: "#94A3B8" }}>
                Gepland op {new Date(req.scheduledDate + "T00:00:00").toLocaleDateString("nl-NL", {
                  weekday: "long", day: "numeric", month: "long",
                })}
              </p>
            )}
          </div>
        )}

        {loading && !data ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#94A3B8" }} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4 min-h-0">

            {/* Assigned */}
            {assignedList.length > 0 && (
              <section>
                <p className="text-xs font-semibold mb-2" style={{ color: "#16A34A" }}>
                  INGEPLAND ({assignedList.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {assignedList.map(({ p, missing, hasMismatch }) => (
                    <PersonnelRow
                      key={p.personnelId}
                      person={p}
                      missing={missing}
                      hasRegionMismatch={hasMismatch}
                      assignmentId={assignmentId!}
                      canWrite={canWrite}
                      onChanged={refresh}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Eligible & available */}
            {eligibleList.length > 0 && (
              <section>
                <p className="text-xs font-semibold mb-2" style={{ color: "#16A34A" }}>
                  BESCHIKBAAR ({eligibleList.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {eligibleList.map(({ p, missing, hasMismatch }) => (
                    <PersonnelRow
                      key={p.personnelId}
                      person={p}
                      missing={missing}
                      hasRegionMismatch={hasMismatch}
                      assignmentId={assignmentId!}
                      canWrite={canWrite}
                      onChanged={refresh}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Eligible but warning (region mismatch or unavailable) */}
            {warningList.length > 0 && (
              <section>
                <p className="text-xs font-semibold mb-2" style={{ color: "#D97706" }}>
                  MET VOORBEHOUD ({warningList.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {warningList.map(({ p, missing, hasMismatch }) => (
                    <PersonnelRow
                      key={p.personnelId}
                      person={p}
                      missing={missing}
                      hasRegionMismatch={hasMismatch}
                      assignmentId={assignmentId!}
                      canWrite={canWrite}
                      onChanged={refresh}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Ineligible */}
            {ineligibleList.length > 0 && (
              <section>
                <p className="text-xs font-semibold mb-2" style={{ color: "#94A3B8" }}>
                  NIET GESCHIKT ({ineligibleList.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {ineligibleList.map(({ p, missing, hasMismatch }) => (
                    <PersonnelRow
                      key={p.personnelId}
                      person={p}
                      missing={missing}
                      hasRegionMismatch={hasMismatch}
                      assignmentId={assignmentId!}
                      canWrite={canWrite}
                      onChanged={refresh}
                    />
                  ))}
                </div>
              </section>
            )}

            {personnel.length === 0 && !loading && (
              <div className="flex-1 flex items-center justify-center py-12 text-center">
                <div>
                  <Users className="h-8 w-8 mx-auto mb-3" style={{ color: "#CBD5E1" }} />
                  <p className="text-sm" style={{ color: "#94A3B8" }}>
                    Geen actief personeel gevonden.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

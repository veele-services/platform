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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle2, UserPlus, UserMinus, AlertCircle, Loader2, Users } from "lucide-react";
import { assignPersonnel } from "@/app/actions/assignments";
import { unassignPersonnel, getPersonnelForAssignment } from "@/app/actions/planning";
import type {
  AssignmentRequirements,
  PersonnelEligibilityEntry,
  PersonnelForAssignmentResult,
} from "@/app/actions/planning";
import { toast } from "sonner";

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

// ─── Requirements summary ─────────────────────────────────────────────────────

function RequirementsTags({ req }: { req: AssignmentRequirements }) {
  const items = [
    ...req.requiredCertificates.map((c) => `Certificaat: ${c}`),
    ...req.requiredKnowledge.map((k) => `Kennis: ${k}`),
    ...req.requiredDiplomas.map((d) => `Diploma: ${d}`),
  ];
  if (req.requiredRoleIds.length > 0) items.unshift("Specifieke rol vereist");
  if (items.length === 0) return <span className="text-xs" style={{ color: "#94A3B8" }}>Geen specifieke vereisten</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
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

// ─── Personnel row ────────────────────────────────────────────────────────────

interface PersonnelRowProps {
  person:       PersonnelEligibilityEntry;
  missing:      string[];
  assignmentId: string;
  canWrite:     boolean;
  onChanged:    () => void;
}

function PersonnelRow({ person, missing, assignmentId, canWrite, onChanged }: PersonnelRowProps) {
  const [isPending, startTransition] = useTransition();
  const isAssigned  = person.linkId !== null;
  const isEligible  = missing.length === 0;
  const name        = `${person.firstName} ${person.lastName}`.trim();

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
    startTransition(async () => {
      const result = await unassignPersonnel(assignmentId, person.personnelId);
      if (result.success) {
        toast.success(`${name} verwijderd.`);
        onChanged();
      } else {
        toast.error(result.message ?? "Verwijderen mislukt.");
      }
    });
  }

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
      style={{
        background: isAssigned ? "#F0FDF4" : isEligible ? "#FAFAFA" : "#F8FAFC",
        border:     isAssigned ? "1px solid #BBF7D0" : "1px solid #E2E8F0",
        opacity:    !isAssigned && !isEligible ? 0.65 : 1,
      }}
    >
      {/* Left: status icon + name */}
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
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
                  {missing.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "#0F172A" }}>{name}</p>
          <p className="text-xs truncate" style={{ color: "#64748B" }}>
            {person.roleName ?? "Geen rol"}
            {person.region ? ` · ${person.region}` : ""}
          </p>
        </div>
      </div>

      {/* Right: action button */}
      {canWrite && (
        isAssigned ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={handleUnassign}
            className="h-7 px-2 text-xs flex-shrink-0"
            style={{ color: "#DC2626" }}
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />}
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
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
            <span className="ml-1">Inplannen</span>
          </Button>
        ) : (
          <span
            className="text-xs flex-shrink-0 px-2"
            style={{ color: "#94A3B8" }}
          >
            Niet geschikt
          </span>
        )
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
  const [data,       setData]       = useState<PersonnelForAssignmentResult | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [loadCount,  setLoadCount]  = useState(0);

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

  const req         = data?.requirements;
  const personnel   = data?.personnel ?? [];

  const assignedList   = personnel.filter((p) => p.linkId !== null);
  const unassignedList = personnel.filter((p) => p.linkId === null);

  const eligibleList   = unassignedList.filter((p) => req && checkEligibility(p, req).length === 0);
  const ineligibleList = unassignedList.filter((p) => req && checkEligibility(p, req).length > 0);

  return (
    <Sheet open={assignmentId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] overflow-y-auto flex flex-col">
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
              VEREISTEN (TAAKOMSCHRIJVINGEN)
            </p>
            <RequirementsTags req={req} />
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
                  {assignedList.map((p) => (
                    <PersonnelRow
                      key={p.personnelId}
                      person={p}
                      missing={[]}
                      assignmentId={assignmentId!}
                      canWrite={canWrite}
                      onChanged={refresh}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Eligible */}
            {eligibleList.length > 0 && (
              <section>
                <p className="text-xs font-semibold mb-2" style={{ color: "#64748B" }}>
                  BESCHIKBAAR ({eligibleList.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {eligibleList.map((p) => (
                    <PersonnelRow
                      key={p.personnelId}
                      person={p}
                      missing={[]}
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
                  {ineligibleList.map((p) => {
                    const missing = req ? checkEligibility(p, req) : [];
                    return (
                      <PersonnelRow
                        key={p.personnelId}
                        person={p}
                        missing={missing}
                        assignmentId={assignmentId!}
                        canWrite={canWrite}
                        onChanged={refresh}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {personnel.length === 0 && !loading && (
              <div className="flex-1 flex items-center justify-center py-12 text-center">
                <div>
                  <Users className="h-8 w-8 mx-auto mb-3" style={{ color: "#CBD5E1" }} />
                  <p className="text-sm" style={{ color: "#94A3B8" }}>Geen actief personeel gevonden.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

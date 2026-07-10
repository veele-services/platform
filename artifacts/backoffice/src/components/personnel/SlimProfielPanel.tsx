"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, MapPin, AlertCircle, CheckCircle2, ExternalLink, Building2, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAvailabilityWindows,
  type AvailabilityWindow,
} from "@/app/actions/availability";
import {
  getLinkedObjects,
  type PersonnelRow,
  type LinkedObject,
} from "@/app/actions/personnel";
import { formatPersonnelRoleName } from "@/lib/personnel-role-labels";
import {
  PERSONNEL_TYPE_LABELS,
  PERSONNEL_TYPE_COLORS,
  type PersonnelType,
} from "@/types/personnel";

const DAY_LABELS = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];

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

interface SlimProfielPanelProps {
  person:   PersonnelRow | null;
  onClose:  () => void;
}

function Initials({ firstName, lastName }: { firstName: string; lastName: string }) {
  const init = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center text-base font-bold"
      style={{
        width:           "52px",
        height:          "52px",
        backgroundColor: "#E0FAFB",
        color:           "#0A7E7A",
      }}
    >
      {init}
    </div>
  );
}

export function SlimProfielPanel({ person, onClose }: SlimProfielPanelProps) {
  const [windows,       setWindows]       = useState<AvailabilityWindow[]>([]);
  const [linkedObjects, setLinkedObjects] = useState<LinkedObject[]>([]);
  const [loading,       setLoading]       = useState(false);

  useEffect(() => {
    if (!person) { setWindows([]); setLinkedObjects([]); return; }
    setLoading(true);
    Promise.all([
      getAvailabilityWindows(person.id),
      getLinkedObjects(person.id),
    ]).then(([w, o]) => {
      setWindows(w);
      setLinkedObjects(o);
      setLoading(false);
    });
  }, [person?.id]);

  if (!person) return null;

  const typeLabel = person.personnelType
    ? PERSONNEL_TYPE_LABELS[person.personnelType as PersonnelType] ?? person.personnelType
    : null;
  const typeColor = person.personnelType
    ? PERSONNEL_TYPE_COLORS[person.personnelType as PersonnelType]
    : null;

  const allRegions = [
    ...(person.region ? [person.region] : []),
    ...(person.preferredRegions ?? []).filter((r) => r !== person.region),
  ];

  const windowsByDay = new Map(windows.map((w) => [w.dayOfWeek, w]));

  return (
    <aside
      className="flex flex-col h-full overflow-y-auto"
      style={{ width: "360px", borderLeft: "1px solid #E2E8F0", backgroundColor: "#FAFBFD" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 sticky top-0 z-10"
        style={{ backgroundColor: "#FAFBFD", borderBottom: "1px solid #E2E8F0" }}
      >
        <span className="text-sm font-semibold" style={{ color: "#081D3A" }}>Slim profiel</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 transition-colors hover:bg-slate-100"
          style={{ color: "#64748B" }}
          aria-label="Sluiten"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {/* Identity */}
        <div className="flex items-start gap-3">
          <Initials firstName={person.firstName} lastName={person.lastName} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-base leading-tight" style={{ color: "#081D3A" }}>
              {person.firstName} {person.lastName}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>{person.code}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {typeLabel && typeColor && (
                <span
                  className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: typeColor.bg, color: typeColor.color }}
                >
                  {typeLabel}
                </span>
              )}
              {person.roleName && (
                <span
                  className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: "#F0F4FF", color: "#3B5CE0" }}
                >
                  {formatPersonnelRoleName(person.roleName)}
                </span>
              )}
              {person.sectorName && (
                <span
                  className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: "#ECFDF5", color: "#047857" }}
                >
                  {person.sectorName}
                </span>
              )}
              {!person.isActive && (
                <span
                  className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: "#F1F5F9", color: "#64748B" }}
                >
                  Inactief
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Emergency + Regions */}
        <div className="veele-card !p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Route className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#94A3B8" }} />
            <span className="text-xs font-medium" style={{ color: "#64748B" }}>
              Standaard vervoer: {vehicleTypeLabel(person.vehicleType)}
            </span>
          </div>
          {person.emergencyAvailable && (
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#DC2626" }} />
              <span className="text-xs font-medium" style={{ color: "#DC2626" }}>
                Spoedsbeschikbaar
              </span>
            </div>
          )}
          {allRegions.length > 0 && (
            <div className="flex items-start gap-2">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: "#94A3B8" }} />
              <div className="flex flex-wrap gap-1">
                {allRegions.map((r, i) => (
                  <span
                    key={r}
                    className="text-xs rounded px-1.5 py-0.5"
                    style={{
                      backgroundColor: i === 0 ? "#E0FAFB" : "#F1F5F9",
                      color:           i === 0 ? "#0A7E7A" : "#64748B",
                    }}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Certificates */}
        {person.certificates.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#64748B" }}>
              Certificaten
            </p>
            <div className="flex flex-wrap gap-1">
              {person.certificates.map((c) => (
                <span
                  key={c}
                  className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: "#E0FAFB", color: "#0A7E7A" }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Weekly availability grid */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#64748B" }}>
            Wekelijkse beschikbaarheid
          </p>
          {loading ? (
            <p className="text-xs" style={{ color: "#94A3B8" }}>Laden…</p>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {/* Mon–Sun: day indices 1–6, 0 */}
              {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                const w = windowsByDay.get(day);
                return (
                  <div key={day} className="flex flex-col items-center gap-1">
                    <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>
                      {DAY_LABELS[day]}
                    </span>
                    <div
                      className="rounded flex items-center justify-center"
                      style={{
                        width:           "32px",
                        height:          "32px",
                        backgroundColor: w ? "#D1FAE5" : "#F1F5F9",
                      }}
                    >
                      {w ? (
                        <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#059669" }} />
                      ) : (
                        <span style={{ color: "#CBD5E1", fontSize: "16px", lineHeight: 1 }}>—</span>
                      )}
                    </div>
                    {w && (
                      <span className="text-center leading-tight" style={{ fontSize: "9px", color: "#64748B" }}>
                        {w.startTime}
                        <br />
                        {w.endTime}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Linked objects */}
        {!loading && linkedObjects.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#64748B" }}>
              Gekoppelde objecten
            </p>
            <div className="flex flex-col gap-1.5">
              {linkedObjects.slice(0, 3).map((obj) => (
                <Link
                  key={obj.objectId}
                  href={`/objects/${obj.objectId}`}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors hover:bg-slate-100"
                  style={{ border: "1px solid #E2E8F0", color: "#475569" }}
                >
                  <Building2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#94A3B8" }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" style={{ color: "#081D3A" }}>{obj.objectName}</p>
                    <p className="truncate" style={{ color: "#94A3B8" }}>{obj.customerName}</p>
                  </div>
                </Link>
              ))}
              {linkedObjects.length > 3 && (
                <p className="text-xs text-center" style={{ color: "#94A3B8" }}>
                  +{linkedObjects.length - 3} meer — zie volledig profiel
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto px-5 py-4 sticky bottom-0" style={{ backgroundColor: "#FAFBFD", borderTop: "1px solid #E2E8F0" }}>
        <Button asChild className="w-full" size="sm">
          <Link href={`/personnel/${person.id}`}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Bekijk volledig profiel
          </Link>
        </Button>
      </div>
    </aside>
  );
}

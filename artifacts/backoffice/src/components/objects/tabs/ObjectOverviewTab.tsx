import Link from "next/link";
import { MapPin, Tag, Calendar, Building2, Layers } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ObjectDetail } from "@/app/actions/objects";

interface Props {
  object: ObjectDetail;
}

function InfoRow({ icon: Icon, label, children }: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: "1px solid #F1F5F9" }}>
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#94A3B8" }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium mb-0.5" style={{ color: "#94A3B8" }}>{label}</p>
        <div className="text-sm" style={{ color: "#081D3A" }}>{children}</div>
      </div>
    </div>
  );
}

export function ObjectOverviewTab({ object: obj }: Props) {
  const fullAddress = [obj.address, obj.postalCode, obj.city].filter(Boolean).join(", ");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left column — location & identity */}
      <div className="veele-card">
        <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#64748B" }}>
          Locatie &amp; Identiteit
        </p>

        <InfoRow icon={Tag} label="Objectcode">
          <span className="font-mono text-xs rounded px-1.5 py-0.5 bg-slate-100" style={{ color: "#475569" }}>
            {obj.code}
          </span>
        </InfoRow>

        <InfoRow icon={MapPin} label="Adres">
          {fullAddress || <span style={{ color: "#94A3B8" }}>—</span>}
        </InfoRow>

        <InfoRow icon={Layers} label="Diensttype">
          {obj.serviceType || <span style={{ color: "#94A3B8" }}>—</span>}
        </InfoRow>

        <InfoRow icon={Building2} label="Klant">
          {obj.customerName ? (
            <Link
              href={`/customers/${obj.customerId}`}
              className="hover:underline"
              style={{ color: "#00B7B3" }}
            >
              {obj.customerName}
              {obj.customerCode && <span style={{ color: "#94A3B8" }}> ({obj.customerCode})</span>}
            </Link>
          ) : (
            <span style={{ color: "#94A3B8" }}>—</span>
          )}
        </InfoRow>

        <InfoRow icon={Calendar} label="Aangemaakt">
          {new Date(obj.createdAt).toLocaleDateString("nl-NL", {
            day: "numeric", month: "long", year: "numeric",
          })}
        </InfoRow>

        <div className="flex items-center gap-3 py-3">
          <div className="h-4 w-4" />
          <div className="flex-1">
            <p className="text-xs font-medium mb-0.5" style={{ color: "#94A3B8" }}>Status</p>
            <StatusBadge isActive={obj.isActive} />
          </div>
        </div>
      </div>

      {/* Right column — kpi + description */}
      <div className="flex flex-col gap-6">
        {/* Performance placeholder */}
        <div className="veele-card">
          <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#64748B" }}>
            Prestatie-indicatoren
          </p>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Opdrachten (YTD)", value: "—" },
              { label: "Open meldingen",  value: "—" },
              { label: "Laatste service", value: "—" },
              { label: "Contractstatus", value: "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg p-3" style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>{label}</p>
                <p className="text-lg font-semibold" style={{ color: "#081D3A" }}>{value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3" style={{ color: "#CBD5E1" }}>
            Live KPI&apos;s worden beschikbaar zodra opdrachten aan dit object worden gekoppeld.
          </p>
        </div>

        {/* Description */}
        {obj.description && (
          <div className="veele-card">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
              Omschrijving
            </p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: "#334155" }}>
              {obj.description}
            </p>
          </div>
        )}

        {/* Required qualifications */}
        {(obj.requiredRoles.length > 0 || obj.requiredCertificates.length > 0) && (
          <div className="veele-card">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
              Vereiste kwalificaties
            </p>
            {obj.requiredRoles.length > 0 && (
              <div className="mb-2">
                <p className="text-xs mb-1.5" style={{ color: "#94A3B8" }}>Functies</p>
                <div className="flex flex-wrap gap-1.5">
                  {obj.requiredRoles.map((r) => (
                    <span key={r} className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#EEF2FF", color: "#3730A3" }}>
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {obj.requiredCertificates.length > 0 && (
              <div>
                <p className="text-xs mb-1.5" style={{ color: "#94A3B8" }}>Certificaten</p>
                <div className="flex flex-wrap gap-1.5">
                  {obj.requiredCertificates.map((c) => (
                    <span key={c} className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#E0FAFB", color: "#0A7E7A" }}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

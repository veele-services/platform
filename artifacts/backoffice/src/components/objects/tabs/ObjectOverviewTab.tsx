import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  Layers,
  MapPin,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ObjectDetail, ObjectHistoryEntry, ObjectPerformance } from "@/app/actions/objects";

interface Props {
  object: ObjectDetail;
  performance: ObjectPerformance;
  history: ObjectHistoryEntry[];
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

function formatDate(value: string | null) {
  if (!value) return "Nog niet bekend";
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const styles = {
    neutral: { bg: "#F8FAFC", color: "#475569", icon: "#64748B" },
    success: { bg: "#ECFDF5", color: "#047857", icon: "#10B981" },
    warning: { bg: "#FFFBEB", color: "#B45309", icon: "#F59E0B" },
    danger: { bg: "#FEF2F2", color: "#B91C1C", icon: "#EF4444" },
  }[tone];

  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: styles.bg, border: "1px solid #E2E8F0" }}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: styles.icon }} />
        <p className="text-xs" style={{ color: "#64748B" }}>{label}</p>
      </div>
      <p className="mt-2 text-lg font-semibold" style={{ color: styles.color }}>{value}</p>
    </div>
  );
}

function HistoryBadge({ entry }: { entry: ObjectHistoryEntry }) {
  const tone: Record<ObjectHistoryEntry["type"], { bg: string; color: string }> = {
    assignment: { bg: "#E0FAFB", color: "#0A7E7A" },
    report: { bg: "#EEF2FF", color: "#3730A3" },
    ticket: { bg: "#FEF3C7", color: "#92400E" },
    media: { bg: "#F0FDFA", color: "#0F766E" },
    document: { bg: "#F1F5F9", color: "#475569" },
  };
  const style = tone[entry.type];

  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: style.bg, color: style.color }}>
      {entry.badge}
    </span>
  );
}

export function ObjectOverviewTab({ object: obj, performance, history }: Props) {
  const fullAddress = [obj.address, obj.postalCode, obj.city].filter(Boolean).join(", ");
  const requiredRoles = asStringArray(obj.requiredRoles);
  const requiredCertificates = asStringArray(obj.requiredCertificates);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            {fullAddress || <span style={{ color: "#94A3B8" }}>-</span>}
          </InfoRow>

          <InfoRow icon={Layers} label="Diensttype">
            {obj.serviceType || <span style={{ color: "#94A3B8" }}>-</span>}
          </InfoRow>

          <InfoRow icon={Building2} label="Klant">
            {obj.customerName ? (
              <Link href={`/customers/${obj.customerId}`} className="hover:underline" style={{ color: "#00B7B3" }}>
                {obj.customerName}
                {obj.customerCode && <span style={{ color: "#94A3B8" }}> ({obj.customerCode})</span>}
              </Link>
            ) : (
              <span style={{ color: "#94A3B8" }}>-</span>
            )}
          </InfoRow>

          <InfoRow icon={Calendar} label="Aangemaakt">
            {new Date(obj.createdAt).toLocaleDateString("nl-NL", {
              day: "numeric",
              month: "long",
              year: "numeric",
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

        <div className="flex flex-col gap-6">
          <div className="veele-card">
            <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#64748B" }}>
              Objectperformance
            </p>
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Opdrachten" value={performance.totalAssignments} icon={ClipboardList} />
              <StatCard
                label="Afronding"
                value={`${performance.completionRate}%`}
                icon={TrendingUp}
                tone={performance.completionRate >= 80 ? "success" : "warning"}
              />
              <StatCard
                label="Niet afgerond"
                value={performance.notCompletedAssignments}
                icon={AlertTriangle}
                tone={performance.notCompletedAssignments > 0 ? "danger" : "success"}
              />
              <StatCard
                label="Open acties"
                value={performance.openActions}
                icon={CheckCircle2}
                tone={performance.openActions > 0 ? "warning" : "success"}
              />
              <StatCard label="Media" value={performance.mediaItems} icon={Camera} />
              <StatCard label="Vast team" value={performance.fixedPersonnel} icon={Users} />
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 text-xs" style={{ color: "#64748B" }}>
              <span>Laatste service: <strong style={{ color: "#081D3A" }}>{formatDate(performance.lastServiceDate)}</strong></span>
              <span>Volgende service: <strong style={{ color: "#081D3A" }}>{formatDate(performance.nextServiceDate)}</strong></span>
              <span>Rapporten in controle: <strong style={{ color: "#081D3A" }}>{performance.reportsSubmitted}</strong></span>
              <span>Open tickets: <strong style={{ color: "#081D3A" }}>{performance.openTickets}</strong></span>
            </div>
          </div>

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

          {(requiredRoles.length > 0 || requiredCertificates.length > 0) && (
            <div className="veele-card">
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
                Vereiste kwalificaties
              </p>
              {requiredRoles.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs mb-1.5" style={{ color: "#94A3B8" }}>Functies</p>
                  <div className="flex flex-wrap gap-1.5">
                    {requiredRoles.map((role) => (
                      <span key={role} className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#EEF2FF", color: "#3730A3" }}>
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {requiredCertificates.length > 0 && (
                <div>
                  <p className="text-xs mb-1.5" style={{ color: "#94A3B8" }}>Certificaten</p>
                  <div className="flex flex-wrap gap-1.5">
                    {requiredCertificates.map((cert) => (
                      <span key={cert} className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#E0FAFB", color: "#0A7E7A" }}>
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="veele-card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
              Objecthistorie
            </p>
            <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>
              Opdrachten, rapportages, klanttickets, documenten en media rond dit object.
            </p>
          </div>
          <FileText className="h-5 w-5" style={{ color: "#94A3B8" }} />
        </div>

        {history.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center" style={{ color: "#64748B" }}>
            Nog geen historie opgebouwd voor dit object.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "#F1F5F9" }}>
            {history.slice(0, 12).map((entry) => {
              const content = (
                <div className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <HistoryBadge entry={entry} />
                      <span className="text-xs" style={{ color: "#94A3B8" }}>
                        {formatDate(entry.occurredAt)}
                      </span>
                      {entry.status && (
                        <span className="text-xs" style={{ color: "#64748B" }}>
                          {entry.status}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate" style={{ color: "#081D3A" }}>
                      {entry.title}
                    </p>
                    {entry.description && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: "#64748B" }}>
                        {entry.description}
                      </p>
                    )}
                  </div>
                </div>
              );

              return entry.href ? (
                <Link key={entry.id} href={entry.href} className="block hover:bg-slate-50/70 transition-colors px-1">
                  {content}
                </Link>
              ) : (
                <div key={entry.id} className="px-1">
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

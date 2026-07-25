import {
  Building2,
  Globe,
  TrendingUp,
  Package,
  ClipboardList,
  FileText,
  CreditCard,
  Clock,
} from "lucide-react";
import { CustomerStatusBadge } from "./CustomerStatusBadge";
import type { CustomerDetail, CustomerKpis } from "@/app/actions/customers";

function fmt(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

interface KpiCardProps {
  icon:   React.ReactNode;
  label:  string;
  value:  React.ReactNode;
  sub?:   string;
}

function KpiCard({ icon, label, value, sub }: KpiCardProps) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl px-4 py-3"
      style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#64748B" }}>
        <span style={{ color: "var(--color-primary)" }}>{icon}</span>
        {label}
      </div>
      <div className="text-lg font-bold font-heading" style={{ color: "var(--color-foreground)" }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs" style={{ color: "#94A3B8" }}>{sub}</div>
      )}
    </div>
  );
}

interface Props {
  customer: CustomerDetail;
  kpis:     CustomerKpis;
}

export function CustomerProfileHeader({ customer, kpis }: Props) {
  return (
    <div
      className="rounded-2xl p-6 mb-6"
      style={{ background: "linear-gradient(135deg, #F8FAFC 0%, #E0FAFB 100%)", border: "1px solid #E2E8F0" }}
    >
      {/* Hero row */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-4">
          {/* Avatar / monogram */}
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-2xl w-14 h-14 text-xl font-bold font-heading"
            style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
          >
            {customer.name.charAt(0).toUpperCase()}
          </div>

          <div>
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <h1 className="font-heading text-2xl font-bold" style={{ color: "var(--color-foreground)" }}>
                {customer.name}
              </h1>
              {customer.code && (
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ background: "#fff", color: "#64748B", border: "1px solid #E2E8F0" }}
                >
                  {customer.code}
                </span>
              )}
              <CustomerStatusBadge status={customer.status} />
            </div>

            <div className="flex items-center flex-wrap gap-3 text-sm" style={{ color: "#64748B" }}>
              {customer.sectorName && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {customer.sectorName}
                </span>
              )}
              {customer.customerTypeName && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE" }}
                >
                  {customer.customerTypeName}
                </span>
              )}
              {customer.website && (
                <a
                  href={customer.website.startsWith("http") ? customer.website : `https://${customer.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:underline"
                  style={{ color: "var(--color-primary)" }}
                >
                  <Globe className="h-3.5 w-3.5" />
                  {customer.website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Omzet (mnd)"
          value={fmt(kpis.monthlyRevenue)}
        />
        <KpiCard
          icon={<Package className="h-3.5 w-3.5" />}
          label="Actieve objecten"
          value={kpis.activeObjects}
        />
        <KpiCard
          icon={<ClipboardList className="h-3.5 w-3.5" />}
          label="Open opdrachten"
          value={kpis.openAssignments}
        />
        <KpiCard
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Open facturen"
          value={kpis.openInvoices}
        />
        <KpiCard
          icon={<CreditCard className="h-3.5 w-3.5" />}
          label="Openstaand saldo"
          value={fmt(kpis.outstandingBalance)}
        />
        <KpiCard
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Laatste activiteit"
          value={fmtDate(kpis.lastActivityDate)}
        />
      </div>
    </div>
  );
}

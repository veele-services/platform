import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  Tag,
  Calendar,
} from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { StatusBadge } from "@/components/ui/status-badge";
import { CustomerDetailActions } from "@/components/customers/CustomerDetailActions";
import { getCustomer, listSectors } from "@/app/actions/customers";
import { listObjectsForCustomer } from "@/app/actions/objects";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const customer = await getCustomer(id);
  return { title: customer?.name ?? "Customer" };
}

export default async function CustomerDetailPage({ params }: Props) {
  const canRead = await hasPermission("customers", "read");
  if (!canRead) return <ForbiddenPage resource="customers" action="read" />;

  const { id }   = await params;
  const canWrite = await hasPermission("customers", "write");

  const [customer, sectors, objects] = await Promise.all([
    getCustomer(id),
    listSectors(),
    listObjectsForCustomer(id),
  ]);

  if (!customer) notFound();

  // Strip notes from data when user is not allowed to see them
  const safeCustomer = canWrite ? customer : { ...customer, notes: null };

  return (
    <div className="p-8 max-w-5xl">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-start gap-4">
          <Link
            href="/customers"
            className="mt-1 flex items-center gap-1 text-sm transition-colors hover:underline"
            style={{ color: "#64748B" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Customers
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1
                className="font-heading text-2xl font-bold"
                style={{ color: "#081D3A" }}
              >
                {customer.name}
              </h1>
              {customer.code && (
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ background: "#F1F5F9", color: "#64748B" }}
                >
                  {customer.code}
                </span>
              )}
              <StatusBadge isActive={customer.isActive} />
            </div>
            {customer.sectorName && (
              <p className="mt-0.5 text-sm" style={{ color: "#64748B" }}>
                {customer.sectorName}
              </p>
            )}
          </div>
        </div>

        {canWrite && (
          <CustomerDetailActions
            customer={safeCustomer}
            sectors={sectors}
            canWriteNotes={canWrite}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── Left column (main info) ──────────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Contact */}
          <div className="veele-card">
            <h2
              className="font-heading text-sm font-semibold mb-4"
              style={{ color: "#081D3A" }}
            >
              Contact
            </h2>
            <dl className="space-y-3">
              {customer.contactName && (
                <InfoRow icon={<Tag className="h-4 w-4" />} label="Contact person" value={customer.contactName} />
              )}
              {customer.contactEmail && (
                <InfoRow
                  icon={<Mail className="h-4 w-4" />}
                  label="Email"
                  value={
                    <a
                      href={`mailto:${customer.contactEmail}`}
                      className="hover:underline"
                      style={{ color: "#00B7B3" }}
                    >
                      {customer.contactEmail}
                    </a>
                  }
                />
              )}
              {customer.contactPhone && (
                <InfoRow
                  icon={<Phone className="h-4 w-4" />}
                  label="Phone"
                  value={
                    <a
                      href={`tel:${customer.contactPhone}`}
                      className="hover:underline"
                      style={{ color: "#00B7B3" }}
                    >
                      {customer.contactPhone}
                    </a>
                  }
                />
              )}
              {!customer.contactName && !customer.contactEmail && !customer.contactPhone && (
                <p className="text-sm" style={{ color: "#94A3B8" }}>No contact details added yet.</p>
              )}
            </dl>
          </div>

          {/* Address */}
          <div className="veele-card">
            <h2
              className="font-heading text-sm font-semibold mb-4"
              style={{ color: "#081D3A" }}
            >
              Address
            </h2>
            {customer.address || customer.city || customer.postalCode ? (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "#94A3B8" }} />
                <div className="text-sm" style={{ color: "#64748B" }}>
                  {customer.address && <p>{customer.address}</p>}
                  {(customer.postalCode || customer.city) && (
                    <p>
                      {[customer.postalCode, customer.city].filter(Boolean).join("  ")}
                    </p>
                  )}
                  <p>{customer.country}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "#94A3B8" }}>No address added yet.</p>
            )}
          </div>

          {/* Internal Notes — management only */}
          {canWrite && (
            <div className="veele-card">
              <h2
                className="font-heading text-sm font-semibold mb-1"
                style={{ color: "#081D3A" }}
              >
                Internal Notes
              </h2>
              <p className="text-xs mb-3" style={{ color: "#94A3B8" }}>
                Only visible to management
              </p>
              {customer.notes ? (
                <p className="text-sm whitespace-pre-wrap" style={{ color: "#475569" }}>
                  {customer.notes}
                </p>
              ) : (
                <p className="text-sm" style={{ color: "#94A3B8" }}>No internal notes.</p>
              )}
            </div>
          )}
        </div>

        {/* ── Right column (metadata) ──────────────────── */}
        <div className="flex flex-col gap-5">
          <div className="veele-card">
            <h2
              className="font-heading text-sm font-semibold mb-4"
              style={{ color: "#081D3A" }}
            >
              Details
            </h2>
            <dl className="space-y-3">
              <InfoRow
                icon={<Tag className="h-4 w-4" />}
                label="Code"
                value={customer.code ?? "—"}
              />
              <InfoRow
                icon={<Building2 className="h-4 w-4" />}
                label="Sector"
                value={customer.sectorName ?? "—"}
              />
              <InfoRow
                icon={<Calendar className="h-4 w-4" />}
                label="Created"
                value={new Date(customer.createdAt).toLocaleDateString("en-NL", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              />
            </dl>
          </div>
        </div>
      </div>

      {/* ── Objects sub-table ────────────────────────── */}
      <div className="mt-5">
        <div className="veele-card overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 py-4">
            <h2
              className="font-heading text-sm font-semibold"
              style={{ color: "#081D3A" }}
            >
              Objects
              <span
                className="ml-2 text-xs font-normal"
                style={{ color: "#94A3B8" }}
              >
                ({objects.length})
              </span>
            </h2>
            <Link
              href={`/objects?customerId=${customer.id}`}
              className="text-xs font-medium hover:underline"
              style={{ color: "#00B7B3" }}
            >
              View all objects →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderTop: "1px solid #E2E8F0", borderBottom: "1px solid #E2E8F0" }}>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Name</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Code</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Sector</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>City</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {objects.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm" style={{ color: "#94A3B8" }}>
                      No objects linked to this customer yet.
                    </td>
                  </tr>
                ) : (
                  objects.map((obj, i) => (
                    <tr
                      key={obj.id}
                      className="transition-colors hover:bg-slate-50/60"
                      style={{ borderBottom: i < objects.length - 1 ? "1px solid #F1F5F9" : undefined }}
                    >
                      <td className="px-5 py-3 text-sm font-medium" style={{ color: "#081D3A" }}>{obj.name}</td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>{obj.code ?? "—"}</td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>{obj.sectorName ?? "—"}</td>
                      <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>{obj.city ?? "—"}</td>
                      <td className="px-5 py-3"><StatusBadge isActive={obj.isActive} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex-shrink-0" style={{ color: "#94A3B8" }}>
        {icon}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs" style={{ color: "#94A3B8" }}>{label}</span>
        <span className="text-sm" style={{ color: "#475569" }}>{value}</span>
      </div>
    </div>
  );
}

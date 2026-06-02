import {
  Tag,
  Mail,
  Phone,
  MapPin,
  Building2,
  Globe,
  FileText,
  Hash,
  Smartphone,
  Calendar,
  User,
} from "lucide-react";
import type { CustomerDetail } from "@/app/actions/customers";

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
        <span className="text-sm break-words" style={{ color: "#475569" }}>{value}</span>
      </div>
    </div>
  );
}

interface Props {
  customer: CustomerDetail;
  canWrite: boolean;
}

export function CustomerOverviewTab({ customer, canWrite }: Props) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Contact */}
      <div className="veele-card">
        <h2 className="font-heading text-sm font-semibold mb-4" style={{ color: "#081D3A" }}>
          Contactgegevens
        </h2>
        <dl className="space-y-3">
          {customer.contactName && (
            <InfoRow icon={<Tag className="h-4 w-4" />} label="Contactpersoon" value={customer.contactName} />
          )}
          {customer.contactEmail && (
            <InfoRow
              icon={<Mail className="h-4 w-4" />}
              label="E-mail"
              value={
                <a href={`mailto:${customer.contactEmail}`} className="hover:underline" style={{ color: "#00B7B3" }}>
                  {customer.contactEmail}
                </a>
              }
            />
          )}
          {customer.contactPhone && (
            <InfoRow
              icon={<Phone className="h-4 w-4" />}
              label="Telefoon"
              value={
                <a href={`tel:${customer.contactPhone}`} className="hover:underline" style={{ color: "#00B7B3" }}>
                  {customer.contactPhone}
                </a>
              }
            />
          )}
          {customer.mobile && (
            <InfoRow
              icon={<Smartphone className="h-4 w-4" />}
              label="Mobiel"
              value={
                <a href={`tel:${customer.mobile}`} className="hover:underline" style={{ color: "#00B7B3" }}>
                  {customer.mobile}
                </a>
              }
            />
          )}
          {customer.website && (
            <InfoRow
              icon={<Globe className="h-4 w-4" />}
              label="Website"
              value={
                <a
                  href={customer.website.startsWith("http") ? customer.website : `https://${customer.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  style={{ color: "#00B7B3" }}
                >
                  {customer.website}
                </a>
              }
            />
          )}
          {!customer.contactName && !customer.contactEmail && !customer.contactPhone && !customer.mobile && (
            <p className="text-sm" style={{ color: "#94A3B8" }}>Nog geen contactgegevens toegevoegd.</p>
          )}
        </dl>
      </div>

      {/* Address */}
      <div className="veele-card">
        <h2 className="font-heading text-sm font-semibold mb-4" style={{ color: "#081D3A" }}>
          Adres
        </h2>
        {customer.address || customer.city || customer.postalCode ? (
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "#94A3B8" }} />
            <div className="text-sm" style={{ color: "#64748B" }}>
              {customer.address && <p>{customer.address}</p>}
              {(customer.postalCode || customer.city) && (
                <p>{[customer.postalCode, customer.city].filter(Boolean).join("  ")}</p>
              )}
              <p>{customer.country}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "#94A3B8" }}>Nog geen adres toegevoegd.</p>
        )}
      </div>

      {/* Bedrijfsgegevens */}
      {(customer.legalEntity || customer.vatNumber || customer.chamberOfCommerceNumber) && (
        <div className="veele-card">
          <h2 className="font-heading text-sm font-semibold mb-4" style={{ color: "#081D3A" }}>
            Bedrijfsgegevens
          </h2>
          <dl className="space-y-3">
            {customer.legalEntity && (
              <InfoRow icon={<Building2 className="h-4 w-4" />} label="Rechtsvorm" value={customer.legalEntity} />
            )}
            {customer.vatNumber && (
              <InfoRow icon={<FileText className="h-4 w-4" />} label="BTW-nummer" value={customer.vatNumber} />
            )}
            {customer.chamberOfCommerceNumber && (
              <InfoRow icon={<Hash className="h-4 w-4" />} label="KVK-nummer" value={customer.chamberOfCommerceNumber} />
            )}
          </dl>
        </div>
      )}

      {/* Metadata */}
      <div className="veele-card">
        <h2 className="font-heading text-sm font-semibold mb-4" style={{ color: "#081D3A" }}>
          Gegevens
        </h2>
        <dl className="space-y-3">
          <InfoRow icon={<Tag className="h-4 w-4" />} label="Code" value={customer.code ?? "—"} />
          <InfoRow icon={<Building2 className="h-4 w-4" />} label="Sector" value={customer.sectorName ?? "—"} />
          {customer.customerTypeName && (
            <InfoRow icon={<Tag className="h-4 w-4" />} label="Klanttype" value={customer.customerTypeName} />
          )}
          {customer.accountManagerName && (
            <InfoRow icon={<User className="h-4 w-4" />} label="Accountmanager" value={customer.accountManagerName} />
          )}
          <InfoRow
            icon={<Calendar className="h-4 w-4" />}
            label="Aangemaakt"
            value={new Date(customer.createdAt).toLocaleDateString("nl-NL", {
              day: "2-digit", month: "short", year: "numeric",
            })}
          />
        </dl>
      </div>

      {/* Internal notes (management only) */}
      {canWrite && customer.notes && (
        <div className="veele-card lg:col-span-2">
          <h2 className="font-heading text-sm font-semibold mb-1" style={{ color: "#081D3A" }}>
            Interne notities
          </h2>
          <p className="text-xs mb-3" style={{ color: "#94A3B8" }}>Alleen zichtbaar voor management</p>
          <p className="text-sm whitespace-pre-wrap" style={{ color: "#475569" }}>{customer.notes}</p>
        </div>
      )}
    </div>
  );
}

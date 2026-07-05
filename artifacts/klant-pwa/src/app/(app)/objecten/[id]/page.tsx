export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, KeyRound, MapPin, MessageSquare, Phone, ShieldCheck, UserRound } from "lucide-react";
import { getCustomerObjectSectors, getMyObject } from "@/actions/objects";
import { CustomerObjectForm } from "@/components/CustomerObjectForm";
import { PageShell } from "@/components/PageShell";

type Props = { params: Promise<{ id: string }> };

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <dt className="text-[11px] font-black uppercase tracking-[0.05em]" style={{ color: "var(--color-secondary)" }}>
        {label}
      </dt>
      <dd className="mt-1 text-sm font-bold leading-5" style={{ color: value ? "var(--color-primary)" : "var(--color-muted-fg)" }}>
        {value || "Niet ingevuld"}
      </dd>
    </div>
  );
}

function supportHrefForObject(code: string, name: string): string {
  return `/meldingen/tickets?${new URLSearchParams({
    context: "object",
    department: "service",
    subject: `Vraag over object ${code} - ${name}`,
    body: `Object: ${code} - ${name}\n\nVraag:`,
  }).toString()}`;
}

export default async function ObjectDetailPage({ params }: Props) {
  const { id } = await params;
  const [object, sectors] = await Promise.all([
    getMyObject(id),
    getCustomerObjectSectors(),
  ]);

  if (!object) notFound();

  const addressLine = [object.address, object.postalCode, object.city].filter(Boolean).join(" ");
  const supportHref = supportHrefForObject(object.code, object.name);

  return (
    <PageShell
      title={object.name}
      subtitle={`${object.code} - objectgegevens en instructies`}
      actions={
        <>
          <Link
            href={supportHref}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#E8FBFA] px-4 py-2.5 text-sm font-black text-[#087C79]"
          >
            <MessageSquare size={16} />
            Vraag over object
          </Link>
          <Link
            href="/objecten"
            className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-black"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          >
            <ArrowLeft size={16} />
            Objecten
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 md:hidden">
          <Link
            href="/objecten"
            className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-black shadow-sm"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          >
            <ArrowLeft size={16} />
            Terug naar objecten
          </Link>
          <Link
            href={supportHref}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#E8FBFA] px-4 py-2.5 text-sm font-black text-[#087C79] shadow-sm"
          >
            <MessageSquare size={16} />
            Supportvraag
          </Link>
        </div>

        <section className="rounded-[26px] border bg-white p-5 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA]" style={{ color: "var(--color-accent)" }}>
                <Building2 size={22} />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-xs font-black" style={{ color: "var(--color-accent)" }}>
                  {object.code}
                </p>
                <h1 className="mt-0.5 truncate text-2xl font-black" style={{ color: "var(--color-primary)" }}>
                  {object.name}
                </h1>
                {addressLine ? (
                  <p className="mt-2 flex items-start gap-2 text-sm font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
                    <MapPin size={15} className="mt-0.5 shrink-0" />
                    {addressLine}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[#E8FBFA] px-3 py-1.5 text-xs font-black text-[#087C79]">
                {object.isActive ? "Actief" : "Inactief"}
              </span>
              {object.sectorName ? (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
                  {object.sectorName}
                </span>
              ) : null}
            </div>
          </div>

          <dl className="mt-5 grid gap-3 md:grid-cols-4">
            <DetailItem label="Contactpersoon" value={object.contactName} />
            <DetailItem label="Telefoon" value={object.contactPhone} />
            <DetailItem label="Dienstverlening" value={object.serviceType} />
            <DetailItem label="E-mail" value={object.contactEmail} />
          </dl>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border px-4 py-3" style={{ borderColor: object.accessInfo ? "#99F6E4" : "var(--color-border)" }}>
              <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.05em]" style={{ color: "var(--color-secondary)" }}>
                <MapPin size={14} />
                Toegang
              </div>
              <p className="line-clamp-3 text-sm font-semibold leading-5" style={{ color: object.accessInfo ? "var(--color-primary)" : "var(--color-muted-fg)" }}>
                {object.accessInfo || "Niet ingevuld"}
              </p>
            </div>
            <div className="rounded-2xl border px-4 py-3" style={{ borderColor: object.keyInfo ? "#99F6E4" : "var(--color-border)" }}>
              <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.05em]" style={{ color: "var(--color-secondary)" }}>
                <KeyRound size={14} />
                Sleutels
              </div>
              <p className="line-clamp-3 text-sm font-semibold leading-5" style={{ color: object.keyInfo ? "var(--color-primary)" : "var(--color-muted-fg)" }}>
                {object.keyInfo || "Niet ingevuld"}
              </p>
            </div>
            <div className="rounded-2xl border px-4 py-3" style={{ borderColor: object.alarmInfo ? "#99F6E4" : "var(--color-border)" }}>
              <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.05em]" style={{ color: "var(--color-secondary)" }}>
                <ShieldCheck size={14} />
                Alarm
              </div>
              <p className="line-clamp-3 text-sm font-semibold leading-5" style={{ color: object.alarmInfo ? "var(--color-primary)" : "var(--color-muted-fg)" }}>
                {object.alarmInfo || "Niet ingevuld"}
              </p>
            </div>
          </div>

          {object.contacts.length > 0 ? (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black" style={{ color: "var(--color-primary)" }}>
                <UserRound size={16} />
                Gekoppelde contactpersonen
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {object.contacts.map((contact) => (
                  <div key={contact.id} className="rounded-xl bg-white px-3 py-2.5">
                    <p className="text-sm font-black" style={{ color: "var(--color-primary)" }}>
                      {contact.firstName} {contact.lastName}
                      {contact.isPrimary ? <span className="ml-2 text-[10px] font-black text-[#087C79]">Primair</span> : null}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>
                      {contact.function ? <span>{contact.function}</span> : null}
                      {contact.phone ? <span className="inline-flex items-center gap-1"><Phone size={12} /> {contact.phone}</span> : null}
                      {contact.email ? <span>{contact.email}</span> : null}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <CustomerObjectForm mode="edit" object={object} sectors={sectors} />
      </div>
    </PageShell>
  );
}

export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  KeyRound,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { getMyObjects } from "@/actions/objects";
import { PageShell } from "@/components/PageShell";

export default async function ObjectenPage() {
  const objects = await getMyObjects();

  return (
    <PageShell
      title="Mijn objecten"
      subtitle="Uw locaties, contactpersonen en toegangsinformatie."
      actions={
        <Link
          href="/objecten/nieuw"
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black text-white"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          <Plus size={16} />
          Object toevoegen
        </Link>
      }
    >
      <div className="md:hidden">
        <Link
          href="/objecten/nieuw"
          className="mb-3 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          <Plus size={17} />
          Object toevoegen
        </Link>
      </div>

      {objects.length === 0 ? (
        <div className="rounded-[24px] bg-white p-8 text-center shadow-sm">
          <MapPin
            size={34}
            className="mx-auto mb-3"
            style={{ color: "var(--color-accent)" }}
          />
          <p
            className="text-base font-black"
            style={{ color: "var(--color-primary)" }}
          >
            Nog geen objecten
          </p>
          <p
            className="mx-auto mt-1 max-w-md text-sm font-semibold leading-6"
            style={{ color: "var(--color-secondary)" }}
          >
            Voeg uw eerste locatie toe met adresgegevens, contactpersoon,
            toegangsinformatie en vaste instructies.
          </p>
          <Link
            href="/objecten/nieuw"
            className="mt-5 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            <Plus size={17} />
            Eerste object toevoegen
          </Link>
        </div>
      ) : (
        <>
          <div
            className="hidden overflow-x-auto rounded-[22px] border bg-white shadow-sm md:block"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div
              className="grid grid-cols-[minmax(16rem,1.4fr)_1fr_1fr_10rem_5rem] gap-4 border-b px-5 py-3 text-xs font-black uppercase tracking-[0.08em]"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-secondary)",
              }}
            >
              <span>Object</span>
              <span>Adres</span>
              <span>Contact</span>
              <span>Dienst</span>
              <span className="text-right">Status</span>
            </div>
            <div
              className="divide-y"
              style={{ borderColor: "var(--color-border)" }}
            >
              {objects.map((obj) => (
                <Link
                  key={obj.id}
                  href={`/objecten/${obj.id}`}
                  className="grid grid-cols-[minmax(16rem,1.4fr)_1fr_1fr_10rem_5rem] items-center gap-4 px-5 py-4 transition hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span
                      className="block truncate text-sm font-black"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {obj.name}
                    </span>
                    <span
                      className="mt-0.5 block font-mono text-xs font-black"
                      style={{ color: "var(--color-muted-fg)" }}
                    >
                      {obj.code}
                    </span>
                    {obj.sectorName ? (
                      <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
                        {obj.sectorName}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="min-w-0 text-sm font-semibold leading-5"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {[obj.address, obj.postalCode, obj.city]
                      .filter(Boolean)
                      .join(" ") || "Niet ingevuld"}
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block truncate text-sm font-bold"
                      style={{
                        color: obj.contactName
                          ? "var(--color-primary)"
                          : "var(--color-muted-fg)",
                      }}
                    >
                      {obj.contactName ?? "Geen contactpersoon"}
                    </span>
                    <span
                      className="mt-0.5 block truncate text-xs font-semibold"
                      style={{ color: "var(--color-secondary)" }}
                    >
                      {obj.contactPhone ?? "Geen telefoonnummer"}
                    </span>
                  </span>
                  <span
                    className="truncate text-sm font-semibold"
                    style={{
                      color: obj.serviceType
                        ? "var(--color-primary)"
                        : "var(--color-muted-fg)",
                    }}
                  >
                    {obj.serviceType ?? "Niet ingesteld"}
                  </span>
                  <span className="text-right">
                    <span className="rounded-full bg-[#E8FBFA] px-2.5 py-1 text-[11px] font-black text-[#087C79]">
                      {obj.isActive ? "Actief" : "Inactief"}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {objects.map((obj) => (
              <Link
                key={obj.id}
                href={`/objecten/${obj.id}`}
                className="group rounded-[24px] border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: "rgba(0,183,179,0.1)" }}
                  >
                    <Building2
                      size={18}
                      style={{ color: "var(--color-accent)" }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="truncate font-black"
                          style={{ color: "var(--color-primary)" }}
                        >
                          {obj.name}
                        </p>
                        <p
                          className="mt-0.5 font-mono text-xs font-black"
                          style={{ color: "var(--color-secondary)" }}
                        >
                          {obj.code}
                        </p>
                      </div>
                      <span className="rounded-full bg-[#E8FBFA] px-2.5 py-1 text-[10px] font-black text-[#087C79]">
                        {obj.isActive ? "Actief" : "Inactief"}
                      </span>
                    </div>
                    {(obj.address || obj.city) && (
                      <p
                        className="mt-3 flex items-start gap-2 text-sm font-semibold leading-5"
                        style={{ color: "var(--color-secondary)" }}
                      >
                        <MapPin size={15} className="mt-0.5 shrink-0" />
                        {[obj.address, obj.postalCode, obj.city]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {obj.sectorName ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
                          {obj.sectorName}
                        </span>
                      ) : null}
                      {obj.serviceType ? (
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
                          {obj.serviceType}
                        </span>
                      ) : null}
                      {obj.accessInfo || obj.keyInfo || obj.alarmInfo ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">
                          <KeyRound size={12} />
                          Toegang ingesteld
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="mt-4 grid gap-2 text-xs font-bold md:grid-cols-2"
                      style={{ color: "var(--color-secondary)" }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <UserRound size={14} className="shrink-0" />
                        <span className="truncate">
                          {obj.contactName ?? "Geen contactpersoon"}
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <Phone size={14} className="shrink-0" />
                        <span className="truncate">
                          {obj.contactPhone ?? "Geen telefoonnummer"}
                        </span>
                      </span>
                    </div>
                    <div
                      className="mt-4 flex items-center justify-between border-t pt-3"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-black"
                        style={{ color: "var(--color-accent)" }}
                      >
                        <ShieldCheck size={14} />
                        Gegevens beheren
                      </span>
                      <ArrowRight
                        size={17}
                        className="transition group-hover:translate-x-0.5"
                        style={{ color: "var(--color-primary)" }}
                      />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}

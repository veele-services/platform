import { getMyPersonnel } from "@/actions/personnel";
import { signOut } from "@/actions/auth";
import { Mail, MapPin, Award, Shield, KeyRound } from "lucide-react";
import { PhoneEditForm } from "./PhoneEditForm";
import { PasswordChangeForm } from "./PasswordChangeForm";
import type { LucideIcon } from "lucide-react";

type ReadOnlyField = { Icon: LucideIcon; label: string; value: string };

export default async function ProfielPage() {
  const profile = await getMyPersonnel();

  if (!profile) {
    return (
      <div className="p-4">
        <p className="py-16 text-center text-sm" style={{ color: "var(--color-secondary)" }}>
          Geen profielgegevens gevonden
        </p>
      </div>
    );
  }

  const readOnlyFields: ReadOnlyField[] = (
    [
      { Icon: Mail,   label: "E-mail", value: profile.email },
      { Icon: Shield, label: "Rol",    value: profile.roleName },
      { Icon: MapPin, label: "Regio",  value: profile.region },
    ] as { Icon: LucideIcon; label: string; value: string | null }[]
  ).filter((f): f is ReadOnlyField => !!f.value);

  const hasBadges =
    profile.certificates.length > 0 ||
    profile.diplomas.length > 0 ||
    profile.knowledge.length > 0;

  return (
    <div className="space-y-4 p-4 md:p-0">
      <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
        Mijn profiel
      </h1>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        {/* Avatar */}
        <div className="mb-5 flex flex-col items-center gap-3">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {profile.firstName[0]}{profile.lastName[0]}
          </div>
          <p className="text-lg font-bold" style={{ color: "var(--color-primary)" }}>
            {profile.firstName} {profile.lastName}
          </p>
        </div>

        <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
          {/* Read-only fields: email, rol, regio */}
          {readOnlyFields.map(({ Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: "rgba(0,183,179,0.1)" }}
              >
                <Icon size={16} style={{ color: "var(--color-accent)" }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: "var(--color-muted-fg)" }}>{label}</p>
                <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>{value}</p>
              </div>
            </div>
          ))}

          {/* Editable phone field */}
          <div className="flex items-start gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: "rgba(0,183,179,0.1)" }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.07 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16a2 2 0 0 1 .92.92z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <PhoneEditForm currentPhone={profile.phone} />
            </div>
          </div>
        </div>
      </div>

      {hasBadges && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Award size={16} style={{ color: "var(--color-accent)" }} />
            <h2 className="font-semibold" style={{ color: "var(--color-primary)" }}>
              Kwalificaties
            </h2>
          </div>
          {profile.certificates.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-medium uppercase" style={{ color: "var(--color-muted-fg)" }}>
                Certificaten
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.certificates.map((c) => (
                  <span
                    key={c}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ backgroundColor: "rgba(0,183,179,0.1)", color: "var(--color-accent)" }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {profile.diplomas.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-medium uppercase" style={{ color: "var(--color-muted-fg)" }}>
                Diploma&apos;s
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.diplomas.map((d) => (
                  <span
                    key={d}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ backgroundColor: "rgba(8,29,58,0.08)", color: "var(--color-primary)" }}
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
          {profile.knowledge.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase" style={{ color: "var(--color-muted-fg)" }}>
                Kennis
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.knowledge.map((k) => (
                  <span
                    key={k}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ backgroundColor: "#F1F5F9", color: "var(--color-secondary)" }}
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Wachtwoord wijzigen */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound size={16} style={{ color: "var(--color-accent)" }} />
          <h2 className="font-semibold" style={{ color: "var(--color-primary)" }}>
            Wachtwoord wijzigen
          </h2>
        </div>
        <PasswordChangeForm />
      </div>

      <form action={signOut}>
        <button
          type="submit"
          className="w-full rounded-2xl border py-4 text-base font-semibold"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-destructive)",
            backgroundColor: "white",
          }}
        >
          Uitloggen
        </button>
      </form>
    </div>
  );
}

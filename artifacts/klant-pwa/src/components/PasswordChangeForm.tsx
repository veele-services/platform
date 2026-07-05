"use client";

import { useActionState, useMemo, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { changeMyPassword } from "@/actions/auth";
import { evaluatePasswordStrength } from "@/lib/password-strength";
import {
  CustomerSettingsFeedback,
  CustomerSettingsSaveBar,
} from "./SettingsShell";

export function PasswordChangeForm() {
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState(changeMyPassword, undefined);
  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);

  return (
    <form action={formAction} className="rounded-[22px] bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: "#E8FBFA", color: "var(--color-accent)" }}>
          <LockKeyhole size={21} />
        </span>
        <div>
          <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
            Wachtwoord wijzigen
          </h2>
          <p className="mt-1 text-sm font-medium" style={{ color: "var(--color-secondary)" }}>
            Gebruik minimaal een medium sterk wachtwoord.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold" style={{ color: "var(--color-primary)" }}>
            Nieuw wachtwoord
          </span>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            autoComplete="new-password"
          />
          <div className="mt-2 h-2 rounded-full bg-slate-100">
            <span
              className="block h-2 rounded-full transition-all"
              style={{
                width:           `${Math.max(12, strength.score * 25)}%`,
                backgroundColor: strength.isMedium ? "var(--color-accent)" : "var(--color-warning)",
              }}
            />
          </div>
          <p className="mt-1 text-xs font-semibold" style={{ color: strength.isMedium ? "var(--color-accent)" : "var(--color-secondary)" }}>
            {strength.label}
          </p>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-bold" style={{ color: "var(--color-primary)" }}>
            Herhaal wachtwoord
          </span>
          <input
            type="password"
            name="passwordTwo"
            className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
            autoComplete="new-password"
          />
        </label>
      </div>

      {state?.error ? (
        <div className="mt-4">
          <CustomerSettingsFeedback type="error">{state.error}</CustomerSettingsFeedback>
        </div>
      ) : null}
      {state?.success ? (
        <div className="mt-4">
          <CustomerSettingsFeedback type="success">
            Wachtwoord opgeslagen.
          </CustomerSettingsFeedback>
        </div>
      ) : null}

      <CustomerSettingsSaveBar pending={pending} label="Wachtwoord opslaan" />
    </form>
  );
}

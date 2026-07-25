"use client";

import { useActionState, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { changeMyPassword } from "@/actions/auth";
import { evaluatePasswordStrength } from "@/lib/password-strength";
import {
  PersonnelSettingsFeedback,
  PersonnelSettingsSaveBar,
} from "@/components/SettingsShell";

const STRENGTH_COLORS = ["#EF4444", "#F97316", "#F59E0B", "var(--color-accent)", "#10B981"];

export function SecurityPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    changeMyPassword,
    undefined,
  );
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);

  return (
    <form action={formAction} className="space-y-3">
      <PasswordField
        label="Nieuw wachtwoord"
        name="password"
        value={password}
        visible={visible}
        onToggleVisible={() => setVisible((current) => !current)}
        onChange={setPassword}
      />
      <PasswordField
        label="Herhaal wachtwoord"
        name="passwordTwo"
        visible={visible}
      />

      <div>
        <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
          {Array.from({ length: 5 }).map((_, index) => (
            <span
              key={index}
              className="flex-1 border-r border-white last:border-r-0"
              style={{
                backgroundColor:
                  index < strength.score
                    ? STRENGTH_COLORS[Math.max(strength.score - 1, 0)]
                    : "transparent",
              }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs font-bold text-slate-500">
          Sterkte:{" "}
          <span style={{ color: STRENGTH_COLORS[Math.max(strength.score - 1, 0)] }}>
            {strength.label}
          </span>
        </p>
      </div>

      {state?.error ? (
        <PersonnelSettingsFeedback type="error">{state.error}</PersonnelSettingsFeedback>
      ) : null}
      {state?.success ? (
        <PersonnelSettingsFeedback type="success">
          Wachtwoord gewijzigd
        </PersonnelSettingsFeedback>
      ) : null}

      <PersonnelSettingsSaveBar pending={isPending} label="Wachtwoord opslaan" />
    </form>
  );
}

function PasswordField({
  label,
  name,
  value,
  visible,
  onToggleVisible,
  onChange,
}: {
  label: string;
  name: string;
  value?: string;
  visible: boolean;
  onToggleVisible?: () => void;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block rounded-2xl border border-[#D8E8F3] bg-white px-3 py-2.5">
      <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="mt-1 flex items-center gap-2">
        <input
          type={visible ? "text" : "password"}
          name={name}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          autoComplete="new-password"
          className="min-w-0 flex-1 bg-transparent text-base font-bold text-[var(--color-primary)] outline-none"
        />
        {onToggleVisible ? (
          <button
            type="button"
            onClick={onToggleVisible}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-500"
            aria-label={visible ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        ) : null}
      </span>
    </label>
  );
}

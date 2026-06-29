"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { changeMyPassword } from "@/actions/auth";
import { evaluatePasswordStrength } from "@/lib/password-strength";

const STRENGTH_COLORS = ["#EF4444", "#F97316", "#F59E0B", "#00B7B3", "#10B981"];

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
        <p className="rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-bold text-red-600">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700">
          <CheckCircle2 size={17} strokeWidth={2.4} />
          Wachtwoord gewijzigd
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00B7B3] px-4 py-3.5 text-base font-black text-white shadow-lg disabled:opacity-60"
      >
        {isPending ? <Loader2 size={19} className="animate-spin" /> : null}
        Wachtwoord opslaan
      </button>
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
          className="min-w-0 flex-1 bg-transparent text-base font-bold text-[#081D3A] outline-none"
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

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  Loader2,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Factor = {
  id: string;
  status?: string;
  factor_type?: string;
  friendly_name?: string;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
};

function normalizeQrCode(value: string) {
  if (value.startsWith("data:")) return value;
  return `data:image/svg+xml;utf8,${encodeURIComponent(value)}`;
}

export function MfaSettings() {
  const supabase = useMemo(() => createClient(), []);
  const [factor, setFactor] = useState<Factor | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      await loadFactor();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFactor() {
    setError(null);
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setError("2FA-status ophalen mislukt.");
      return;
    }

    const typedData = data as {
      all?: Factor[];
      totp?: Factor[];
    } | null;
    const allFactors = [...(typedData?.totp ?? []), ...(typedData?.all ?? [])];
    const uniqueFactors = new Map(allFactors.map((item) => [item.id, item]));
    const verifiedTotp =
      [...uniqueFactors.values()].find(
        (item) =>
          item.status === "verified" &&
          (item.factor_type === "totp" || !item.factor_type),
      ) ?? null;

    setFactor(verifiedTotp);
  }

  function handleEnroll() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Veele Services",
      });

      if (enrollError || !data) {
        setError(
          "2FA activeren is nog niet beschikbaar. Controleer of MFA/TOTP in Supabase is ingeschakeld.",
        );
        return;
      }

      const typedData = data as {
        id?: string;
        totp?: { qr_code?: string };
      };
      if (!typedData.id || !typedData.totp?.qr_code) {
        setError("QR-code kon niet worden aangemaakt.");
        return;
      }

      setEnrollment({
        factorId: typedData.id,
        qrCode: normalizeQrCode(typedData.totp.qr_code),
      });
      setMessage("Scan de QR-code met je authenticator-app.");
    });
  }

  function handleVerify() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      if (!enrollment) return;
      const cleanCode = code.replace(/\s/g, "");
      if (!/^\d{6}$/.test(cleanCode)) {
        setError("Vul de 6-cijferige code uit je authenticator-app in.");
        return;
      }

      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
      if (challengeError || !challengeData?.id) {
        setError("Controlecode starten mislukt.");
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollment.factorId,
        challengeId: challengeData.id,
        code: cleanCode,
      });
      if (verifyError) {
        setError("Code klopt niet of is verlopen.");
        return;
      }

      setEnrollment(null);
      setCode("");
      setMessage("2FA is geactiveerd.");
      await loadFactor();
    });
  }

  function handleDisable() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      if (!factor) return;
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: factor.id,
      });
      if (unenrollError) {
        setError("2FA uitschakelen mislukt.");
        return;
      }
      setFactor(null);
      setMessage("2FA is uitgeschakeld.");
    });
  }

  return (
    <div className="space-y-3">
      <div
        className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${
          factor
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
        }`}
      >
        {factor ? (
          <ShieldCheck size={22} strokeWidth={2.4} />
        ) : (
          <ShieldAlert size={22} strokeWidth={2.4} />
        )}
        <div>
          <p className="text-sm font-black">
            {factor ? "2FA actief" : "2FA niet actief"}
          </p>
          <p className="text-xs font-semibold opacity-80">
            {factor
              ? "Inloggen vraagt om een extra authenticator-code."
              : "Activeer dit zodra Supabase MFA voor de omgeving aanstaat."}
          </p>
        </div>
      </div>

      {enrollment ? (
        <div className="rounded-[20px] border border-[#D8E8F3] bg-[#F8FBFE] p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-black text-[#081D3A]">
            <QrCode size={18} strokeWidth={2.4} className="text-[#009E9A]" />
            Authenticator koppelen
          </div>
          <div className="flex justify-center rounded-2xl bg-white p-3 shadow-sm">
            <img
              src={enrollment.qrCode}
              alt="2FA QR-code"
              className="h-44 w-44"
            />
          </div>
          <label className="mt-3 block rounded-2xl border border-[#D8E8F3] bg-white px-3 py-2.5">
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">
              Code
            </span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              className="mt-1 w-full bg-transparent text-xl font-black tracking-[0.35em] text-[#081D3A] outline-none"
              placeholder="000000"
            />
          </label>
          <button
            type="button"
            onClick={handleVerify}
            disabled={loading}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00B7B3] px-4 py-3.5 text-base font-black text-white shadow-lg disabled:opacity-60"
          >
            {loading ? <Loader2 size={19} className="animate-spin" /> : null}
            2FA bevestigen
          </button>
        </div>
      ) : null}

      {message ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700">
          <CheckCircle2 size={17} strokeWidth={2.4} />
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-bold text-red-600">
          {error}
        </p>
      ) : null}

      {factor ? (
        <button
          type="button"
          onClick={handleDisable}
          disabled={loading}
          className="w-full rounded-2xl border border-red-100 bg-white px-4 py-3.5 text-base font-black text-red-600 shadow-sm disabled:opacity-60"
        >
          2FA uitschakelen
        </button>
      ) : (
        <button
          type="button"
          onClick={handleEnroll}
          disabled={loading || Boolean(enrollment)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00B7B3] px-4 py-3.5 text-base font-black text-white shadow-lg disabled:opacity-60"
        >
          {loading ? (
            <Loader2 size={19} className="animate-spin" />
          ) : (
            <Smartphone size={19} strokeWidth={2.4} />
          )}
          2FA activeren
        </button>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetWachtwoordPage() {
  const router = useRouter();
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error,           setError]           = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Wachtwoord moet minimaal 8 tekens bevatten.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Wachtwoorden komen niet overeen.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error: sbError } = await supabase.auth.updateUser({ password });

      if (sbError) {
        setError(
          sbError.message.includes("same password")
            ? "Het nieuwe wachtwoord mag niet gelijk zijn aan het huidige wachtwoord."
            : "Wachtwoord opslaan mislukt. De resetlink is mogelijk verlopen — vraag een nieuwe aan.",
        );
        return;
      }

      await supabase.auth.signOut();
      router.push("/login?message=Wachtwoord+succesvol+gewijzigd.+U+kunt+nu+inloggen.");
    });
  }

  return (
    <div
      className="w-full max-w-sm mx-4"
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: "12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 24px rgba(8,29,58,0.10)",
        padding: "36px 32px 40px",
      }}
    >
      <div className="flex flex-col items-center mb-8">
        <div className="flex flex-col items-center leading-none mb-5">
          <span
            className="font-bold tracking-widest"
            style={{
              fontFamily: "var(--font-poppins), Poppins, sans-serif",
              fontSize: "20px",
              color: "#081D3A",
            }}
          >
            VEELE
          </span>
          <span
            className="uppercase tracking-[0.22em]"
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              fontSize: "9px",
              color: "#00B7B3",
              marginTop: "3px",
            }}
          >
            Services
          </span>
        </div>

        <h1
          className="font-semibold"
          style={{
            fontFamily: "var(--font-poppins), Poppins, sans-serif",
            fontSize: "17px",
            color: "#081D3A",
            letterSpacing: "-0.01em",
          }}
        >
          Nieuw wachtwoord instellen
        </h1>
        <p
          className="mt-1 text-center"
          style={{
            fontFamily: "var(--font-inter), Inter, sans-serif",
            fontSize: "13px",
            color: "#64748B",
          }}
        >
          Kies een nieuw wachtwoord voor uw account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && (
          <div
            className="flex items-start gap-2.5 rounded-lg px-3.5 py-3"
            style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA" }}
            role="alert"
          >
            <AlertCircle
              className="flex-shrink-0 mt-0.5"
              style={{ width: "15px", height: "15px", color: "#EF4444" }}
            />
            <p
              style={{
                fontFamily: "var(--font-inter), Inter, sans-serif",
                fontSize: "13px",
                color: "#B91C1C",
                lineHeight: "1.4",
              }}
            >
              {error}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label
            htmlFor="password"
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              fontSize: "13px",
              fontWeight: 500,
              color: "#081D3A",
            }}
          >
            Nieuw wachtwoord
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            placeholder="Minimaal 8 tekens"
            style={{ fontSize: "14px" }}
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="confirm-password"
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              fontSize: "13px",
              fontWeight: 500,
              color: "#081D3A",
            }}
          >
            Wachtwoord bevestigen
          </Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={pending}
            placeholder="••••••••"
            style={{ fontSize: "14px" }}
          />
        </div>

        <button
          type="submit"
          disabled={pending || !password || !confirmPassword}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-lg font-semibold text-white transition-all"
          style={{
            fontFamily: "var(--font-inter), Inter, sans-serif",
            fontSize: "14px",
            backgroundColor: pending || !password || !confirmPassword ? "#94A3B8" : "#00B7B3",
            cursor: pending || !password || !confirmPassword ? "not-allowed" : "pointer",
            letterSpacing: "0.01em",
          }}
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {pending ? "Opslaan…" : "Wachtwoord opslaan"}
        </button>

        <Link
          href="/login"
          className="block text-center text-sm"
          style={{ color: "#64748B" }}
        >
          Annuleren — terug naar inloggen
        </Link>
      </form>
    </div>
  );
}

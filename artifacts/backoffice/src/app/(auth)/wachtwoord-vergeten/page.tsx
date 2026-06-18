"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function WachtwoordVergetenPage() {
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase    = createClient();
      const redirectTo  = `${window.location.origin}/auth/confirm?type=recovery`;

      const { error: sbError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo },
      );

      if (sbError) {
        setError("Er is een fout opgetreden. Controleer uw e-mailadres en probeer het opnieuw.");
        return;
      }

      setSent(true);
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
          Wachtwoord vergeten
        </h1>
        <p
          className="mt-1 text-center"
          style={{
            fontFamily: "var(--font-inter), Inter, sans-serif",
            fontSize: "13px",
            color: "#64748B",
            lineHeight: "1.5",
          }}
        >
          Vul uw e-mailadres in — u ontvangt een resetlink.
        </p>
      </div>

      {sent ? (
        <div className="space-y-5">
          <div
            className="flex items-start gap-2.5 rounded-lg px-3.5 py-3"
            style={{ backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0" }}
          >
            <CheckCircle2
              className="flex-shrink-0 mt-0.5"
              style={{ width: "15px", height: "15px", color: "#16A34A" }}
            />
            <p
              style={{
                fontFamily: "var(--font-inter), Inter, sans-serif",
                fontSize: "13px",
                color: "#15803D",
                lineHeight: "1.4",
              }}
            >
              Controleer uw inbox. Als dit e-mailadres bekend is, ontvangt u binnen enkele minuten een resetlink.
            </p>
          </div>
          <Link
            href="/login"
            className="block text-center text-sm font-medium"
            style={{ color: "#00B7B3" }}
          >
            Terug naar inloggen
          </Link>
        </div>
      ) : (
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
              htmlFor="email"
              style={{
                fontFamily: "var(--font-inter), Inter, sans-serif",
                fontSize: "13px",
                fontWeight: 500,
                color: "#081D3A",
              }}
            >
              E-mailadres
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              placeholder="jij@bedrijf.nl"
              style={{ fontSize: "14px" }}
            />
          </div>

          <button
            type="submit"
            disabled={pending || !email}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-lg font-semibold text-white transition-all"
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              fontSize: "14px",
              backgroundColor: pending || !email ? "#94A3B8" : "#00B7B3",
              cursor: pending || !email ? "not-allowed" : "pointer",
              letterSpacing: "0.01em",
            }}
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {pending ? "Bezig…" : "Resetlink versturen"}
          </button>

          <Link
            href="/login"
            className="block text-center text-sm"
            style={{ color: "#64748B" }}
          >
            Terug naar inloggen
          </Link>
        </form>
      )}
    </div>
  );
}

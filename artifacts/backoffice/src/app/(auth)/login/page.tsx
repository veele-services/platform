import type { Metadata } from "next";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign In",
};

const supabaseConfigured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

type Props = {
  searchParams: Promise<{ message?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { message, error } = await searchParams;

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
      {/* ── Brand ── */}
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
          Backoffice Inloggen
        </h1>
        <p
          className="mt-1"
          style={{
            fontFamily: "var(--font-inter), Inter, sans-serif",
            fontSize: "13px",
            color: "#64748B",
          }}
        >
          Inloggen met uw Veele account
        </p>
      </div>

      {/* ── URL error (e.g. expired reset link) ── */}
      {error && (
        <div
          className="flex items-start gap-2.5 rounded-lg px-3.5 py-3 mb-5"
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
            {decodeURIComponent(error)}
          </p>
        </div>
      )}

      {/* ── Config warning (dev only) ── */}
      {!supabaseConfigured && (
        <div
          className="flex items-start gap-2.5 rounded-lg px-3.5 py-3 mb-5"
          style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}
        >
          <AlertTriangle
            className="flex-shrink-0 mt-0.5"
            style={{ width: "15px", height: "15px", color: "#D97706" }}
          />
          <div>
            <p
              className="font-medium"
              style={{
                fontFamily: "var(--font-inter), Inter, sans-serif",
                fontSize: "12px",
                color: "#92400E",
              }}
            >
              Supabase niet geconfigureerd
            </p>
            <p
              className="mt-0.5"
              style={{
                fontFamily: "var(--font-inter), Inter, sans-serif",
                fontSize: "11px",
                color: "#B45309",
                lineHeight: "1.4",
              }}
            >
              Stel{" "}
              <code style={{ fontSize: "10px" }}>NEXT_PUBLIC_SUPABASE_URL</code>{" "}
              en{" "}
              <code style={{ fontSize: "10px" }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
              in om authenticatie in te schakelen.
            </p>
          </div>
        </div>
      )}

      <LoginForm supabaseConfigured={supabaseConfigured} successMessage={message} />
    </div>
  );
}

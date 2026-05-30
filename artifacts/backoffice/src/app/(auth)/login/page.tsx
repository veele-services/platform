import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign In",
};

const supabaseConfigured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function LoginPage() {
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
          Backoffice Sign In
        </h1>
        <p
          className="mt-1"
          style={{
            fontFamily: "var(--font-inter), Inter, sans-serif",
            fontSize: "13px",
            color: "#64748B",
          }}
        >
          Sign in with your Veele account
        </p>
      </div>

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
              Supabase not configured
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
              Set{" "}
              <code style={{ fontSize: "10px" }}>NEXT_PUBLIC_SUPABASE_URL</code>{" "}
              and{" "}
              <code style={{ fontSize: "10px" }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
              to enable authentication.
            </p>
          </div>
        </div>
      )}

      <LoginForm supabaseConfigured={supabaseConfigured} />
    </div>
  );
}

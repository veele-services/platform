import type { Metadata } from "next";
import { headers } from "next/headers";
import { AlertCircle, AlertTriangle } from "lucide-react";
import {
  getPlatformBrandTheme,
  getTenantBranding,
} from "@workspace/db";
import { LoginForm } from "@/components/auth/LoginForm";
import {
  isPlatformHost,
  normalizeHost,
  resolveTenantByHost,
} from "@/lib/auth/tenant-resolver";

export const metadata: Metadata = {
  title: "Sign In",
};

const supabaseConfigured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

type Props = {
  searchParams: Promise<{ message?: string; error?: string; next?: string }>;
};

type LoginBranding = {
  displayName: string;
  logoUrl: string | null;
  platformName: string;
  whitelabel: boolean;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedColor: string;
};

function safeNextPath(value: string | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

async function getLoginBranding(host: string): Promise<LoginBranding> {
  const tenant = await resolveTenantByHost(host);
  const tenantBranding = tenant ? await getTenantBranding(tenant.id) : null;
  const theme = tenantBranding ?? (await getPlatformBrandTheme());
  const whitelabel = Boolean(tenantBranding?.customBrandingEnabled);
  const displayName = whitelabel
    ? tenantBranding?.displayName.trim() || tenantBranding?.tenantName.trim() || "Organisatie"
    : theme.brandName.trim() || "Fieldgrid";

  return {
    displayName,
    logoUrl: theme.logoUrl,
    platformName: theme.platformName.trim() || "Fieldgrid",
    whitelabel,
    primaryColor: theme.primaryColor,
    accentColor: theme.accentColor,
    backgroundColor: theme.backgroundColor,
    surfaceColor: theme.surfaceColor,
    textColor: theme.textColor,
    mutedColor: theme.mutedColor,
  };
}

function BrandMark({ branding }: { branding: LoginBranding }) {
  if (branding.logoUrl) {
    return (
      <img
        src={branding.logoUrl}
        alt={branding.displayName}
        className="mb-5 max-h-12 max-w-[190px] object-contain"
      />
    );
  }

  if (branding.whitelabel) {
    return (
      <span
        className="mb-5 max-w-[220px] truncate text-center font-bold"
        style={{
          fontFamily: "var(--font-poppins), Poppins, sans-serif",
          fontSize: "20px",
          color: branding.primaryColor,
          letterSpacing: 0,
        }}
      >
        {branding.displayName}
      </span>
    );
  }

  return (
    <div className="mb-5 flex flex-col items-center leading-none">
      <span
        className="font-bold tracking-widest"
        style={{
          fontFamily: "var(--font-poppins), Poppins, sans-serif",
          fontSize: "20px",
          color: "#081D3A",
        }}
      >
        FIELDGRID
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
  );
}

export default async function LoginPage({ searchParams }: Props) {
  const { message, error, next } = await searchParams;
  const requestHeaders = await headers();
  const host = normalizeHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "");
  const fallbackNextPath = isPlatformHost(host) ? "/platform" : "/";
  const nextPath = safeNextPath(next, fallbackNextPath);
  const branding = await getLoginBranding(host);
  const subtitle = branding.whitelabel
    ? `Inloggen met uw ${branding.displayName}-account`
    : `Inloggen met uw ${branding.platformName}-account`;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ backgroundColor: branding.backgroundColor }}
    >
      <div
        className="w-full max-w-sm"
        style={{
          backgroundColor: branding.surfaceColor,
          borderRadius: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 24px rgba(8,29,58,0.10)",
          padding: "36px 32px 40px",
        }}
      >
        <div className="mb-8 flex flex-col items-center">
          <BrandMark branding={branding} />

          <h1
            className="font-semibold"
            style={{
              fontFamily: "var(--font-poppins), Poppins, sans-serif",
              fontSize: "17px",
              color: branding.textColor,
              letterSpacing: 0,
            }}
          >
            Backoffice Inloggen
          </h1>
          <p
            className="mt-1"
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              fontSize: "13px",
              color: branding.mutedColor,
            }}
          >
            {subtitle}
          </p>
        </div>

        {error && (
          <div
            className="mb-5 flex items-start gap-2.5 rounded-lg px-3.5 py-3"
            style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA" }}
            role="alert"
          >
            <AlertCircle
              className="mt-0.5 flex-shrink-0"
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

        {!supabaseConfigured && (
          <div
            className="mb-5 flex items-start gap-2.5 rounded-lg px-3.5 py-3"
            style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}
          >
            <AlertTriangle
              className="mt-0.5 flex-shrink-0"
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
                Stel <code style={{ fontSize: "10px" }}>NEXT_PUBLIC_SUPABASE_URL</code> en{" "}
                <code style={{ fontSize: "10px" }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in om authenticatie in te
                schakelen.
              </p>
            </div>
          </div>
        )}

        <LoginForm
          supabaseConfigured={supabaseConfigured}
          successMessage={message}
          nextPath={nextPath}
          accentColor={branding.accentColor}
          textColor={branding.textColor}
          mutedColor={branding.mutedColor}
        />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { headers } from "next/headers";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  getPlatformBrandTheme,
  getTenantBranding,
  getTenantBrandingCssVariables,
} from "@workspace/db";
import { LoginForm } from "@/components/auth/LoginForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  isPlatformHost,
  normalizeHost,
  resolveTenantByHost,
} from "@/lib/auth/tenant-resolver";

export const metadata: Metadata = {
  title: "Inloggen",
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
  cssVariables: Record<string, string>;
};

function safeNextPath(value: string | undefined, fallback = "/"): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return fallback;
  return value;
}

async function getLoginBranding(host: string): Promise<LoginBranding> {
  const tenant = await resolveTenantByHost(host);
  const tenantBranding = tenant ? await getTenantBranding(tenant.id) : null;
  const theme = tenantBranding ?? (await getPlatformBrandTheme());
  const whitelabel = Boolean(tenantBranding?.customBrandingEnabled);
  const displayName = whitelabel
    ? tenantBranding?.displayName.trim() ||
      tenantBranding?.tenantName.trim() ||
      "Organisatie"
    : theme.brandName.trim() || "Fieldgrid";

  return {
    displayName,
    logoUrl: theme.logoUrl,
    platformName: theme.platformName.trim() || "Fieldgrid",
    whitelabel,
    cssVariables: getTenantBrandingCssVariables(theme),
  };
}

function BrandMark({ branding }: { branding: LoginBranding }) {
  if (branding.logoUrl) {
    return (
      <img
        src={branding.logoUrl}
        alt={branding.displayName}
        className="max-h-12 max-w-[190px] object-contain"
      />
    );
  }

  if (branding.whitelabel) {
    return (
      <span className="max-w-[220px] truncate text-center font-heading text-xl font-bold text-primary">
        {branding.displayName}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center leading-none">
      <span className="font-heading text-xl font-bold tracking-widest text-foreground">
        FIELDGRID
      </span>
      <span className="mt-1 text-[9px] uppercase tracking-[0.22em] text-primary">
        Services
      </span>
    </div>
  );
}

export default async function LoginPage({ searchParams }: Props) {
  const { message, error, next } = await searchParams;
  const requestHeaders = await headers();
  const host = normalizeHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "",
  );
  const fallbackNextPath = isPlatformHost(host) ? "/platform" : "/";
  const nextPath = safeNextPath(next, fallbackNextPath);
  const branding = await getLoginBranding(host);
  const subtitle = branding.whitelabel
    ? `Inloggen met uw ${branding.displayName}-account`
    : `Inloggen met uw ${branding.platformName}-account`;

  return (
    <main
      className="min-h-dvh w-full overflow-y-auto bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6"
      style={branding.cssVariables as CSSProperties}
    >
      <div className="mx-auto grid min-h-[calc(100dvh-2rem)] w-full max-w-6xl items-stretch overflow-hidden rounded-[var(--radius-panel)] border border-border bg-card shadow-lg lg:grid-cols-[minmax(0,1.05fr)_minmax(24rem,0.95fr)]">
        <section className="hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-75">
              {branding.platformName}
            </p>
            <h2 className="mt-5 max-w-lg font-heading text-4xl font-semibold leading-tight">
              Werk georganiseerd. Team verbonden.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed opacity-80">
              Planning, uitvoering en administratie in één veilige werkomgeving.
            </p>
          </div>
          <ul className="space-y-4 text-sm">
            {[
              {
                icon: CalendarClock,
                label: "Actuele planning en werkbonnen",
              },
              { icon: Users, label: "Samenwerken per organisatie en rol" },
              {
                icon: ShieldCheck,
                label: "Beveiligde toegang en controleerbare acties",
              },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground/10">
                  <Icon className="size-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex min-w-0 items-center justify-center px-5 py-8 sm:px-10 sm:py-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col items-center text-center">
              <BrandMark branding={branding} />
              <h1 className="mt-5 font-heading text-xl font-semibold text-foreground">
                Inloggen bij {branding.displayName}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            </div>

            <div className="space-y-5">
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    {decodeURIComponent(error)}
                  </AlertDescription>
                </Alert>
              ) : null}

              {!supabaseConfigured ? (
                <Alert className="border-amber-300 bg-amber-50 text-amber-950">
                  <AlertTriangle className="size-4 text-amber-700" />
                  <AlertTitle>Inloggen tijdelijk niet beschikbaar</AlertTitle>
                  <AlertDescription>
                    De authenticatieverbinding is nog niet gereed. Neem contact
                    op met de beheerder.
                    {process.env.NODE_ENV === "development" ? (
                      <span className="mt-1 block font-mono text-xs">
                        Controleer NEXT_PUBLIC_SUPABASE_URL en
                        NEXT_PUBLIC_SUPABASE_ANON_KEY.
                      </span>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              <LoginForm
                supabaseConfigured={supabaseConfigured}
                successMessage={message}
                nextPath={nextPath}
              />
            </div>

            <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-primary" />
              Toegang wordt beveiligd en gecontroleerd per rol.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

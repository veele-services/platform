import { LoginForm } from "@/components/LoginForm";
import {
  clearPersonnelTenantSelection,
  selectPersonnelTenant,
} from "@/actions/auth";
import { getTenantBranding } from "@workspace/db";
import {
  requireCurrentPersonnelPortalTenantId,
  resolvePersonnelPortalTenantContext,
} from "@/lib/auth/tenant";
import { ArrowRight, Building2 } from "lucide-react";

type Props = {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
};

const PORTAL_BASE = "/personeel";

function isLoginPath(value: string): boolean {
  const pathname = value.split(/[?#]/u)[0] || value;
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === `${PORTAL_BASE}/login` ||
    pathname.startsWith(`${PORTAL_BASE}/login/`)
  );
}

function safeNext(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (isLoginPath(trimmed)) return null;
  if (trimmed === PORTAL_BASE) return "/";
  if (trimmed.startsWith(`${PORTAL_BASE}/`)) {
    return trimmed.slice(PORTAL_BASE.length) || "/";
  }
  return trimmed;
}

export default async function LoginPage({ searchParams }: Props) {
  const { error, message, next } = await searchParams;
  const redirectPath = safeNext(next);
  const [tenantContext, tenantId] = await Promise.all([
    resolvePersonnelPortalTenantContext(),
    requireCurrentPersonnelPortalTenantId(),
  ]);
  const branding = tenantId ? await getTenantBranding(tenantId) : null;
  const displayName = branding?.displayName ?? "Fieldgrid";
  const title = branding?.customBrandingEnabled ? `${displayName} Personeel` : "Fieldgrid Personeel";
  const showTenantCode = tenantContext.requiresTenantCode && !tenantId;

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: branding?.primaryColor ?? "var(--color-primary)" }}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 text-center">
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              <img
                src="/personeel/api/pwa/icon?size=192"
                alt=""
                className="h-full w-full rounded-2xl object-contain p-1.5"
              />
            </div>
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            <p className="mt-1 text-sm" style={{ color: "#94A3B8" }}>
              Log in met je werkaccount
            </p>
          </div>

          {message && (
            <div
              className="mb-6 rounded-xl px-4 py-3 text-sm font-medium"
              style={{ backgroundColor: "rgba(22,163,74,0.15)", color: "#86EFAC" }}
            >
              {decodeURIComponent(message)}
            </div>
          )}

          {error && (
            <div
              className="mb-6 rounded-xl px-4 py-3 text-sm font-medium text-white"
              style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#FCA5A5" }}
            >
              {decodeURIComponent(error)}
            </div>
          )}

          <div className="rounded-2xl bg-white p-6 shadow-lg">
            {showTenantCode ? (
              <form action={selectPersonnelTenant} className="space-y-5">
                {redirectPath ? <input type="hidden" name="next" value={redirectPath} /> : null}
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-semibold text-foreground">Kies je organisatie</h2>
                    <p id="tenant-code-help" className="mt-1 text-sm leading-5 text-muted-foreground">
                      Vul de unieke code van zes tekens in die je van je werkgever hebt ontvangen.
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor="tenantCode" className="mb-1.5 block text-sm font-medium text-foreground">
                    Organisatiecode
                  </label>
                  <input
                    id="tenantCode"
                    name="tenantCode"
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    minLength={6}
                    maxLength={6}
                    pattern="[A-HJ-NP-Za-hj-np-z2-9]{6}"
                    aria-describedby="tenant-code-help"
                    required
                    autoFocus
                    placeholder="ABC234"
                    className="min-h-12 w-full rounded-xl border border-border bg-background px-4 text-center font-mono text-xl font-bold uppercase tracking-[0.3em] text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>

                <button
                  type="submit"
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Naar inloggen
                  <ArrowRight aria-hidden="true" className="size-4" />
                </button>
              </form>
            ) : tenantContext.blockedHost ? (
              <div role="alert" className="space-y-2 text-center">
                <h2 className="font-semibold text-foreground">Personeelsapp niet beschikbaar</h2>
                <p className="text-sm text-muted-foreground">
                  Deze app-link hoort niet bij een actieve organisatie.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <LoginForm next={redirectPath} />
                {tenantContext.source === "selection" ? (
                  <form action={clearPersonnelTenantSelection}>
                    <button
                      type="submit"
                      className="min-h-11 w-full rounded-lg text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Andere organisatie kiezen
                    </button>
                  </form>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

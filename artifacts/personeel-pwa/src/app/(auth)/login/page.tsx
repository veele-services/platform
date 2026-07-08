import { LoginForm } from "@/components/LoginForm";
import { getTenantBranding } from "@workspace/db";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";

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
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  const branding = tenantId ? await getTenantBranding(tenantId) : null;
  const displayName = branding?.displayName ?? "Fieldgrid";
  const title = branding?.customBrandingEnabled ? `${displayName} Personeel` : "Fieldgrid Personeel";

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
            <LoginForm next={redirectPath} />
          </div>
        </div>
      </div>
    </div>
  );
}

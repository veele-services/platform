import { LoginForm } from "./LoginForm";
import { getTenantBranding } from "@workspace/db";
import { requireCurrentCustomerPortalTenantId } from "@/lib/auth/tenant";

type Props = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { error, message } = await searchParams;
  const tenantId = await requireCurrentCustomerPortalTenantId();
  const branding = tenantId ? await getTenantBranding(tenantId) : null;
  const displayName = branding?.displayName ?? "Fieldgrid";
  const title = branding?.customBrandingEnabled ? `${displayName} Klantportaal` : "Fieldgrid Klantportaal";

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
              style={{ backgroundColor: "var(--color-accent-accessible)" }}
            >
              <img
                src="/klant/api/pwa/icon?size=192"
                alt=""
                className="h-full w-full rounded-2xl object-contain p-1.5"
              />
            </div>
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            <p className="mt-1 text-sm" style={{ color: "#94A3B8" }}>
              Log in met uw e-mailadres
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
              className="mb-6 rounded-xl px-4 py-3 text-sm font-medium"
              style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#FCA5A5" }}
            >
              {decodeURIComponent(error)}
            </div>
          )}

          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}

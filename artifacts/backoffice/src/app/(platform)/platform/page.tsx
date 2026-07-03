import Link from "next/link";
import {
  createPlatformTenant,
  listPlatformTenants,
} from "@/app/actions/platform-tenants";
import {
  enterSupportMode,
  listPlatformUsers,
  listSupportAccessGrants,
  type SupportAccessGrantRow,
} from "@/app/actions/platform";
import { listCurrentSupportAccessGrants } from "@/app/actions/support-mode";
import { getCurrentPlatformUser } from "@/lib/auth/platform";

export const metadata = {
  title: "Platformbeheer",
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function supportGrantStatus(grant: SupportAccessGrantRow): "Actief" | "Gepland" | "Verlopen" | "Ingetrokken" {
  const now = Date.now();
  if (grant.revokedAt) return "Ingetrokken";
  if (new Date(grant.startsAt).getTime() > now) return "Gepland";
  if (new Date(grant.expiresAt).getTime() <= now) return "Verlopen";
  return "Actief";
}

export default async function PlatformAdminPage() {
  const platformUser = await getCurrentPlatformUser();
  const isPlatformAdmin = platformUser?.role === "owner" || platformUser?.role === "admin";

  const [tenants, platformUsers, supportGrants] = await Promise.all([
    isPlatformAdmin ? listPlatformTenants() : Promise.resolve([]),
    isPlatformAdmin ? listPlatformUsers() : Promise.resolve([]),
    isPlatformAdmin ? listSupportAccessGrants() : listCurrentSupportAccessGrants(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-5">
          <p className="text-sm font-medium text-slate-500">Fieldgrid</p>
          <h1 className="text-3xl font-semibold tracking-normal">Platformbeheer</h1>
          {!isPlatformAdmin && (
            <p className="text-sm text-slate-500">
              Je ziet alleen supportgrants die expliciet aan jouw platformgebruiker zijn toegekend.
            </p>
          )}
        </header>

        {isPlatformAdmin && (
          <section className="rounded border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-normal">Nieuwe tenant</h2>
                <p className="mt-1 text-sm text-slate-500">Maak een tenant-shell met plan en optioneel eerste domein.</p>
              </div>
            </div>
            <form action={createPlatformTenant} className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_0.7fr_1fr_auto] md:items-end">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Naam
                <input name="name" required className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Demo A" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Slug
                <input name="slug" className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="demo-a" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Plan
                <select name="planKey" defaultValue="starter" className="rounded border border-slate-300 px-3 py-2 text-sm">
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Domein
                <input name="domain" className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="demo-a.fieldgrid.nl" />
              </label>
              <button type="submit" className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                Aanmaken
              </button>
            </form>
          </section>
        )}

        {isPlatformAdmin && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-normal">Tenants</h2>
              <span className="text-sm text-slate-500">{tenants.length}</span>
            </div>
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Naam</th>
                    <th className="px-4 py-3 font-semibold">Slug</th>
                    <th className="px-4 py-3 font-semibold">Plan</th>
                    <th className="px-4 py-3 font-semibold">Domein</th>
                    <th className="px-4 py-3 font-semibold">Gebruikers</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/platform/tenants/${tenant.id}`} className="text-slate-950 underline-offset-2 hover:underline">
                          {tenant.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{tenant.slug}</td>
                      <td className="px-4 py-3 text-slate-600">{tenant.planKey}</td>
                      <td className="px-4 py-3 text-slate-600">{tenant.primaryDomain ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{tenant.userCount}</td>
                      <td className="px-4 py-3 text-slate-600">{tenant.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className={isPlatformAdmin ? "grid gap-8 lg:grid-cols-2" : "grid gap-8"}>
          {isPlatformAdmin && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold tracking-normal">Platformgebruikers</h2>
                <span className="text-sm text-slate-500">{platformUsers.length}</span>
              </div>
              <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">User ID</th>
                      <th className="px-4 py-3 font-semibold">Rol</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Laatst gezien</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformUsers.map((user) => (
                      <tr key={user.id} className="border-t border-slate-100">
                        <td className="max-w-64 truncate px-4 py-3 text-slate-600">{user.userId}</td>
                        <td className="px-4 py-3 font-medium">{user.role}</td>
                        <td className="px-4 py-3 text-slate-600">{user.status}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(user.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-normal">Supporttoegang</h2>
              <span className="text-sm text-slate-500">{supportGrants.length}</span>
            </div>
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Tenant</th>
                    <th className="px-4 py-3 font-semibold">Reden</th>
                    <th className="px-4 py-3 font-semibold">Verloopt</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {supportGrants.map((grant) => {
                    const status = supportGrantStatus(grant);
                    return (
                      <tr key={grant.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-medium">{grant.tenantName}</td>
                        <td className="max-w-72 truncate px-4 py-3 text-slate-600">{grant.reason}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(grant.expiresAt)}</td>
                        <td className="px-4 py-3 text-slate-600">{status}</td>
                        <td className="px-4 py-3">
                          {status === "Actief" ? (
                            <form action={enterSupportMode}>
                              <input type="hidden" name="tenantId" value={grant.tenantId} />
                              <button
                                type="submit"
                                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                              >
                                Open supportmodus
                              </button>
                            </form>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

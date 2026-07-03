import { listPlatformTenants } from "@/app/actions/platform-tenants";
import {
  enterSupportMode,
  listPlatformUsers,
  listSupportAccessGrants,
  type SupportAccessGrantRow,
} from "@/app/actions/platform";

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
  const [tenants, platformUsers, supportGrants] = await Promise.all([
    listPlatformTenants(),
    listPlatformUsers(),
    listSupportAccessGrants(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-5">
          <p className="text-sm font-medium text-slate-500">Fieldgrid</p>
          <h1 className="text-3xl font-semibold tracking-normal">Platformbeheer</h1>
        </header>

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
                  <th className="px-4 py-3 font-semibold">Domein</th>
                  <th className="px-4 py-3 font-semibold">Gebruikers</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{tenant.name}</td>
                    <td className="px-4 py-3 text-slate-600">{tenant.slug}</td>
                    <td className="px-4 py-3 text-slate-600">{tenant.primaryDomain ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{tenant.userCount}</td>
                    <td className="px-4 py-3 text-slate-600">{tenant.isActive ? "Actief" : "Inactief"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
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

import Link from "next/link";
import { listPlatformTenants } from "@/app/actions/platform-tenants";

export const metadata = {
  title: "Tenants",
};

export default async function PlatformTenantsPage() {
  const tenants = await listPlatformTenants();

  return (
    <main className="min-h-full bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-5">
          <p className="text-sm font-medium text-slate-500">Fieldgrid platform</p>
          <h2 className="text-2xl font-semibold tracking-normal text-slate-950">Tenants</h2>
        </header>
        <section className="overflow-hidden rounded border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
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
                      <Link href={`/platform/tenants/${tenant.id}`} className="underline-offset-2 hover:underline">
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
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                      Geen tenants gevonden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

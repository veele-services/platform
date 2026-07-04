import { listPlatformUsers } from "@/app/actions/platform";

export const metadata = {
  title: "Platformgebruikers",
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export default async function PlatformUsersPage() {
  const users = await listPlatformUsers();

  return (
    <main className="min-h-full bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-5">
          <p className="text-sm font-medium text-slate-500">Fieldgrid platform</p>
          <h2 className="text-2xl font-semibold tracking-normal text-slate-950">Platformgebruikers</h2>
        </header>
        <section className="overflow-hidden rounded border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">User ID</th>
                  <th className="px-4 py-3 font-semibold">Rol</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Laatst gezien</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-slate-100">
                    <td className="max-w-80 truncate px-4 py-3 text-slate-600">{user.userId}</td>
                    <td className="px-4 py-3 font-medium text-slate-950">{user.role}</td>
                    <td className="px-4 py-3 text-slate-600">{user.status}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(user.lastSeenAt)}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                      Geen platformgebruikers gevonden.
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

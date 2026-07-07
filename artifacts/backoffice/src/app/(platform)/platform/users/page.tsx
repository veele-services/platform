import {
  invitePlatformUserFromForm,
  listPlatformUsers,
  sendPlatformUserPasswordResetFromForm,
  updatePlatformUserFromForm,
  type PlatformRole,
  type PlatformUserAuthStatus,
  type PlatformUserStatus,
} from "@/app/actions/platform";

export const metadata = {
  title: "Platformgebruikers",
};

const ROLE_OPTIONS: Array<{ value: PlatformRole; label: string; description: string }> = [
  { value: "owner", label: "Owner", description: "Kan admins en support beheren." },
  { value: "admin", label: "Admin", description: "Kan platformbeheer doen, behalve owners wijzigen." },
  { value: "support", label: "Support", description: "Kan supporttaken uitvoeren zonder gebruikersbeheer." },
];

const STATUS_OPTIONS: Array<{ value: PlatformUserStatus; label: string }> = [
  { value: "active", label: "Actief" },
  { value: "inactive", label: "Inactief" },
  { value: "suspended", label: "Geblokkeerd" },
];

const AUTH_STATUS_LABELS: Record<PlatformUserAuthStatus, string> = {
  confirmed: "Bevestigd",
  invited: "Uitgenodigd",
  unknown: "Onbekend",
};

async function invitePlatformUserAction(formData: FormData): Promise<void> {
  "use server";
  await invitePlatformUserFromForm(formData);
}

async function updatePlatformUserAction(formData: FormData): Promise<void> {
  "use server";
  await updatePlatformUserFromForm(formData);
}

async function resetPlatformUserPasswordAction(formData: FormData): Promise<void> {
  "use server";
  await sendPlatformUserPasswordResetFromForm(formData);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: PlatformUserStatus): string {
  switch (status) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "inactive":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "suspended":
      return "border-red-200 bg-red-50 text-red-800";
  }
}

function authStatusClass(status: PlatformUserAuthStatus): string {
  switch (status) {
    case "confirmed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "invited":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "unknown":
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export default async function PlatformUsersPage() {
  const users = await listPlatformUsers();
  const activeUsers = users.filter((user) => user.status === "active").length;
  const ownerUsers = users.filter((user) => user.role === "owner").length;
  const adminUsers = users.filter((user) => user.role === "admin").length;
  const supportUsers = users.filter((user) => user.role === "support").length;

  return (
    <main className="platform-page min-h-full bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-5">
          <p className="text-sm font-medium text-slate-500">Fieldgrid platform</p>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Platformgebruikers</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Beheer owner-, admin- en supportaccounts. Rol wijzigen, status wijzigen, uitnodigen en last seen zijn auditbaar.
            MFA-status wordt alleen getoond zodra de feature actief en meetbaar is.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Actief" value={activeUsers} />
          <Stat label="Owners" value={ownerUsers} />
          <Stat label="Admins" value={adminUsers} />
          <Stat label="Support" value={supportUsers} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Uitnodigen</h2>
            <p className="mt-1 text-sm text-slate-500">
              Verstuur een Fieldgrid tijdelijk wachtwoord en koppel de gebruiker direct aan een platformrol.
            </p>
            <form action={invitePlatformUserAction} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px_auto]">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                E-mailadres
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="naam@fieldgrid.nl"
                  className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Rol
                <select name="role" defaultValue="support" className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950">
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Status
                <select name="status" defaultValue="active" className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950">
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="mt-auto min-h-11 rounded bg-cyan-600 px-4 text-sm font-semibold text-white hover:bg-cyan-700">
                Uitnodigen
              </button>
            </form>
          </div>

          <aside className="rounded border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Rollen</h2>
            <div className="mt-4 grid gap-3">
              {ROLE_OPTIONS.map((role) => (
                <div key={role.value} className="rounded bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-950">{role.label}</p>
                  <p className="mt-1 text-xs text-slate-600">{role.description}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="grid gap-4">
          {users.map((user) => (
            <article key={user.id} className="rounded border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-all text-base font-semibold tracking-normal text-slate-950">{user.email ?? user.userId}</h2>
                    <span className={`rounded border px-2 py-1 text-xs font-semibold ${statusClass(user.status)}`}>
                      {STATUS_OPTIONS.find((status) => status.value === user.status)?.label ?? user.status}
                    </span>
                    <span className={`rounded border px-2 py-1 text-xs font-semibold ${authStatusClass(user.authStatus)}`}>
                      {AUTH_STATUS_LABELS[user.authStatus]}
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded bg-slate-50 px-3 py-2">
                      <dt className="text-xs font-medium uppercase text-slate-500">User ID</dt>
                      <dd className="mt-1 break-all font-medium text-slate-900">{user.userId}</dd>
                    </div>
                    <div className="rounded bg-slate-50 px-3 py-2">
                      <dt className="text-xs font-medium uppercase text-slate-500">Laatst gezien</dt>
                      <dd className="mt-1 font-medium text-slate-900">{formatDate(user.lastSeenAt)}</dd>
                    </div>
                    <div className="rounded bg-slate-50 px-3 py-2">
                      <dt className="text-xs font-medium uppercase text-slate-500">Laatste login</dt>
                      <dd className="mt-1 font-medium text-slate-900">{formatDate(user.lastSignInAt)}</dd>
                    </div>
                    <div className="rounded bg-slate-50 px-3 py-2">
                      <dt className="text-xs font-medium uppercase text-slate-500">MFA</dt>
                      <dd className="mt-1 font-medium text-slate-900">Niet actief</dd>
                    </div>
                  </dl>
                </div>

                <div className="grid gap-3">
                  <form action={updatePlatformUserAction} className="grid gap-3 rounded bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
                    <input type="hidden" name="platformUserId" value={user.id} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Rol wijzigen
                      <select name="role" defaultValue={user.role} className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950">
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Status wijzigen
                      <select name="status" defaultValue={user.status} className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950">
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="mt-auto min-h-11 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                      Opslaan
                    </button>
                  </form>
                  {user.email && (
                    <form action={resetPlatformUserPasswordAction} className="flex justify-end">
                      <input type="hidden" name="platformUserId" value={user.id} />
                      <button type="submit" className="min-h-10 rounded border border-cyan-200 bg-cyan-50 px-4 text-sm font-semibold text-cyan-800 hover:bg-cyan-100">
                        Resetcode mailen
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </article>
          ))}

          {users.length === 0 && (
            <div className="platform-empty-state text-sm shadow-sm">
              Geen platformgebruikers gevonden.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

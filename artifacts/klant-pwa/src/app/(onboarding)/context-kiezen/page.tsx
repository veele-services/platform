import {
  getMyCustomerContextState,
  selectMyCustomerContext,
} from "@/actions/customer";
import { redirect } from "next/navigation";

const ROLE_LABELS: Record<string, string> = {
  primary: "Primair contact",
  admin: "Beheerder",
  billing: "Financieel",
  operations: "Operationeel",
  viewer: "Lezer",
};

export const metadata = {
  title: "Klantorganisatie kiezen",
};

export default async function CustomerContextPage({
  searchParams,
}: {
  searchParams: Promise<{ fout?: string }>;
}) {
  const context = await getMyCustomerContextState();
  if (context.options.length === 0) {
    redirect("/klant/login?error=Geen%20actieve%20klanttoegang%20gevonden.");
  }
  if (context.options.length === 1) redirect("/klant");
  const { fout } = await searchParams;

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8">
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">
          Klantportaal
        </p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">
          Welke organisatie wilt u openen?
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Uw account heeft toegang tot meerdere klantorganisaties. Kies de
          organisatie waarvan u nu de gegevens wilt bekijken.
        </p>

        {fout ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800"
          >
            Deze klantorganisatie kon niet worden geselecteerd. Probeer het
            opnieuw.
          </p>
        ) : null}

        <div className="mt-5 grid gap-3">
          {context.options.map((option) => (
            <form action={selectMyCustomerContext} key={option.customerUserId}>
              <input
                type="hidden"
                name="customerUserId"
                value={option.customerUserId}
              />
              <button
                type="submit"
                className="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-teal-500 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <span>
                  <span className="block font-black text-slate-950">
                    {option.customerName}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                    {ROLE_LABELS[option.role] ?? option.role}
                  </span>
                </span>
                <span className="text-sm font-black text-teal-700">Openen</span>
              </button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}

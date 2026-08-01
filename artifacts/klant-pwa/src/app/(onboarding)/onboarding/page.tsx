import {
  customerOnboardingRequiredForCurrentMembership,
  getCustomerOnboardingWorkspace,
} from "@/actions/onboarding";
import { getMyCustomerContextState } from "@/actions/customer";
import { CustomerOnboardingWizard } from "@/components/onboarding/CustomerOnboardingWizard";
import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";

export default async function CustomerOnboardingPage() {
  const customerContext = await getMyCustomerContextState();
  if (customerContext.selectionRequired) {
    redirect("/klant/context-kiezen");
  }
  if (customerContext.options.length === 0) {
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-50 px-4 py-8">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-medium text-teal-700">Klantportaal</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">
            Geen actieve klanttoegang
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Uw account is aangemeld, maar nog niet aan een actieve
            klantorganisatie gekoppeld. Vraag uw organisatiebeheerder om uw
            toegang te activeren.
          </p>
          <form action={signOut} className="mt-5">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-800"
            >
              Uitloggen
            </button>
          </form>
        </section>
      </main>
    );
  }
  if (!(await customerOnboardingRequiredForCurrentMembership())) {
    redirect("/klant");
  }
  const workspace = await getCustomerOnboardingWorkspace();
  return <CustomerOnboardingWizard workspace={workspace} />;
}

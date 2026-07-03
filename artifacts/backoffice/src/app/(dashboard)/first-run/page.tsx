import Link from "next/link";
import {
  completeTenantFirstRunStep,
  getTenantFirstRunState,
  skipTenantFirstRun,
} from "@/app/actions/tenant-first-run";

export const metadata = {
  title: "Tenant onboarding",
};

const STEP_LABELS: Record<string, { title: string; href: string }> = {
  branding: { title: "Branding", href: "/instellingen/organisatie" },
  users: { title: "Gebruikers", href: "/instellingen/gebruikers" },
  sectors: { title: "Sectoren", href: "/instellingen/sectoren" },
  modules: { title: "Modules", href: "/platform" },
};

function StepRow({
  step,
  done,
}: {
  step: string;
  done: boolean;
}) {
  const meta = STEP_LABELS[step] ?? { title: step, href: "/" };

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-950">{meta.title}</p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          {done ? "Afgerond" : "Open"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={meta.href} className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700">
          Openen
        </Link>
        {!done && (
          <form action={completeTenantFirstRunStep}>
            <input type="hidden" name="step" value={step} />
            <button type="submit" className="rounded bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white">
              Markeer gereed
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default async function FirstRunPage() {
  const state = await getTenantFirstRunState();
  const completed = new Set(state.completedSteps);
  const remaining = state.requiredSteps.filter((step) => !completed.has(step)).length;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6 text-slate-950">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm font-medium text-slate-500">Fieldgrid</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">Tenant onboarding</h1>
        <p className="mt-2 text-sm text-slate-500">
          {state.status === "completed"
            ? "Alle basisstappen zijn afgerond."
            : `${remaining} basisstap${remaining === 1 ? "" : "pen"} open.`}
        </p>
      </header>

      <section className="grid gap-3">
        {state.requiredSteps.map((step) => (
          <StepRow key={step} step={step} done={completed.has(step)} />
        ))}
      </section>

      {state.status !== "completed" && state.status !== "skipped" && (
        <form action={skipTenantFirstRun} className="flex justify-end">
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
            Overslaan
          </button>
        </form>
      )}
    </main>
  );
}

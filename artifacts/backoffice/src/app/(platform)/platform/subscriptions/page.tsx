import Link from "next/link";
import { AlertTriangle, Building2, CheckCircle2, CreditCard, ShieldCheck, UsersRound, type LucideIcon } from "lucide-react";
import {
  listPlatformSubscriptionDashboard,
  updatePlatformTenantPlan,
  updatePlatformTenantSubscription,
  type PlatformSubscriptionListRow,
} from "@/app/actions/platform-tenants";

export const metadata = {
  title: "Subscriptions",
};

async function updateSubscriptionFormAction(formData: FormData): Promise<void> {
  "use server";
  await updatePlatformTenantSubscription(formData);
}

async function updateTenantPlanFormAction(formData: FormData): Promise<void> {
  "use server";
  await updatePlatformTenantPlan(formData);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function dateTimeLocalValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function statusTone(status: string): "neutral" | "good" | "warning" | "danger" {
  if (status === "active") return "good";
  if (status === "trial" || status === "past_due") return "warning";
  if (status === "canceled" || status === "expired") return "danger";
  return "neutral";
}

function statusChipClass(tone: "neutral" | "good" | "warning" | "danger"): string {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{value}</p>
    </div>
  );
}

function SubscriptionCard({
  subscription,
  planOptions,
}: {
  subscription: PlatformSubscriptionListRow;
  planOptions: Array<{ id: string; key: string; name: string; customDomains: boolean }>;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/platform/tenants/${subscription.tenantId}`} className="break-words text-base font-semibold text-slate-950 underline-offset-2 hover:underline">
              {subscription.tenantName}
            </Link>
            <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(statusTone(subscription.status))}`}>
              {subscription.status}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
              {subscription.planName}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {subscription.tenantSlug} - {subscription.source} - bijgewerkt {formatDate(subscription.updatedAt)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Periode {formatDate(subscription.currentPeriodStartsAt)} tot {formatDate(subscription.currentPeriodEndsAt)}
          </p>
          {subscription.downgradeImpact && (
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {subscription.downgradeImpact}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-4 lg:min-w-[420px]">
          <div className="rounded bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase text-slate-500">Tenant</p>
            <p className="mt-1 font-medium text-slate-950">{subscription.tenantStatus}</p>
          </div>
          <div className="rounded bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase text-slate-500">Custom</p>
            <p className="mt-1 font-medium text-slate-950">{subscription.customDomainCount}</p>
          </div>
          <div className="rounded bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase text-slate-500">Actief</p>
            <p className="mt-1 font-medium text-slate-950">{subscription.activeCustomDomainCount}</p>
          </div>
          <div className="rounded bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase text-slate-500">Ref</p>
            <p className="mt-1 truncate font-medium text-slate-950">{subscription.billingReference ?? "-"}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <form action={updateTenantPlanFormAction} className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3">
          <input type="hidden" name="tenantId" value={subscription.tenantId} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Plan
            <select name="planKey" defaultValue={subscription.planKey} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
              {planOptions.map((plan) => (
                <option key={plan.id} value={plan.key}>
                  {plan.name}{plan.customDomains ? " - custom domains" : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-10 rounded bg-slate-950 px-4 text-sm font-semibold text-white">
            Plan wijzigen
          </button>
        </form>

        <form action={updateSubscriptionFormAction} className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 md:grid-cols-[160px_190px_minmax(0,1fr)_auto] md:items-end">
          <input type="hidden" name="subscriptionId" value={subscription.id} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Status
            <select name="status" defaultValue={subscription.status} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
              <option value="trial">trial</option>
              <option value="active">active</option>
              <option value="past_due">past_due</option>
              <option value="canceled">canceled</option>
              <option value="expired">expired</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Periode-einde
            <input name="currentPeriodEndsAt" type="datetime-local" defaultValue={dateTimeLocalValue(subscription.currentPeriodEndsAt)} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Billing referentie
            <input name="billingReference" defaultValue={subscription.billingReference ?? ""} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <button type="submit" className="h-10 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800">
            Opslaan
          </button>
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-4">
            Manual billing notes
            <textarea name="manualBillingNotes" defaultValue={subscription.manualBillingNotes ?? ""} rows={2} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
        </form>
      </div>
    </div>
  );
}

export default async function PlatformSubscriptionsPage() {
  const dashboard = await listPlatformSubscriptionDashboard();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Trial" value={dashboard.stats.trial} icon={CreditCard} />
        <Stat label="Active" value={dashboard.stats.active} icon={CheckCircle2} />
        <Stat label="Past due" value={dashboard.stats.pastDue} icon={AlertTriangle} />
        <Stat label="Canceled" value={dashboard.stats.canceled} icon={UsersRound} />
        <Stat label="Expired" value={dashboard.stats.expired} icon={ShieldCheck} />
      </div>

      <section className="rounded border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Plans</h2>
            <p className="mt-1 text-sm text-slate-500">Starter, Professional en Enterprise met modules, limits en supportniveau.</p>
          </div>
          <span className="rounded border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
            {dashboard.stats.totalSubscriptions} subscriptions
          </span>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {dashboard.plans.map((plan) => (
            <div key={plan.id} className="rounded border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">{plan.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{plan.description ?? "Geen omschrijving"}</p>
                </div>
                <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(plan.isActive ? "good" : "neutral")}`}>
                  {plan.isActive ? "Actief" : "Uit"}
                </span>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-600">
                <p><span className="font-medium text-slate-950">Support:</span> {plan.supportLevel} - {plan.supportDescription ?? "geen omschrijving"}</p>
                <p><span className="font-medium text-slate-950">Modules:</span> {plan.moduleCount}</p>
                <p><span className="font-medium text-slate-950">Max seats:</span> {plan.maxSeats ?? "contractueel"}</p>
                <p><span className="font-medium text-slate-950">Limits:</span> {plan.limitSummary ?? "geen"}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(plan.customRoles ? "good" : "neutral")}`}>
                  custom roles {plan.customRoles ? "aan" : "uit"}
                </span>
                <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(plan.customDomains ? "good" : "neutral")}`}>
                  custom domains {plan.customDomains ? "aan" : "uit"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded bg-slate-50 px-2 py-2">
                  <p className="font-semibold text-slate-950">{plan.trialSubscriptions}</p>
                  <p className="text-xs text-slate-500">trial</p>
                </div>
                <div className="rounded bg-slate-50 px-2 py-2">
                  <p className="font-semibold text-slate-950">{plan.activeSubscriptions}</p>
                  <p className="text-xs text-slate-500">active</p>
                </div>
                <div className="rounded bg-slate-50 px-2 py-2">
                  <p className="font-semibold text-slate-950">{plan.pastDueSubscriptions}</p>
                  <p className="text-xs text-slate-500">past due</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Tenant subscriptions</h2>
            <p className="mt-1 text-sm text-slate-500">Status, planwissel, periode en manual billing per tenant.</p>
          </div>
          <Building2 className="hidden h-5 w-5 text-slate-400 sm:block" />
        </div>
        <div className="grid gap-3">
          {dashboard.subscriptions.map((subscription) => (
            <SubscriptionCard key={subscription.id} subscription={subscription} planOptions={dashboard.plans} />
          ))}
          {dashboard.subscriptions.length === 0 && (
            <p className="rounded border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Geen subscriptions gevonden.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

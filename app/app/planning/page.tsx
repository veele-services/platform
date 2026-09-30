import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanboard, getPlanningShellData } from "@/lib/planning/data";
import { tenantToday, validDay } from "@/lib/planning/time";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { DayPlanboard } from "@/components/fieldgrid/planboard/day-planboard";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; order?: string }>;
}) {
  const context = await getAuthContext();
  if (!context.tenant) redirect(context.isPlatformAdmin ? "/platform" : "/app");
  if (
    !context.tenant.enabledServices.includes("planning") ||
    !context.tenant.roles.some((r) =>
      ["tenant_admin", "management", "planner"].includes(r),
    )
  )
    notFound();
  const query = await searchParams;
  const today = tenantToday(context.tenant.timezone);
  const day = validDay(query.day) ? query.day : today;
  const [data, shell] = await Promise.all([
    getPlanboard(context.tenant.id, {
      day,
      view: "unassigned",
      search: "",
      status: "",
      page: 1,
    }),
    getPlanningShellData(context.tenant.id),
  ]);
  return (
    <BackofficeShell
      context={{ ...context, tenant: context.tenant }}
      data={shell}
      initialView="planning"
    >
      <DayPlanboard
        key={`${context.tenant.id}:${context.user.id}`}
        initial={data}
        userId={context.user.id}
        tenant={context.tenant}
        initialOrder={query.order}
      />
    </BackofficeShell>
  );
}

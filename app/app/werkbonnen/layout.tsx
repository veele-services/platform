import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";

export default async function WorkOrdersLayout({ children }: { children: ReactNode }) {
  const context = await getAuthContext();
  if (!context.tenant?.enabledServices.includes("planning") || !context.tenant.roles.some(r => ["tenant_admin", "management", "planner", "finance"].includes(r))) notFound();
  const shell = await getPlanningShellData(context.tenant.id);
  return <BackofficeShell context={{ ...context, tenant: context.tenant }} data={shell} initialView="werkbonnen">{children}</BackofficeShell>;
}

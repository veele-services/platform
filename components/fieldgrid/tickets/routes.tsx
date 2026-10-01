import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import { getTicketAccess, getTicketDetail, getTicketList, getTicketOptions, getTicketSettings } from "@/lib/tickets/data";
import { ticketPaths, ticketQueryFromSearch, type TicketWorkspace } from "@/lib/tickets/model";
import { BackofficeShell } from "@/components/fieldgrid/backoffice-shell";
import { TicketStandaloneShell } from "./shell";
import { TicketList } from "./list";
import { TicketDetailPage } from "./detail";
import { TicketSettingsPage } from "./settings";
import "./tickets.css";

export type TicketSearch = Record<string, string | string[] | undefined>;
export async function TicketRouteLayout({ workspace, children }: { workspace: TicketWorkspace; children: ReactNode }) {
  const access = await getTicketAccess(workspace);
  if (!access.allowed && !access.canConfigure && !access.canDelegate) notFound();
  if (workspace === "platform") {
    const context = await getAuthContext();
    return <TicketStandaloneShell access={access} canPlatformAdmin={context.isPlatformAdmin}>{children}</TicketStandaloneShell>;
  }
  const context = await getAuthContext();
  if (!context.tenant || context.tenant.id !== access.tenant?.id) notFound();
  const shell = await getPlanningShellData(context.tenant.id);
  if (workspace === "staff") return <TicketStandaloneShell access={access} logoUrl={shell.brandingLogoUrl}>{children}</TicketStandaloneShell>;
  return <BackofficeShell context={{ ...context, tenant: context.tenant }} data={shell} initialView={workspace === "tenant" ? "meldingen" : "support"}>{children}</BackofficeShell>;
}
export async function TicketIndexRoute({ workspace, searchParams }: { workspace: TicketWorkspace; searchParams: Promise<TicketSearch> }) {
  const access = await getTicketAccess(workspace);
  if (!access.allowed) {
    if (access.canConfigure || access.canDelegate) redirect(`${ticketPaths[workspace]}/instellingen`);
    notFound();
  }
  const raw = await searchParams;
  let query;
  try { query = ticketQueryFromSearch(raw); } catch { return <section className="ticket-panel"><h1>Controleer de ticketfilters</h1><p className="ticket-error" role="alert">Een filter of paginanummer is ongeldig.</p><Link className="secondary-button" href={ticketPaths[workspace]}>Filters herstellen</Link></section>; }
  const [data, options] = await Promise.all([getTicketList(workspace, query), getTicketOptions(workspace)]);
  return <TicketList access={access} data={data} options={options} query={query} create={raw.new === "1"} contextId={query.contextId}/>;
}
export async function TicketDetailRoute({ workspace, params, searchParams }: { workspace: TicketWorkspace; params: Promise<{ id: string }>; searchParams: Promise<TicketSearch> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const access = await getTicketAccess(workspace);
  if (!access.allowed) notFound();
  const [data, options, raw] = await Promise.all([getTicketDetail(workspace, id), getTicketOptions(workspace), searchParams]);
  if (!data) notFound();
  return <TicketDetailPage access={access} data={data} options={options} back={typeof raw.return === "string" ? raw.return : undefined} initialAction={typeof raw.action === "string" ? raw.action : undefined}/>;
}
export async function TicketSettingsRoute({ workspace }: { workspace: TicketWorkspace }) {
  const access = await getTicketAccess(workspace);
  if (!access.allowed && !access.canConfigure && !access.canDelegate) notFound();
  const data = await getTicketSettings(workspace);
  return <TicketSettingsPage access={access} data={data}/>;
}

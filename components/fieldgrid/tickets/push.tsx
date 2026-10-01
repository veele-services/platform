"use client";
import type { TicketWorkspace } from "@/lib/tickets/model";
import { NotificationPushControl } from "@/components/fieldgrid/notifications/push";
export function TicketPushControl({ workspace }: { workspace: TicketWorkspace }) { return <NotificationPushControl workspace={workspace === "tenant" || workspace === "support" ? "backoffice" : workspace}/>; }

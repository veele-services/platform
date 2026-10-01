import type { ReactNode } from "react";
import { TicketRouteLayout } from "@/components/fieldgrid/tickets/routes";
export default function Layout({ children }: { children: ReactNode }) { return <TicketRouteLayout workspace="platform">{children}</TicketRouteLayout>; }

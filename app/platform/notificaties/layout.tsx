import type { ReactNode } from "react";
import { NotificationRouteLayout } from "@/components/fieldgrid/notifications/routes";
export default function Layout({ children }: { children: ReactNode }) { return <NotificationRouteLayout workspace="platform">{children}</NotificationRouteLayout>; }

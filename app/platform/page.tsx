import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getPlatformData } from "@/lib/platform/data";
import { PlatformConsole } from "./platform-console";
import "./platform.css";
import { getTicketAccess } from "@/lib/tickets/data";
import { getNotificationAccess } from "@/lib/notifications/data";

export const metadata: Metadata = { title: "Platformbeheer" };

export default async function PlatformPage() {
  const context = await getAuthContext();
  if (!context.isPlatformAdmin) {
    const access = await getTicketAccess("platform");
    if (access.allowed || access.canConfigure || access.canDelegate) redirect("/platform/support");
    if ((await getNotificationAccess("platform")).allowed) redirect("/platform/notificaties");
    redirect("/login");
  }
  const data = await getPlatformData();
  return <PlatformConsole initialData={data} />;
}

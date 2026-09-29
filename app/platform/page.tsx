import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getPlatformData } from "@/lib/platform/data";
import { PlatformConsole } from "./platform-console";
import "./platform.css";

export const metadata: Metadata = { title: "Platformbeheer" };

export default async function PlatformPage() {
  const context = await getAuthContext();
  if (!context.isPlatformAdmin) redirect("/app");
  const data = await getPlatformData();
  return <PlatformConsole initialData={data} />;
}

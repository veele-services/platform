import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getAuthContext } from "@/lib/auth/context";
import { HOST_KIND_HEADER } from "@/lib/tenancy/hostname";
import { CRM } from "@/components/fieldgrid/crm/CRM";
import "@/components/fieldgrid/crm/shared-presentation.css";

export const metadata: Metadata = { title: "CRM & aanvragen", robots: { index: false, follow: false } };
export default async function CrmPage() {
  const context = await getAuthContext();
  if (!context.isPlatformAdmin || (await headers()).get(HOST_KIND_HEADER) !== "platform") notFound();
  return <CRM />;
}

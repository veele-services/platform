import type { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasManagementPermission, permissionForPath } from "@/lib/management/model";

export default async function BackofficeLayout({ children }: { children: ReactNode }) {
  const context = await getAuthContext();
  const pathname = (await headers()).get("x-fieldgrid-pathname") ?? "/app";
  const permission = permissionForPath(pathname);
  if (context.tenant && (!hasManagementPermission(context.tenant, "backoffice.access") || permission && !hasManagementPermission(context.tenant, permission))) notFound();
  return children;
}

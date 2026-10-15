import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { productSnapshot, getProductActor } from "@/lib/product/data";
import { type ProductSection } from "@/lib/product/model";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import { getCustomerPortal } from "@/lib/customer-portal/data";
import { BackofficeShell } from "../backoffice-shell";
import { StaffRouteShell } from "../staff/route-shell";
import { createClient } from "@/lib/supabase/server";
import { ProductHub } from "./hub";
import {customerContentHref} from "@/lib/customer-portal/content-href";
import {CustomerInformationShell} from "../customer-portal/shell";
import type { ProductWorkspace } from "@/lib/product/model";
import "./product.css";
export async function ProductPage({
  workspace,
  searchParams,
}: {
  workspace: ProductWorkspace;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const account=workspace==="customer"?z.uuid().optional().safeParse(raw.account):{success:true as const,data:undefined};
  if(!account.success)notFound();
  let selection:
    | {
        section: ProductSection;
        id: string;
      }
    | undefined;
  for (const [key, section] of [
    ["idea", "ideas"],
    ["roadmap", "roadmap"],
    ["release", "releases"],
  ] as const) {
    if (raw[key]) {
      const id = z.uuid().safeParse(raw[key]);
      if (!id.success) notFound();
      selection = { section, id: id.data };
    }
  }
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    redirect(
      `/login?next=${encodeURIComponent(workspace === "platform" ? "/platform/productbeheer" : workspace === "backoffice" ? "/app/updates" : workspace === "staff" ? "/staff/updates" : customerContentHref("/klant/updates",account.data))}`,
    );
  let snapshot: Awaited<ReturnType<typeof productSnapshot>>;
  try {
    snapshot = await productSnapshot(workspace);
  } catch (error) {
    if (
      (
        error as {
          code?: string;
        }
      ).code === "42501"
    )
      notFound();
    throw error;
  }
  const content = (
    <ProductHub
      key={snapshot.actorKey}
      snapshot={snapshot}
      initialSelection={selection}
    />
  );
  if (workspace === "platform") return content;
  if (workspace === "staff")
    return <StaffRouteShell active="updates">{content}</StaffRouteShell>;
  if (workspace === "backoffice") {
    const context = await getAuthContext();
    if (!context.tenant) notFound();
    return (
      <BackofficeShell
        context={{ ...context, tenant: context.tenant }}
        data={await getPlanningShellData(context.tenant.id)}
        initialView="updates"
        presentation="sites-management"
      >
        {content}
      </BackofficeShell>
    );
  }
  return <CustomerProductFrame account={account.data}>{content}</CustomerProductFrame>;
}
export async function CustomerProductFrame({children,active="updates",account}:{children:ReactNode;active?:"knowledge"|"updates";account?:string}) {
 const [identity,actor]=await Promise.all([getCustomerPortal(account),getProductActor("customer")]);
 const workspace=identity.workspace;if(!workspace||!actor.tenantId)redirect("/klant");
 return <CustomerInformationShell workspace={workspace} tenantId={actor.tenantId} active={active}>{children}</CustomerInformationShell>;
}

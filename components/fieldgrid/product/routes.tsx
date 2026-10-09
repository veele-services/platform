import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { productSnapshot, getProductActor } from "@/lib/product/data";
import { type ProductSection } from "@/lib/product/model";
import { getAuthContext } from "@/lib/auth/context";
import { getPlanningShellData } from "@/lib/planning/data";
import { getCustomerPortal } from "@/lib/customer-portal/data";
import { BackofficeShell } from "../backoffice-shell";
import { StaffRouteShell } from "../staff/route-shell";
import { FieldgridBrand } from "../brand";
import { TenantThemeProvider } from "../tenant-theme";
import { AccountMenu } from "../account-menu";
import { brandThemeStyle } from "@/lib/branding/palette";
import { createClient } from "@/lib/supabase/server";
import { ProductHub } from "./hub";
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
      `/login?next=${encodeURIComponent(workspace === "platform" ? "/platform/productbeheer" : workspace === "backoffice" ? "/app/updates" : workspace === "staff" ? "/staff/updates" : "/klant/updates")}`,
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
      >
        {content}
      </BackofficeShell>
    );
  }
  return <CustomerProductFrame>{content}</CustomerProductFrame>;
}
async function CustomerProductFrame({ children }: { children: ReactNode }) {
  const [identity, actor] = await Promise.all([
    getCustomerPortal(),
    getProductActor("customer"),
  ]);
  const workspace = identity.workspace;
  if (!workspace) redirect("/klant");
  const tenant = workspace.tenant;
  return (
    <TenantThemeProvider
      primary={tenant.primaryColor}
      accent={tenant.accentColor}
    >
      <div style={brandThemeStyle(tenant.primaryColor, tenant.accentColor)}>
        <header className="product-customer-header">
          <FieldgridBrand
            tenantName={tenant.name}
            logoUrl={
              tenant.hasLogo
                ? `/api/branding/${actor.tenantId}/email-logo`
                : null
            }
          />
          <nav>
            <Link href="/klant">Mijn klantomgeving</Link>
            <Link href="/klant/notificaties">Notificaties</Link>
            <AccountMenu
              name={workspace.profile.fullName}
              email={workspace.profile.email}
              role="Klant"
              profileHref="/klant?view=profile"
            />
          </nav>
        </header>
        <main className="product-customer-shell">{children}</main>
      </div>
    </TenantThemeProvider>
  );
}

"use server";

import {
  createWebsitePage,
  getWebsiteAdminOverview,
  getWebsitePage,
  getWebsiteSettings,
  initializeManagedWebsite,
  listWebsitePages,
  updateWebsitePage,
  updateWebsiteSettings,
  type WebsitePageDraft,
  type WebsiteSiteSettings,
} from "@workspace/db";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requirePermission } from "@/lib/auth/permissions";
import {
  getCurrentBackofficeUser,
  requireCurrentTenantId,
} from "@/lib/auth/tenant";
import type { ActionResult } from "./customers";

async function requireActorId(): Promise<string> {
  const user = await getCurrentBackofficeUser();
  if (!user) throw new Error("Niet aangemeld");
  return user.id;
}

function actionError(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return {
      success: false,
      message: first?.message ?? "Controleer de ingevulde websitegegevens.",
      fieldErrors: Object.fromEntries(
        error.issues
          .filter((issue) => issue.path.length > 0)
          .map((issue) => [issue.path.join("."), issue.message]),
      ),
    };
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  ) {
    return {
      success: false,
      message:
        "Deze websitewaarde bestaat al. Controleer vooral het publieke paginapad.",
    };
  }
  return {
    success: false,
    message:
      error instanceof Error
        ? error.message
        : "De websitewijziging kon niet worden opgeslagen.",
  };
}

export async function getWebsiteOverviewAction() {
  await requirePermission("website", "read");
  const tenantId = await requireCurrentTenantId();
  return getWebsiteAdminOverview(tenantId);
}

export async function getWebsiteSettingsAction() {
  await requirePermission("website_settings", "read");
  const tenantId = await requireCurrentTenantId();
  return getWebsiteSettings(tenantId);
}

export async function getWebsitePagesAction() {
  await requirePermission("website_pages", "read");
  const tenantId = await requireCurrentTenantId();
  return listWebsitePages(tenantId);
}

export async function getWebsitePageAction(pageId: string) {
  await requirePermission("website_pages", "read");
  const tenantId = await requireCurrentTenantId();
  return getWebsitePage(tenantId, pageId);
}

export async function initializeWebsiteAction(
  settings: WebsiteSiteSettings,
): Promise<ActionResult<{ siteId: string }>> {
  try {
    await requirePermission("website_settings", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const result = await initializeManagedWebsite({
      tenantId,
      actorUserId,
      settings,
    });
    revalidatePath("/website");
    revalidatePath("/website/settings");
    revalidatePath("/website/pages");
    return { success: true, data: { siteId: result.siteId } };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateWebsiteSettingsAction(input: {
  siteId: string;
  expectedAuthoringRevision: number;
  settings: WebsiteSiteSettings;
}): Promise<ActionResult<{ authoringRevision: number }>> {
  try {
    await requirePermission("website_settings", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const result = await updateWebsiteSettings({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidatePath("/website");
    revalidatePath("/website/settings");
    return {
      success: true,
      data: { authoringRevision: result.authoringRevision },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function createWebsitePageAction(input: {
  siteId: string;
  expectedAuthoringRevision: number;
  page: WebsitePageDraft;
}): Promise<ActionResult<{ pageId: string }>> {
  try {
    await requirePermission("website_pages", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const result = await createWebsitePage({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidatePath("/website");
    revalidatePath("/website/pages");
    return { success: true, data: { pageId: result.pageId } };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateWebsitePageAction(input: {
  siteId: string;
  pageId: string;
  expectedAuthoringRevision: number;
  expectedPageRevision: number;
  page: WebsitePageDraft;
}): Promise<
  ActionResult<{
    pageAuthoringRevision: number;
    siteAuthoringRevision: number;
  }>
> {
  try {
    await requirePermission("website_pages", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const result = await updateWebsitePage({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidatePath("/website");
    revalidatePath("/website/pages");
    revalidatePath(`/website/pages/${input.pageId}`);
    return {
      success: true,
      data: {
        pageAuthoringRevision: result.pageAuthoringRevision,
        siteAuthoringRevision: result.siteAuthoringRevision,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

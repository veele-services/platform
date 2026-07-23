"use server";

import {
  createWebsiteSection,
  createWebsitePage,
  createManagedWebsitePublication,
  createWebsitePreviewSession,
  activateManagedWebsitePublication,
  deleteWebsiteSection,
  getWebsiteAdminOverview,
  getWebsiteNavigation,
  getWebsitePage,
  getWebsitePublicationReview,
  getWebsiteRedirects,
  getWebsiteSettings,
  includeWebsitePageInPublication,
  initializeManagedWebsite,
  listWebsitePages,
  reorderWebsiteSections,
  replaceWebsiteNavigation,
  replaceWebsiteRedirects,
  updateWebsiteSection,
  updateWebsitePage,
  updateWebsiteSettings,
  type WebsitePageDraft,
  type WebsiteNavigationDraftItem,
  type WebsitePathChangeDecision,
  type WebsiteRedirectDraftItem,
  type WebsiteSection,
  type WebsiteSiteSettings,
} from "@workspace/db";
import {
  createWebsitePreviewToken,
  hashWebsitePreviewToken,
} from "@workspace/website-core/preview-token";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requirePermission } from "@/lib/auth/permissions";
import {
  getCurrentBackofficeUser,
  requireCurrentTenantId,
} from "@/lib/auth/tenant";
import { backofficePath } from "@/lib/backoffice-paths";
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

export async function getWebsiteNavigationAction() {
  await requirePermission("website_navigation", "read");
  const tenantId = await requireCurrentTenantId();
  return getWebsiteNavigation(tenantId);
}

export async function getWebsiteRedirectsAction() {
  await requirePermission("website_navigation", "read");
  const tenantId = await requireCurrentTenantId();
  return getWebsiteRedirects(tenantId);
}

export async function replaceWebsiteRedirectsAction(input: {
  siteId: string;
  expectedAuthoringRevision: number;
  redirects: WebsiteRedirectDraftItem[];
}): Promise<ActionResult<{ authoringRevision: number; changed: boolean }>> {
  try {
    await requirePermission("website_navigation", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const data = await replaceWebsiteRedirects({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidatePath("/website");
    revalidatePath("/website/pages");
    revalidatePath("/website/redirects");
    revalidatePath("/website/review");
    return { success: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function replaceWebsiteNavigationAction(input: {
  siteId: string;
  expectedAuthoringRevision: number;
  items: WebsiteNavigationDraftItem[];
}): Promise<ActionResult<{ authoringRevision: number; changed: boolean }>> {
  try {
    await requirePermission("website_navigation", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const data = await replaceWebsiteNavigation({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidatePath("/website");
    revalidatePath("/website/navigation");
    revalidatePath("/website/review");
    return { success: true, data };
  } catch (error) {
    return actionError(error);
  }
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
  pathChangeDecision: WebsitePathChangeDecision;
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
    revalidatePath("/website/redirects");
    revalidatePath("/website/review");
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

type SectionMutationResult = ActionResult<{
  sectionId?: string;
  sectionAuthoringRevision?: number;
  pageAuthoringRevision: number;
  siteAuthoringRevision: number;
}>;

function revalidateWebsitePage(pageId: string) {
  revalidatePath("/website");
  revalidatePath("/website/pages");
  revalidatePath(`/website/pages/${pageId}`);
}

function requirePreviewSigningSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is niet ingesteld");
  return secret;
}

export async function getWebsitePublicationReviewAction(siteId: string) {
  await requirePermission("website_pages", "read");
  const tenantId = await requireCurrentTenantId();
  return getWebsitePublicationReview({ tenantId, siteId });
}

export async function createWebsitePreviewAction(input: {
  siteId: string;
  expectedAuthoringRevision: number;
}): Promise<
  ActionResult<{
    url: string;
    expiresAt: string;
    sourceRevision: number;
  }>
> {
  try {
    await requirePermission("website_pages", "read");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const token = createWebsitePreviewToken(requirePreviewSigningSecret());
    const preview = await createWebsitePreviewSession({
      tenantId,
      actorUserId,
      siteId: input.siteId,
      expectedAuthoringRevision: input.expectedAuthoringRevision,
      tokenHash: hashWebsitePreviewToken(token),
    });
    return {
      success: true,
      data: {
        url: backofficePath(`/website-preview/${token}`),
        expiresAt: preview.expiresAt,
        sourceRevision: preview.sourceRevision,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function includeWebsitePageInPublicationAction(input: {
  siteId: string;
  pageId: string;
  expectedAuthoringRevision: number;
  expectedPageRevision: number;
}): Promise<
  ActionResult<{
    pageAuthoringRevision: number;
    siteAuthoringRevision: number;
  }>
> {
  try {
    await requirePermission("website_pages", "publish");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const data = await includeWebsitePageInPublication({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidateWebsitePage(input.pageId);
    revalidatePath("/website/review");
    return { success: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function prepareWebsitePublicationAction(input: {
  siteId: string;
  expectedAuthoringRevision: number;
}): Promise<
  ActionResult<{
    publicationId: string;
    sequence: number;
    sourceRevision: number;
    targetDeliveryRevision: number;
    contentHash: string;
  }>
> {
  try {
    await requirePermission("website_pages", "publish");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const review = await getWebsitePublicationReview({
      tenantId,
      siteId: input.siteId,
    });
    if (
      review.authoringRevision !== input.expectedAuthoringRevision ||
      !review.canPreparePublication
    ) {
      throw new Error(
        "De review is verouderd of bevat blokkerende diagnostiek. Laad opnieuw.",
      );
    }
    const candidate = await createManagedWebsitePublication({
      tenantId,
      actorUserId,
      siteId: input.siteId,
      expectedAuthoringRevision: input.expectedAuthoringRevision,
      reason: "Backoffice Phase 3C immutable publicatiereview",
    });
    revalidatePath("/website");
    revalidatePath("/website/review");
    return {
      success: true,
      data: {
        publicationId: candidate.id,
        sequence: candidate.sequence,
        sourceRevision: candidate.sourceRevision,
        targetDeliveryRevision: candidate.targetDeliveryRevision,
        contentHash: candidate.contentHash,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function activateWebsitePublicationAction(input: {
  siteId: string;
  publicationId: string;
  expectedAuthoringRevision: number;
  expectedDeliveryRevision: number;
  confirmation: "PUBLICEREN";
}): Promise<
  ActionResult<{
    publicationId: string;
    deliveryRevision: number;
    deliveryMode: "managed_cms";
    status: string;
  }>
> {
  try {
    await requirePermission("website_pages", "publish");
    if (input.confirmation !== "PUBLICEREN") {
      throw new Error("Expliciete publicatiebevestiging ontbreekt");
    }
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const review = await getWebsitePublicationReview({
      tenantId,
      siteId: input.siteId,
    });
    const candidate = review.readyPublication;
    if (
      review.deliveryMode !== "managed_cms" ||
      review.authoringRevision !== input.expectedAuthoringRevision ||
      review.deliveryRevision !== input.expectedDeliveryRevision ||
      !candidate ||
      candidate.id !== input.publicationId ||
      candidate.sourceRevision !== input.expectedAuthoringRevision ||
      candidate.targetDeliveryRevision !== input.expectedDeliveryRevision + 1
    ) {
      throw new Error(
        "De publicatiekandidaat is niet meer exact actueel. Review opnieuw.",
      );
    }
    const activation = await activateManagedWebsitePublication({
      tenantId,
      actorUserId,
      siteId: input.siteId,
      publicationId: input.publicationId,
      expectedAuthoringRevision: input.expectedAuthoringRevision,
      expectedDeliveryRevision: input.expectedDeliveryRevision,
      reason: "Backoffice Phase 3C expliciet gereviewde publicatie",
    });
    revalidatePath("/website");
    revalidatePath("/website/review");
    revalidatePath("/website/pages");
    return {
      success: true,
      data: {
        publicationId: activation.publicationId,
        deliveryRevision: activation.deliveryRevision,
        deliveryMode: activation.deliveryMode,
        status: activation.status,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function createWebsiteSectionAction(input: {
  siteId: string;
  pageId: string;
  expectedAuthoringRevision: number;
  expectedPageRevision: number;
  section: WebsiteSection;
}): Promise<SectionMutationResult> {
  try {
    await requirePermission("website_pages", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const data = await createWebsiteSection({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidateWebsitePage(input.pageId);
    return { success: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateWebsiteSectionAction(input: {
  siteId: string;
  pageId: string;
  expectedAuthoringRevision: number;
  expectedPageRevision: number;
  expectedSectionRevision: number;
  section: WebsiteSection;
}): Promise<SectionMutationResult> {
  try {
    await requirePermission("website_pages", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const data = await updateWebsiteSection({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidateWebsitePage(input.pageId);
    return { success: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function reorderWebsiteSectionsAction(input: {
  siteId: string;
  pageId: string;
  expectedAuthoringRevision: number;
  expectedPageRevision: number;
  sectionIds: string[];
}): Promise<SectionMutationResult> {
  try {
    await requirePermission("website_pages", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const data = await reorderWebsiteSections({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidateWebsitePage(input.pageId);
    return { success: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteWebsiteSectionAction(input: {
  siteId: string;
  pageId: string;
  expectedAuthoringRevision: number;
  expectedPageRevision: number;
  sectionId: string;
  expectedSectionRevision: number;
}): Promise<SectionMutationResult> {
  try {
    await requirePermission("website_pages", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const data = await deleteWebsiteSection({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidateWebsitePage(input.pageId);
    return { success: true, data };
  } catch (error) {
    return actionError(error);
  }
}

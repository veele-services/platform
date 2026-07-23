"use server";

import {
  convertWebsiteSubmissionToLead,
  createWebsiteForm,
  getWebsiteForms,
  getWebsiteSubmission,
  getWebsiteSubmissions,
  redactWebsiteSubmission,
  retryWebsiteSubmissionNotification,
  transitionWebsiteSubmission,
  updateWebsiteForm,
  type WebsiteFormDraft,
  type WebsiteFormSubmissionStatus,
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
    return {
      success: false,
      message:
        error.issues[0]?.message ??
        "Controleer de ingevulde formuliergegevens.",
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
      message: "Deze formuliercode bestaat al in deze taal.",
    };
  }
  return {
    success: false,
    message:
      error instanceof Error
        ? error.message
        : "De formulieractie kon niet worden uitgevoerd.",
  };
}

function revalidateSubmission(submissionId?: string) {
  revalidatePath("/website/submissions");
  if (submissionId) {
    revalidatePath(`/website/submissions/${submissionId}`);
  }
}

export async function getWebsiteFormsAction() {
  await requirePermission("website_forms", "read");
  return getWebsiteForms(await requireCurrentTenantId());
}

export async function createWebsiteFormAction(input: {
  siteId: string;
  expectedAuthoringRevision: number;
  form: WebsiteFormDraft;
}): Promise<
  ActionResult<{
    id: string;
    formAuthoringRevision: number;
    siteAuthoringRevision: number;
  }>
> {
  try {
    await requirePermission("website_forms", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const result = await createWebsiteForm({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidatePath("/website");
    revalidatePath("/website/forms");
    revalidatePath("/website/review");
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateWebsiteFormAction(input: {
  siteId: string;
  expectedAuthoringRevision: number;
  formId: string;
  expectedFormRevision: number;
  form: WebsiteFormDraft;
}): Promise<
  ActionResult<{
    formAuthoringRevision: number;
    siteAuthoringRevision: number;
  }>
> {
  try {
    await requirePermission("website_forms", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const result = await updateWebsiteForm({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidatePath("/website");
    revalidatePath("/website/forms");
    revalidatePath("/website/review");
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function getWebsiteSubmissionsAction(input?: {
  status?: WebsiteFormSubmissionStatus;
  limit?: number;
}) {
  await requirePermission("website_submissions", "read");
  return getWebsiteSubmissions(await requireCurrentTenantId(), input);
}

export async function getWebsiteSubmissionAction(submissionId: string) {
  await requirePermission("website_submissions", "read");
  return getWebsiteSubmission(await requireCurrentTenantId(), submissionId);
}

export async function transitionWebsiteSubmissionAction(input: {
  submissionId: string;
  status: "read" | "in_progress" | "archived" | "spam";
}): Promise<ActionResult<{ status: WebsiteFormSubmissionStatus }>> {
  try {
    await requirePermission("website_submissions", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const result = await transitionWebsiteSubmission({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidateSubmission(input.submissionId);
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function convertWebsiteSubmissionToLeadAction(input: {
  submissionId: string;
}): Promise<ActionResult<{ customerId: string; created: boolean }>> {
  try {
    await Promise.all([
      requirePermission("website_submissions", "write"),
      requirePermission("customers", "write"),
    ]);
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const result = await convertWebsiteSubmissionToLead({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidateSubmission(input.submissionId);
    revalidatePath("/customers");
    revalidatePath(`/customers/${result.customerId}`);
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function retryWebsiteSubmissionNotificationAction(input: {
  submissionId: string;
}): Promise<
  ActionResult<{ result: "sent" | "failed" | "skipped" | "unchanged" }>
> {
  try {
    await requirePermission("website_submissions", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const result = await retryWebsiteSubmissionNotification({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidateSubmission(input.submissionId);
    return { success: true, data: { result } };
  } catch (error) {
    return actionError(error);
  }
}

export async function redactWebsiteSubmissionAction(input: {
  submissionId: string;
}): Promise<ActionResult<{ redacted: boolean }>> {
  try {
    await requirePermission("website_submissions", "write");
    const [tenantId, actorUserId] = await Promise.all([
      requireCurrentTenantId(),
      requireActorId(),
    ]);
    const result = await redactWebsiteSubmission({
      tenantId,
      actorUserId,
      ...input,
    });
    revalidateSubmission(input.submissionId);
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

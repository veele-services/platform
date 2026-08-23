"use server";

import {
  maskObjectSecurityEmail,
  markObjectSecurityChallengeDelivery,
  objectSecurityAuthSessionId,
  objectSecurityBusinessEmailRevision,
  issueManagementObjectSecurityChallenge,
  readManagementObjectSecurityRecords,
  revokeManagementObjectSecurityUnlock,
  verifyManagementObjectSecurityChallenge,
  type UnlockedObjectSecurityRecord,
} from "@workspace/db";
import { sendSensitiveOtpEmail } from "@workspace/db/email-service";
import { cookies, headers } from "next/headers";
import { z } from "zod/v4";

import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";

const objectIdSchema = z.string().uuid();
const challengeIdSchema = z.string().uuid();
const otpSchema = z.string().regex(/^\d{6}$/u);
const OBJECT_SECURITY_UNLOCK_COOKIE = "fg_object_security_unlock";

type ObjectSecurityActor = {
  tenantId: string;
  userId: string;
  email: string;
  businessEmailRevision: string;
  authSessionId: string;
  requestId: string | null;
};

export type ObjectSecurityAccessState = {
  maskedEmail: string;
  otpTtlMinutes: number;
};

export type RequestObjectSecurityOtpResult = {
  ok: boolean;
  challengeId?: string;
  maskedEmail?: string;
  expiresAt?: string;
  message: string;
};

export type VerifyObjectSecurityOtpResult = {
  ok: boolean;
  expiresAt?: string;
  message: string;
};

export type ReadObjectSecurityActionResult = {
  ok: boolean;
  records: UnlockedObjectSecurityRecord[];
  expiresAt?: string;
  message: string;
};

async function setUnlockCookie(handle: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OBJECT_SECURITY_UNLOCK_COOKIE, handle, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 10 * 60,
  });
}

async function clearUnlockCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OBJECT_SECURITY_UNLOCK_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 0,
  });
}

async function currentSecurityActor(): Promise<ObjectSecurityActor> {
  const tenantId = await requireCurrentTenantId();
  const supabase = await createClient();
  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  const user = userData.user;
  const session = sessionData.session;
  if (!user || !session || session.user.id !== user.id) {
    throw new Error("Uw sessie is verlopen. Meld u opnieuw aan.");
  }
  if (!user.email || !user.email_confirmed_at) {
    throw new Error("Een geverifieerd zakelijk e-mailadres is vereist.");
  }
  const requestHeaders = await headers();
  return {
    tenantId,
    userId: user.id,
    email: user.email.trim().toLowerCase(),
    businessEmailRevision: objectSecurityBusinessEmailRevision(user.email),
    authSessionId: objectSecurityAuthSessionId(session.access_token),
    requestId: requestHeaders.get("x-request-id"),
  };
}

export async function getObjectSecurityAccessState(): Promise<ObjectSecurityAccessState> {
  await requirePermission("object_security", "read");
  const actor = await currentSecurityActor();
  return { maskedEmail: maskObjectSecurityEmail(actor.email), otpTtlMinutes: 10 };
}

export async function requestObjectSecurityOtpAction(
  rawObjectId: string,
): Promise<RequestObjectSecurityOtpResult> {
  await requirePermission("object_security", "read");
  const parsedObjectId = objectIdSchema.safeParse(rawObjectId);
  if (!parsedObjectId.success) return { ok: false, message: "Ongeldig object." };
  const actor = await currentSecurityActor();
  const challenge = await issueManagementObjectSecurityChallenge({
    tenantId: actor.tenantId,
    userId: actor.userId,
    objectId: parsedObjectId.data,
    businessEmailRevision: actor.businessEmailRevision,
    requestId: actor.requestId,
  });
  if (challenge.status !== "issued") {
    const message = challenge.status === "cooldown"
      ? "Wacht even voordat u een nieuwe code aanvraagt."
      : challenge.status === "rate-limited"
        ? "Te veel aanvragen. Probeer het later opnieuw."
        : "Toegang tot dit object is niet toegestaan.";
    return { ok: false, message };
  }

  const delivery = await sendSensitiveOtpEmail({
    to: actor.email,
    code: challenge.code,
    tenantId: actor.tenantId,
  });
  await markObjectSecurityChallengeDelivery({
    tenantId: actor.tenantId,
    userId: actor.userId,
    objectId: parsedObjectId.data,
    challengeId: challenge.challengeId,
    delivered: delivery.success,
    requestId: actor.requestId,
  });
  if (!delivery.success) {
    return {
      ok: false,
      message: "De code kon niet veilig worden afgeleverd. De aanvraag is ongeldig gemaakt.",
    };
  }
  return {
    ok: true,
    challengeId: challenge.challengeId,
    maskedEmail: maskObjectSecurityEmail(actor.email),
    expiresAt: challenge.expiresAt.toISOString(),
    message: "De beveiligingscode is verzonden.",
  };
}

export async function verifyObjectSecurityOtpAction(input: {
  objectId: string;
  challengeId: string;
  code: string;
}): Promise<VerifyObjectSecurityOtpResult> {
  await requirePermission("object_security", "read");
  const parsed = z.object({
    objectId: objectIdSchema,
    challengeId: challengeIdSchema,
    code: otpSchema,
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Vul de zes cijfers van de code in." };
  const actor = await currentSecurityActor();
  const result = await verifyManagementObjectSecurityChallenge({
    tenantId: actor.tenantId,
    userId: actor.userId,
    objectId: parsed.data.objectId,
    challengeId: parsed.data.challengeId,
    code: parsed.data.code,
    businessEmailRevision: actor.businessEmailRevision,
    authSessionId: actor.authSessionId,
    requestId: actor.requestId,
  });
  if (result.state !== "valid") {
    const message = result.state === "expired"
      ? "De code is verlopen. Vraag een nieuwe code aan."
      : result.state === "too-many-attempts"
        ? "Te veel onjuiste pogingen. Vraag een nieuwe code aan."
        : result.state === "used"
          ? "Deze code is al gebruikt."
          : "De code is niet geldig.";
    return { ok: false, message };
  }
  await setUnlockCookie(result.handle);
  return {
    ok: true,
    expiresAt: result.absoluteExpiresAt.toISOString(),
    message: "Toegang ontgrendeld.",
  };
}

export async function readObjectSecurityRecordsAction(input: {
  objectId: string;
}): Promise<ReadObjectSecurityActionResult> {
  await requirePermission("object_security", "read");
  const parsed = z.object({ objectId: objectIdSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, records: [], message: "De ontgrendeling is ongeldig." };
  const cookieStore = await cookies();
  const handle = cookieStore.get(OBJECT_SECURITY_UNLOCK_COOKIE)?.value;
  if (!handle) return { ok: false, records: [], message: "Ontgrendel dit onderdeel opnieuw." };
  const actor = await currentSecurityActor();
  const result = await readManagementObjectSecurityRecords({
    tenantId: actor.tenantId,
    userId: actor.userId,
    objectId: parsed.data.objectId,
    handle,
    businessEmailRevision: actor.businessEmailRevision,
    authSessionId: actor.authSessionId,
    requestId: actor.requestId,
  });
  if (result.state !== "valid") {
    await clearUnlockCookie();
    return {
      ok: false,
      records: [],
      message: result.state === "expired"
        ? "De ontgrendeling is verlopen."
        : "De beveiligingscontext is gewijzigd. Ontgrendel opnieuw.",
    };
  }
  return {
    ok: true,
    records: result.records,
    expiresAt: result.expiresAt.toISOString(),
    message: result.records.length === 0
      ? "Er zijn geen actieve beveiligingsinstructies."
      : "Afgeschermde informatie geladen.",
  };
}

export async function lockObjectSecurityAction(input: {
  objectId: string;
}): Promise<void> {
  await requirePermission("object_security", "read");
  const parsed = z.object({ objectId: objectIdSchema }).safeParse(input);
  if (!parsed.success) return;
  const cookieStore = await cookies();
  const handle = cookieStore.get(OBJECT_SECURITY_UNLOCK_COOKIE)?.value;
  await clearUnlockCookie();
  if (!handle) return;
  const actor = await currentSecurityActor();
  await revokeManagementObjectSecurityUnlock({
    tenantId: actor.tenantId,
    userId: actor.userId,
    objectId: parsed.data.objectId,
    handle,
    requestId: actor.requestId,
  });
}

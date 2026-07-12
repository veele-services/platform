import { randomBytes, randomInt } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type PortalInviteType = "customer" | "personnel" | "tenant-admin" | "platform-admin";
export type TemporaryPasswordKind = "invite" | "reset_code";

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%*+-?";

function pick(chars: string): string {
  return chars[randomInt(chars.length)]!;
}

function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars;
}

export function generateTemporaryPassword(): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [
    pick(LOWER),
    pick(UPPER),
    pick(DIGITS),
    pick(SYMBOLS),
  ];

  while (chars.length < 16) {
    chars.push(pick(all));
  }

  return shuffle(chars).join("");
}

export function generatePasswordResetCode(): string {
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += String(randomInt(10));
  }
  return code;
}

function generateInternalAuthPassword(): string {
  return randomBytes(32).toString("base64url");
}

export function passwordResetCodeExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + 30 * 60 * 1000).toISOString();
}

export function isTemporaryPasswordExpired(appMetadata: Record<string, unknown> | null | undefined): boolean {
  const expiresAt = appMetadata?.["temporary_password_expires_at"];
  if (typeof expiresAt !== "string" || !expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  return Number.isFinite(expiry) && expiry <= Date.now();
}

function isEmailExistsError(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "email_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists");
}

export async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<User | null> {
  const normalized = email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error(error.message ?? "Supabase gebruiker zoeken mislukt.");
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }

  return null;
}

function temporaryPasswordAppMetadata(opts: {
  existing?: Record<string, unknown> | null;
  portal: PortalInviteType;
  kind: TemporaryPasswordKind;
  issuedAt: string;
  expiresAt?: string | null;
}): Record<string, unknown> {
  const appMetadata: Record<string, unknown> = {
    ...(opts.existing ?? {}),
    force_password_change: true,
    portal: opts.portal,
    temporary_password_issued_at: opts.issuedAt,
    temporary_password_kind: opts.kind,
  };

  if (opts.expiresAt) {
    appMetadata["temporary_password_expires_at"] = opts.expiresAt;
  } else {
    delete appMetadata["temporary_password_expires_at"];
  }

  return appMetadata;
}

export async function provisionPortalUserWithTemporaryPassword(opts: {
  email: string;
  fullName: string;
  portal: PortalInviteType;
  temporaryPassword?: string;
  temporaryPasswordKind?: TemporaryPasswordKind;
  expiresAt?: string | null;
  allowExistingActive?: boolean;
}): Promise<{ user: User; temporaryPassword: string; created: boolean }> {
  const admin = createAdminClient();
  const email = opts.email.trim().toLowerCase();
  const temporaryPassword = opts.temporaryPassword ?? generatePasswordResetCode();
  const internalAuthPassword = generateInternalAuthPassword();
  const issuedAt = new Date().toISOString();

  const appMetadata = temporaryPasswordAppMetadata({
    portal: opts.portal,
    kind: opts.temporaryPasswordKind ?? "invite",
    issuedAt,
    expiresAt: opts.expiresAt,
  });
  const userMetadata = {
    full_name: opts.fullName,
    name: opts.fullName,
  };

  const { data: createdData, error: createError } = await admin.auth.admin.createUser({
    email,
    password: internalAuthPassword,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  });

  if (!createError && createdData.user) {
    return { user: createdData.user, temporaryPassword, created: true };
  }

  if (!isEmailExistsError(createError)) {
    throw new Error(createError?.message ?? "Portaalgebruiker aanmaken mislukt.");
  }

  const existingUser = await findAuthUserByEmail(admin, email);
  if (!existingUser) {
    throw new Error("Er bestaat al een auth-account voor dit e-mailadres, maar deze kon niet worden opgehaald.");
  }

  const existingPortal = existingUser.app_metadata?.portal;
  if (existingPortal && existingPortal !== opts.portal && !opts.allowExistingActive) {
    throw new Error("Dit e-mailadres is al gekoppeld aan een ander portaalaccount.");
  }

  const existingAuthState = existingUser as User & {
    confirmed_at?: string | null;
    email_confirmed_at?: string | null;
    last_sign_in_at?: string | null;
  };
  const hasSignedIn = Boolean(existingAuthState.last_sign_in_at);
  const isPendingTemporaryPassword = existingUser.app_metadata?.force_password_change === true;
  const isLegacyPendingInvite =
    !existingPortal &&
    !hasSignedIn &&
    !existingAuthState.confirmed_at &&
    !existingAuthState.email_confirmed_at;

  if (!opts.allowExistingActive && !isPendingTemporaryPassword && !isLegacyPendingInvite) {
    throw new Error("Er bestaat al een actief account voor dit e-mailadres. Gebruik daarvoor een wachtwoord-reset.");
  }

  const { data: updatedData, error: updateError } = await admin.auth.admin.updateUserById(
    existingUser.id,
    {
      email_confirm: true,
      app_metadata: temporaryPasswordAppMetadata({
        existing: existingUser.app_metadata,
        portal: opts.portal,
        kind: opts.temporaryPasswordKind ?? "invite",
        issuedAt,
        expiresAt: opts.expiresAt,
      }),
      user_metadata: {
        ...(existingUser.user_metadata ?? {}),
        ...userMetadata,
      },
    },
  );

  if (updateError || !updatedData.user) {
    throw new Error(updateError?.message ?? "Portaalgebruiker bijwerken mislukt.");
  }

  return { user: updatedData.user, temporaryPassword, created: false };
}

export async function setExistingAuthUserTemporaryPassword(opts: {
  userId: string;
  email: string;
  fullName?: string | null;
  portal: PortalInviteType;
  temporaryPassword: string;
  temporaryPasswordKind: TemporaryPasswordKind;
  expiresAt?: string | null;
}): Promise<User> {
  const admin = createAdminClient();
  const { data: current, error: fetchError } = await admin.auth.admin.getUserById(opts.userId);
  if (fetchError || !current.user) {
    throw new Error(fetchError?.message ?? "Auth-gebruiker kon niet worden opgehaald.");
  }

  const issuedAt = new Date().toISOString();
  const fullName = opts.fullName?.trim() || current.user.user_metadata?.["full_name"] || current.user.email || opts.email;
  const { data, error } = await admin.auth.admin.updateUserById(opts.userId, {
    email_confirm: true,
    app_metadata: temporaryPasswordAppMetadata({
      existing: current.user.app_metadata,
      portal: opts.portal,
      kind: opts.temporaryPasswordKind,
      issuedAt,
      expiresAt: opts.expiresAt,
    }),
    user_metadata: {
      ...(current.user.user_metadata ?? {}),
      full_name: fullName,
      name: fullName,
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Tijdelijk wachtwoord instellen mislukt.");
  }

  return data.user;
}

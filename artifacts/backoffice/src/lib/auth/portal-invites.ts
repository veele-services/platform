import { randomInt } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type PortalInviteType = "customer" | "personnel";

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

function isEmailExistsError(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "email_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists");
}

async function findAuthUserByEmail(
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

export async function provisionPortalUserWithTemporaryPassword(opts: {
  email: string;
  fullName: string;
  portal: PortalInviteType;
}): Promise<{ user: User; temporaryPassword: string; created: boolean }> {
  const admin = createAdminClient();
  const email = opts.email.trim().toLowerCase();
  const temporaryPassword = generateTemporaryPassword();
  const issuedAt = new Date().toISOString();

  const appMetadata = {
    force_password_change: true,
    portal: opts.portal,
    temporary_password_issued_at: issuedAt,
  };
  const userMetadata = {
    full_name: opts.fullName,
    name: opts.fullName,
  };

  const { data: createdData, error: createError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
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
  if (existingPortal && existingPortal !== opts.portal) {
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

  if (!isPendingTemporaryPassword && !isLegacyPendingInvite) {
    throw new Error("Er bestaat al een actief account voor dit e-mailadres. Gebruik daarvoor een wachtwoord-reset.");
  }

  const { data: updatedData, error: updateError } = await admin.auth.admin.updateUserById(
    existingUser.id,
    {
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: {
        ...(existingUser.app_metadata ?? {}),
        ...appMetadata,
      },
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

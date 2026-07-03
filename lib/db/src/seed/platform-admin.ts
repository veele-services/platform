import { randomInt } from "node:crypto";
import { pool } from "../index";

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

type SupabaseListUsersResponse = {
  users?: SupabaseAuthUser[];
};

class SupabaseAdminError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SupabaseAdminError";
    this.status = status;
  }
}

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

function generateTemporaryPassword(): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < 16) chars.push(pick(all));
  return shuffle(chars).join("");
}

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function requiredEnv(names: string[]): string {
  const value = firstEnv(names);
  if (!value) throw new Error(`Set one of: ${names.join(", ")}.`);
  return value;
}

function authUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function normalizeUser(payload: unknown): SupabaseAuthUser | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const user = record.user && typeof record.user === "object"
    ? record.user as Record<string, unknown>
    : record;
  return typeof user.id === "string" ? user as SupabaseAuthUser : null;
}

async function supabaseAdminRequest<T>(input: {
  baseUrl: string;
  serviceRoleKey: string;
  path: string;
  method?: string;
  body?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(authUrl(input.baseUrl, input.path), {
    method: input.method ?? "GET",
    headers: {
      apikey: input.serviceRoleKey,
      Authorization: `Bearer ${input.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : null;

  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
    const message = String(record?.message ?? record?.msg ?? response.statusText);
    throw new SupabaseAdminError(message, response.status);
  }

  return payload as T;
}

function isEmailExistsError(error: unknown): boolean {
  return error instanceof SupabaseAdminError &&
    [400, 409, 422].includes(error.status) &&
    /already|exists|registered/i.test(error.message);
}

async function findAuthUserByEmail(input: {
  baseUrl: string;
  serviceRoleKey: string;
  email: string;
}): Promise<SupabaseAuthUser | null> {
  const normalizedEmail = input.email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const payload = await supabaseAdminRequest<SupabaseListUsersResponse>({
      baseUrl: input.baseUrl,
      serviceRoleKey: input.serviceRoleKey,
      path: `/auth/v1/admin/users?page=${page}&per_page=1000`,
    });

    const users = payload.users ?? [];
    const found = users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (found) return found;
    if (users.length < 1000) return null;
  }

  return null;
}

async function createAuthUser(input: {
  baseUrl: string;
  serviceRoleKey: string;
  email: string;
  temporaryPassword: string;
  fullName: string;
  issuedAt: string;
}): Promise<SupabaseAuthUser> {
  const payload = await supabaseAdminRequest<unknown>({
    baseUrl: input.baseUrl,
    serviceRoleKey: input.serviceRoleKey,
    path: "/auth/v1/admin/users",
    method: "POST",
    body: {
      email: input.email,
      password: input.temporaryPassword,
      email_confirm: true,
      app_metadata: {
        force_password_change: true,
        portal: "platform-admin",
        platform_role: "owner",
        temporary_password_issued_at: input.issuedAt,
      },
      user_metadata: {
        full_name: input.fullName,
        name: input.fullName,
      },
    },
  });

  const user = normalizeUser(payload);
  if (!user) throw new Error("Supabase returned no auth user after create.");
  return user;
}

async function updateAuthUser(input: {
  baseUrl: string;
  serviceRoleKey: string;
  user: SupabaseAuthUser;
  temporaryPassword: string;
  fullName: string;
  issuedAt: string;
}): Promise<SupabaseAuthUser> {
  const payload = await supabaseAdminRequest<unknown>({
    baseUrl: input.baseUrl,
    serviceRoleKey: input.serviceRoleKey,
    path: `/auth/v1/admin/users/${input.user.id}`,
    method: "PUT",
    body: {
      password: input.temporaryPassword,
      email_confirm: true,
      app_metadata: {
        ...(input.user.app_metadata ?? {}),
        force_password_change: true,
        portal: "platform-admin",
        platform_role: "owner",
        temporary_password_issued_at: input.issuedAt,
      },
      user_metadata: {
        ...(input.user.user_metadata ?? {}),
        full_name: input.fullName,
        name: input.fullName,
      },
    },
  });

  const user = normalizeUser(payload);
  if (!user) throw new Error("Supabase returned no auth user after update.");
  return user;
}

async function upsertPlatformOwner(userId: string) {
  const result = await pool.query<{
    id: string;
    user_id: string;
    role: string;
    status: string;
  }>(
    `insert into platform_users (user_id, role, status, updated_at)
     values ($1, 'owner', 'active', now())
     on conflict (user_id) do update
       set role = 'owner', status = 'active', updated_at = now()
     returning id, user_id, role, status`,
    [userId],
  );

  return result.rows[0]!;
}

async function seedPlatformAdmin() {
  const baseUrl = requiredEnv(["NEXT_PUBLIC_SUPABASE_URL"]);
  const serviceRoleKey = requiredEnv(["SUPABASE_SERVICE_ROLE_KEY"]);
  const email = requiredEnv(["PLATFORM_SUPERADMIN_EMAIL", "PLATFORM_ADMIN_EMAIL"]).toLowerCase();
  const fullName = firstEnv(["PLATFORM_SUPERADMIN_NAME", "PLATFORM_ADMIN_NAME"]) ?? "Platform Superadmin";
  const providedPassword = firstEnv(["PLATFORM_SUPERADMIN_TEMP_PASSWORD", "PLATFORM_ADMIN_TEMP_PASSWORD"]);
  const temporaryPassword = providedPassword ?? generateTemporaryPassword();
  const issuedAt = new Date().toISOString();

  let user: SupabaseAuthUser;
  let created = false;

  try {
    user = await createAuthUser({ baseUrl, serviceRoleKey, email, temporaryPassword, fullName, issuedAt });
    created = true;
  } catch (error) {
    if (!isEmailExistsError(error)) throw error;
    const existingUser = await findAuthUserByEmail({ baseUrl, serviceRoleKey, email });
    if (!existingUser) throw new Error("Auth user exists, but could not be found by e-mail.");
    user = await updateAuthUser({ baseUrl, serviceRoleKey, user: existingUser, temporaryPassword, fullName, issuedAt });
  }

  const platformUser = await upsertPlatformOwner(user.id);

  console.log(`Platform superadmin ${created ? "created" : "updated"}: ${email}`);
  console.log(`Auth user id: ${user.id}`);
  console.log(`Platform user id: ${platformUser.id} (${platformUser.role}, ${platformUser.status})`);
  if (providedPassword) {
    console.log("Temporary password: provided via environment variable.");
  } else {
    console.log(`Temporary password: ${temporaryPassword}`);
  }
  console.log("User must change this password on first login.");
}

seedPlatformAdmin()
  .catch((error) => {
    console.error("Platform superadmin seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

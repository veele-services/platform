"use server";

import { db } from "@workspace/db";
import {
  taskCodesTable,
  sectorsTable,
  rolesTable,
  auditLogTable,
  insertTaskCodeSchema,
  updateTaskCodeSchema,
} from "@workspace/db";
import { eq, ilike, or, and, asc, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import type { ActionResult } from "./customers";
import { z } from "zod/v4";

// ─── Server-side business rule refinements ────────────────────────────────────
// These constraints go beyond what Drizzle-Zod auto-generates from column types.

const serverPayloadSchema = z.object({
  price: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) => v == null || v === "" || (parseFloat(v) >= 0 && !isNaN(parseFloat(v))),
      "Price must be a number ≥ 0",
    ),
  durationMinutes: z
    .number()
    .int("Duration must be a whole number")
    .positive("Duration must be greater than 0")
    .nullable()
    .optional(),
});

export type { ActionResult };

// ─── Types ────────────────────────────────────────────────────────────────────

export type SectorOption = { id: string; name: string };
export type RoleOption   = { id: string; name: string };

export type TaskCodeRow = {
  id:               string;
  code:             string;
  name:             string;
  sectorId:         string | null;
  sectorName:       string | null;
  price:            string | null;
  durationMinutes:  number | null;
  invoiceable:      boolean;
  isActive:         boolean;
  createdAt:        string;
};

export type TaskCodeDetail = {
  id:                   string;
  code:                 string;
  name:                 string;
  sectorId:             string | null;
  sectorName:           string | null;
  description:          string | null;
  price:                string | null;
  durationMinutes:      number | null;
  requiredCertificates: string[];
  requiredDiploma:      string | null;
  requiredKnowledge:    string[];
  requiredRoleId:       string | null;
  requiredRoleName:     string | null;
  photoRequired:        boolean;
  reportRequired:       boolean;
  invoiceable:          boolean;
  isActive:             boolean;
  createdAt:            string;
  updatedAt:            string;
};

export type TaskCodeFormInput = {
  code:                 string;
  name:                 string;
  sectorId?:            string;
  description?:         string;
  price?:               string;
  durationMinutes?:     number;
  requiredCertificates: string[];
  requiredDiploma?:     string;
  requiredKnowledge:    string[];
  requiredRoleId?:      string;
  photoRequired:        boolean;
  reportRequired:       boolean;
  invoiceable:          boolean;
  isActive:             boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listTaskCodes(params: {
  search?:      string;
  sectorId?:    string;
  invoiceable?: string;
  status?:      string;
  page?:        number;
  sort?:        string;
  dir?:         string;
}): Promise<{ rows: TaskCodeRow[]; total: number }> {
  await requirePermission("task_codes", "read");

  const {
    search,
    sectorId,
    invoiceable,
    status = "all",
    page = 1,
    sort = "code",
    dir = "asc",
  } = params;

  type Cond = ReturnType<typeof eq>;
  const conditions: Cond[] = [];

  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const clause = or(
      ilike(taskCodesTable.code, term),
      ilike(taskCodesTable.name, term),
    );
    if (clause) conditions.push(clause as Cond);
  }
  if (sectorId) {
    conditions.push(eq(taskCodesTable.sectorId, sectorId) as Cond);
  }
  if (invoiceable === "yes") {
    conditions.push(eq(taskCodesTable.invoiceable, true) as Cond);
  }
  if (invoiceable === "no") {
    conditions.push(eq(taskCodesTable.invoiceable, false) as Cond);
  }
  if (status === "active")   conditions.push(eq(taskCodesTable.isActive, true)  as Cond);
  if (status === "inactive") conditions.push(eq(taskCodesTable.isActive, false) as Cond);

  const where = conditions.length ? and(...conditions) : undefined;

  const sortMap: Record<string, unknown> = {
    code:            taskCodesTable.code,
    name:            taskCodesTable.name,
    price:           taskCodesTable.price,
    durationMinutes: taskCodesTable.durationMinutes,
    createdAt:       taskCodesTable.createdAt,
  };
  const sortCol = (sortMap[sort] ?? taskCodesTable.code) as typeof taskCodesTable.code;
  const orderBy = dir === "desc" ? desc(sortCol) : asc(sortCol);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id:              taskCodesTable.id,
        code:            taskCodesTable.code,
        name:            taskCodesTable.name,
        sectorId:        taskCodesTable.sectorId,
        sectorName:      sectorsTable.name,
        price:           taskCodesTable.price,
        durationMinutes: taskCodesTable.durationMinutes,
        invoiceable:     taskCodesTable.invoiceable,
        isActive:        taskCodesTable.isActive,
        createdAt:       taskCodesTable.createdAt,
      })
      .from(taskCodesTable)
      .leftJoin(sectorsTable, eq(taskCodesTable.sectorId, sectorsTable.id))
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(taskCodesTable)
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      price:     r.price     ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total: countRows[0]?.total ?? 0,
  };
}

export async function getTaskCode(id: string): Promise<TaskCodeDetail | null> {
  await requirePermission("task_codes", "read");

  const rows = await db
    .select({
      id:                   taskCodesTable.id,
      code:                 taskCodesTable.code,
      name:                 taskCodesTable.name,
      sectorId:             taskCodesTable.sectorId,
      sectorName:           sectorsTable.name,
      description:          taskCodesTable.description,
      price:                taskCodesTable.price,
      durationMinutes:      taskCodesTable.durationMinutes,
      requiredCertificates: taskCodesTable.requiredCertificates,
      requiredDiploma:      taskCodesTable.requiredDiploma,
      requiredKnowledge:    taskCodesTable.requiredKnowledge,
      requiredRoleId:       taskCodesTable.requiredRoleId,
      requiredRoleName:     rolesTable.name,
      photoRequired:        taskCodesTable.photoRequired,
      reportRequired:       taskCodesTable.reportRequired,
      invoiceable:          taskCodesTable.invoiceable,
      isActive:             taskCodesTable.isActive,
      createdAt:            taskCodesTable.createdAt,
      updatedAt:            taskCodesTable.updatedAt,
    })
    .from(taskCodesTable)
    .leftJoin(sectorsTable, eq(taskCodesTable.sectorId, sectorsTable.id))
    .leftJoin(rolesTable,   eq(taskCodesTable.requiredRoleId, rolesTable.id))
    .where(eq(taskCodesTable.id, id))
    .limit(1);

  if (!rows[0]) return null;
  const r = rows[0];
  return {
    ...r,
    price:     r.price ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listSectorsForTaskCodes(): Promise<SectorOption[]> {
  await requirePermission("task_codes", "read");
  return db
    .select({ id: sectorsTable.id, name: sectorsTable.name })
    .from(sectorsTable)
    .where(eq(sectorsTable.isActive, true))
    .orderBy(asc(sectorsTable.name));
}

export async function listRolesForTaskCodes(): Promise<RoleOption[]> {
  await requirePermission("task_codes", "read");
  return db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .orderBy(asc(rolesTable.name));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

function buildPayload(data: TaskCodeFormInput) {
  return {
    code:                 data.code.trim().toUpperCase(),
    name:                 data.name.trim(),
    sectorId:             data.sectorId             || null,
    description:          data.description?.trim()  || null,
    price:                data.price?.trim()         || null,
    durationMinutes:      data.durationMinutes       ?? null,
    requiredCertificates: data.requiredCertificates,
    requiredDiploma:      data.requiredDiploma?.trim() || null,
    requiredKnowledge:    data.requiredKnowledge,
    requiredRoleId:       data.requiredRoleId        || null,
    photoRequired:        data.photoRequired,
    reportRequired:       data.reportRequired,
    invoiceable:          data.invoiceable,
    isActive:             data.isActive,
  };
}

export async function createTaskCode(
  data: TaskCodeFormInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("task_codes", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Not authenticated." };

  const payload = buildPayload(data);

  // Server-side business rule validation (price ≥ 0, duration > 0)
  const bizCheck = serverPayloadSchema.safeParse({
    price:           payload.price,
    durationMinutes: payload.durationMinutes,
  });
  if (!bizCheck.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of bizCheck.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validation failed.", fieldErrors };
  }

  const parsed  = insertTaskCodeSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validation failed.", fieldErrors };
  }

  try {
    const [created] = await db
      .insert(taskCodesTable)
      .values(parsed.data)
      .returning({ id: taskCodesTable.id });

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "create",
      resource:   "task_codes",
      resourceId: created!.id,
      metadata:   { code: payload.code, name: payload.name },
    });

    revalidatePath("/settings/task-codes");
    return { success: true, data: { id: created!.id } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: `Code "${payload.code}" is already in use.`,
        fieldErrors: { code: "Code must be unique" },
      };
    }
    return { success: false, message: "Failed to create task code." };
  }
}

export async function updateTaskCode(
  id: string,
  data: TaskCodeFormInput,
): Promise<ActionResult> {
  await requirePermission("task_codes", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Not authenticated." };

  const payload = buildPayload(data);

  // Server-side business rule validation (price ≥ 0, duration > 0)
  const bizCheck = serverPayloadSchema.safeParse({
    price:           payload.price,
    durationMinutes: payload.durationMinutes,
  });
  if (!bizCheck.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of bizCheck.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validation failed.", fieldErrors };
  }

  const parsed  = updateTaskCodeSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validation failed.", fieldErrors };
  }

  try {
    await db
      .update(taskCodesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(taskCodesTable.id, id));

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "update",
      resource:   "task_codes",
      resourceId: id,
      metadata:   { code: payload.code, name: payload.name },
    });

    revalidatePath("/settings/task-codes");
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: `Code "${payload.code}" is already in use.`,
        fieldErrors: { code: "Code must be unique" },
      };
    }
    return { success: false, message: "Failed to update task code." };
  }
}

export async function setTaskCodeStatus(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requirePermission("task_codes", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Not authenticated." };

  await db
    .update(taskCodesTable)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(taskCodesTable.id, id));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     isActive ? "activate" : "deactivate",
    resource:   "task_codes",
    resourceId: id,
    metadata:   {},
  });

  revalidatePath("/settings/task-codes");
  return { success: true };
}

export async function deleteTaskCode(id: string): Promise<ActionResult> {
  await requirePermission("task_codes", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Not authenticated." };

  const [tc] = await db
    .select({ code: taskCodesTable.code, name: taskCodesTable.name })
    .from(taskCodesTable)
    .where(eq(taskCodesTable.id, id))
    .limit(1);

  if (!tc) return { success: false, message: "Task code not found." };

  await db.delete(taskCodesTable).where(eq(taskCodesTable.id, id));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "delete",
    resource:   "task_codes",
    resourceId: id,
    metadata:   { code: tc.code, name: tc.name },
  });

  revalidatePath("/settings/task-codes");
  return { success: true };
}

import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

type OfflineExecutor = { execute(query: SQL): Promise<unknown> };

function rowsFrom<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: T[] }).rows;
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

export function hashOfflineOperationPayload(
  payload: Record<string, unknown>,
): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function beginOfflineOperation<T extends Record<string, unknown>>(
  executor: OfflineExecutor,
  input: {
    tenantId: string;
    assignmentId: string;
    personnelId: string;
    actorUserId: string;
    operationId: string;
    operationType: string;
    expectedVersion: number;
    payload: Record<string, unknown>;
  },
): Promise<T | null> {
  const [row] = rowsFrom<{ begin_offline_operation: T | null }>(
    await executor.execute(sql`
    SELECT public.begin_offline_operation(
      ${input.tenantId}::uuid, ${input.assignmentId}::uuid, ${input.personnelId}::uuid,
      ${input.actorUserId}::uuid, ${input.operationId}, ${input.operationType},
      ${hashOfflineOperationPayload(input.payload)}, ${input.expectedVersion}::bigint
    )
  `),
  );
  return row?.begin_offline_operation ?? null;
}

export async function completeOfflineOperation(
  executor: OfflineExecutor,
  input: {
    tenantId: string;
    actorUserId: string;
    operationId: string;
    response: Record<string, unknown>;
  },
): Promise<void> {
  await executor.execute(sql`
    SELECT public.complete_offline_operation(
      ${input.tenantId}::uuid, ${input.actorUserId}::uuid,
      ${input.operationId}, ${JSON.stringify(input.response)}::jsonb
    )
  `);
}

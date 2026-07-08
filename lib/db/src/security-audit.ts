import { db } from "./index";
import { auditLogTable } from "./schema";
import { redactLogMetadata } from "./security-masking";
import type { FieldgridAccessLevel } from "./security-permissions";
import type { FieldgridDataClassificationLevel, FieldgridDataScope } from "./security-data-classification";

export type FieldgridSensitiveAuditInput = {
  userId: string;
  tenantId?: string | null;
  role: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  dataClassificationLevel: FieldgridDataClassificationLevel;
  accessType: FieldgridAccessLevel | "view" | "download" | "approve" | "deny";
  dataScope?: FieldgridDataScope;
  reason?: string | null;
  approvalRequestId?: string | null;
  ipAddress?: string | null;
  sessionId?: string | null;
  userAgent?: string | null;
  exportDownload?: boolean;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export function buildSensitiveAuditMetadata(input: FieldgridSensitiveAuditInput): Record<string, unknown> {
  return redactLogMetadata({
    role: input.role,
    dataClassificationLevel: input.dataClassificationLevel,
    accessType: input.accessType,
    dataScope: input.dataScope,
    reason: input.reason,
    approvalRequestId: input.approvalRequestId,
    ipAddress: input.ipAddress,
    sessionId: input.sessionId,
    userAgent: input.userAgent,
    exportDownload: input.exportDownload ?? false,
    before: input.before,
    after: input.after,
    ...(input.metadata ?? {}),
  });
}

export async function writeSensitiveAuditLog(input: FieldgridSensitiveAuditInput): Promise<void> {
  await db.insert(auditLogTable).values({
    tenantId: input.tenantId ?? null,
    userId: input.userId,
    action: input.action,
    resource: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: buildSensitiveAuditMetadata(input),
  });
}

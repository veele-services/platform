export type FieldgridEmailProviderScope =
  | { kind: "platform" }
  | { kind: "tenant"; tenantId: string }
  | { kind: "fieldgrid_environment" };

export type ScopedEmailProvider = {
  scope: FieldgridEmailProviderScope;
};

export type EmailProviderCandidates<T extends ScopedEmailProvider> = {
  messageTenantId?: string | null;
  platformProvider?: T | null;
  tenantProvider?: T | null;
  environmentProvider?: T | null;
};

/**
 * Canonical provider ownership policy. A tenant-scoped candidate is eligible
 * only when it belongs to the exact tenant bound to the message. Central
 * Fieldgrid providers are explicit scopes and never originate from another
 * tenant's organization settings.
 */
export function selectEmailProviderForMessage<T extends ScopedEmailProvider>(
  candidates: EmailProviderCandidates<T>,
): T | null {
  if (candidates.platformProvider?.scope.kind === "platform") {
    return candidates.platformProvider;
  }

  if (
    candidates.messageTenantId &&
    candidates.tenantProvider?.scope.kind === "tenant" &&
    candidates.tenantProvider.scope.tenantId === candidates.messageTenantId
  ) {
    return candidates.tenantProvider;
  }

  if (candidates.environmentProvider?.scope.kind === "fieldgrid_environment") {
    return candidates.environmentProvider;
  }

  return null;
}

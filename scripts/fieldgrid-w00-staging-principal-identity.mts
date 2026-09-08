export type W00StagingPrincipalIdentity = {
  current_user: string;
  session_user: string;
  current_user_is_superuser: boolean;
  current_user_bypasses_rls: boolean;
  session_user_can_control_privileged_role: boolean;
  transaction_read_only: string;
};

export function assertSafeW00StagingPrincipalIdentity(
  row: W00StagingPrincipalIdentity | undefined,
): asserts row is W00StagingPrincipalIdentity {
  if (!row || row.transaction_read_only !== "on") {
    throw new Error("The staging-principal transaction is not read-only.");
  }

  if (
    row.current_user.length === 0 ||
    row.current_user !== row.session_user ||
    row.current_user_is_superuser !== false ||
    row.current_user_bypasses_rls !== false ||
    row.session_user_can_control_privileged_role !== false
  ) {
    throw new Error(
      "The staging runtime principal identity is not least-privileged.",
    );
  }
}

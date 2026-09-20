export const HOSTED_POLICY_REPLACEMENT = Object.freeze({
  name: "20260920131458_reconcile_hosted_policy_contract.sql",
  hash: "402aa3c738aa67d3b0346a0ea9a2f01eec119238b445ded0f74239876101e6ae",
});
export const HOSTED_POLICY_SUPERSEDED = Object.freeze({
  name: "20260919220633_repair_tenant_management_policy_consumers.sql",
  hash: "89bb90be5003c58085edb2688cfc8c9793e682e159edc0f3a656703bd86c3929",
});
export function isVerifiedHostedPolicyBaseline(record: { name: string; hash: string; baselined: boolean },
  records: { name: string; hash: string; baselined: boolean }[]): boolean {
  return record.name === HOSTED_POLICY_SUPERSEDED.name && record.hash === HOSTED_POLICY_SUPERSEDED.hash &&
    record.baselined === true && records.filter((entry) => entry.name === HOSTED_POLICY_REPLACEMENT.name).length === 1 &&
    records.some((entry) => entry.name === HOSTED_POLICY_REPLACEMENT.name &&
      entry.hash === HOSTED_POLICY_REPLACEMENT.hash && entry.baselined === false);
}

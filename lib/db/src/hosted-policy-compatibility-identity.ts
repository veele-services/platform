export const HOSTED_POLICY_CLEAN_HELPER_CLOSURE = Object.freeze({
  name: "20260920150424_close_hosted_clean_customer_helper_grants.sql",
  hash: "f157d0d133282770bd37d573899cd035686b99d4244ece45019a95eea240155c",
});
export const HOSTED_POLICY_PERSONNEL_CLOSURE = Object.freeze({
  name: "20260920145343_close_legacy_personnel_browser_updates.sql",
  hash: "59bd5605f54dfd2cdd4f20b6e664936d4de25236d007bf39fb6ca39aff6e2d92",
});
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

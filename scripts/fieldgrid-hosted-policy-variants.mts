import type { RepairVariant } from "./fieldgrid-tenant-management-policy-repair-contract.mts";

// Hosted Supabase owns auth helpers. A redundant postgres EXECUTE grant is
// absent on hosted PG17; PUBLIC already provides exactly the same execution
// rights. Preserve every other helper attribute, ACL and effective permission.
export function withHostedAuthVariants(variants: RepairVariant[]): RepairVariant[] {
  const hosted = variants.filter((variant) => variant.profile === "providerSource").map((variant) => {
    const copy = structuredClone(variant);
    copy.profile = "hostedProvider";
    const helpers = copy.manifest.helpers.filter((helper) => helper.schema === "auth" &&
      ["uid", "role"].includes(helper.name));
    if (helpers.length !== (["legacy", "targetUpgrade"].includes(copy.state) ? 2 : 1) ||
        !helpers.some((helper) => helper.name === "uid")) throw new Error("hosted_policy_source_invalid");
    for (const helper of helpers) {
      const grants = helper.directAcl.filter((acl) => acl.grantee === "postgres");
      if (grants.length !== 1 || grants[0]!.grantor !== "$owner" ||
          grants[0]!.privilege !== "EXECUTE" || grants[0]!.grantable ||
          !helper.directAcl.some((acl) => acl.grantee === "PUBLIC" && acl.privilege === "EXECUTE" && !acl.grantable)) {
        throw new Error("hosted_policy_source_invalid");
      }
      helper.directAcl = helper.directAcl.filter((acl) => acl.grantee !== "postgres");
    }
    return copy;
  });
  if (hosted.length !== 4) throw new Error("hosted_policy_source_invalid");
  return [...variants, ...hosted];
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { withHostedAuthVariants } from "./fieldgrid-hosted-policy-variants.mts";
import type { RepairVariant } from "./fieldgrid-tenant-management-policy-repair-contract.mts";

const sourceName = "20260919220633_repair_tenant_management_policy_consumers.sql";
const sourceHash = "89bb90be5003c58085edb2688cfc8c9793e682e159edc0f3a656703bd86c3929";
const originalExpression = "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))";
const restoredExpression = "(((status)::text = ANY (ARRAY[('sent'::character varying)::text, ('paid'::character varying)::text, ('cancelled'::character varying)::text])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))";

function pinnedTargets(): RepairVariant[] {
  const sql = readFileSync(new URL(`../lib/db/migrations/${sourceName}`, import.meta.url), "utf8")
    .replaceAll("\r\n", "\n");
  if (createHash("sha256").update(sql).digest("hex") !== sourceHash) {
    throw new Error("pg17_restored_policy_source_invalid");
  }
  const parts = sql.split("$policy_repair_manifest$");
  if (parts.length !== 3) throw new Error("pg17_restored_policy_source_invalid");
  return withHostedAuthVariants(JSON.parse(parts[1]!)).filter((variant) =>
    variant.state === "targetClean" || variant.state === "targetUpgrade");
}

// PG17 reparses the dumped varchar[]-to-text[] expression into element casts.
// Accept only this observed full expression in completed targets. This is not
// SQL normalization: all roles, joins, helper contracts and relation metadata
// remain byte-for-byte values from the immutable, hash-pinned source manifest.
export function withPg17RestoredTargetVariants(variants: RepairVariant[]): RepairVariant[] {
  const targets = pinnedTargets();
  const restored = variants.filter((variant) =>
    variant.state === "targetClean" || variant.state === "targetUpgrade").map((variant) => {
    const pinned = targets.find((target) => target.state === variant.state && target.profile === variant.profile);
    if (!pinned || !isDeepStrictEqual(variant, pinned)) throw new Error("pg17_restored_policy_source_invalid");
    const copy = structuredClone(pinned);
    copy.profile += "Restored";
    const policies = copy.manifest.policies.filter((policy) => policy.schema === "public" &&
      policy.table === "invoices" && policy.name === "invoices_customer_sent_select");
    if (policies.length !== 1 || policies[0]!.usingExpression !== originalExpression) {
      throw new Error("pg17_restored_policy_source_invalid");
    }
    policies[0]!.usingExpression = restoredExpression;
    return copy;
  });
  if (restored.length === 0 || new Set(restored.map((variant) => `${variant.state}/${variant.profile}`)).size !== restored.length) {
    throw new Error("pg17_restored_policy_source_invalid");
  }
  return [...variants, ...restored];
}

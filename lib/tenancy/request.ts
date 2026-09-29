import "server-only";

import { headers } from "next/headers";
import { TENANT_SLUG_HEADER } from "./hostname";

export async function requestMatchesTenant(slug: string): Promise<boolean> {
  if ((process.env.DEPLOY_TARGET ?? "local") === "local") return true;
  return (await headers()).get(TENANT_SLUG_HEADER) === slug;
}

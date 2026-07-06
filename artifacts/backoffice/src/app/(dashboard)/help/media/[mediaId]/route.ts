import { NextResponse } from "next/server";
import {
  getKnowledgebaseMediaByIdForContext,
  listEnabledKnowledgebaseModuleKeysForTenant,
} from "@workspace/db";
import { getCurrentEffectiveUserPermissions } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KB_MEDIA_BUCKET = "knowledgebase-media";
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  let tenantId: string;
  let permissionSet: Set<string>;
  try {
    tenantId = await requireCurrentTenantId();
    permissionSet = await getCurrentEffectiveUserPermissions();
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!permissionSet.has("kb:view")) return new NextResponse("Forbidden", { status: 403 });

  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(tenantId);
  if (!activeModuleKeys.includes("knowledgebase")) return new NextResponse("Not found", { status: 404 });

  const { mediaId } = await params;
  const media = await getKnowledgebaseMediaByIdForContext(
    {
      tenantId,
      surface: "tenant_backoffice",
      audiences: [],
      activeModuleKeys,
      permissionKeys: [...permissionSet],
    },
    mediaId,
  );

  if (!media) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await createAdminClient()
    .storage
    .from(KB_MEDIA_BUCKET)
    .createSignedUrl(media.storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return new NextResponse("Media unavailable", { status: 404 });

  const response = NextResponse.redirect(data.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

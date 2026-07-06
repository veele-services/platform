import { NextResponse } from "next/server";
import {
  getKnowledgebaseMediaByIdForContext,
  listEnabledKnowledgebaseModuleKeysForTenant,
} from "@workspace/db";
import { getMyPersonnel } from "@/actions/personnel";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KB_MEDIA_BUCKET = "knowledgebase-media";
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const tenantId = await requireCurrentPersonnelPortalTenantId();
  const personnel = await getMyPersonnel();
  if (!tenantId || !personnel) return new NextResponse("Unauthorized", { status: 401 });

  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(tenantId);
  if (!activeModuleKeys.includes("knowledgebase")) return new NextResponse("Not found", { status: 404 });

  const { mediaId } = await params;
  const media = await getKnowledgebaseMediaByIdForContext(
    {
      tenantId,
      surface: "personnel_pwa",
      audiences: ["tenant_personnel"],
      activeModuleKeys,
      permissionKeys: [],
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

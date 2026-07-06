import { NextResponse } from "next/server";
import { getKnowledgebaseMediaByIdForContext } from "@workspace/db";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KB_MEDIA_BUCKET = "knowledgebase-media";
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const actor = await requirePlatformAdmin();
  const { mediaId } = await params;

  const media = await getKnowledgebaseMediaByIdForContext(
    {
      surface: "platform_backoffice",
      isPlatformAdmin: true,
      audiences: ["platform_admin", "support"],
      activeModuleKeys: [],
      permissionKeys: [],
    },
    mediaId,
    { includeUnpublished: true, includeArchived: true },
  );

  if (!media || !actor.userId) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await createAdminClient()
    .storage
    .from(KB_MEDIA_BUCKET)
    .createSignedUrl(media.storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return new NextResponse("Media unavailable", { status: 404 });

  const response = NextResponse.redirect(data.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

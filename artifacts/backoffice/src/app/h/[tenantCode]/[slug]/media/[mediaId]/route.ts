import { NextResponse } from "next/server";
import { getShortcodeKnowledgebaseMedia } from "@/app/actions/knowledgebase-help";
import { createAdminClient } from "@/lib/supabase/admin";
import { backofficePath } from "@/lib/backoffice-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KB_MEDIA_BUCKET = "knowledgebase-media";
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantCode: string; slug: string; mediaId: string }> },
) {
  const { tenantCode, slug, mediaId } = await params;
  const result = await getShortcodeKnowledgebaseMedia(tenantCode, slug, mediaId);

  if (result.status === "login_required") {
    const requestUrl = new URL(request.url);
    const loginUrl = new URL(backofficePath("/login"), request.url);
    loginUrl.searchParams.set("next", `${requestUrl.pathname}${requestUrl.search}`);
    return NextResponse.redirect(loginUrl, 307);
  }

  if (result.status === "access_denied") return new NextResponse("Forbidden", { status: 403 });
  if (result.status !== "ok") return new NextResponse("Not found", { status: 404 });

  const { data, error } = await createAdminClient()
    .storage
    .from(KB_MEDIA_BUCKET)
    .createSignedUrl(result.media.storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return new NextResponse("Media unavailable", { status: 404 });

  const response = NextResponse.redirect(data.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

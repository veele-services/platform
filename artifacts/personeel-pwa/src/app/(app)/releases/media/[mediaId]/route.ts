import { NextResponse } from "next/server";
import { getPersonnelReleaseMedia } from "@/actions/releases";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentPortalModule } from "@/lib/auth/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RELEASE_MEDIA_BUCKET = "release-media";
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  if (!(await requireCurrentPortalModule("releases"))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const { mediaId } = await params;
  const media = await getPersonnelReleaseMedia(mediaId);
  if (!media) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await createAdminClient()
    .storage
    .from(RELEASE_MEDIA_BUCKET)
    .createSignedUrl(media.storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return new NextResponse("Media unavailable", { status: 404 });

  const response = NextResponse.redirect(data.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

import { NextResponse } from "next/server";
import { renderStaffPwaImage, StaffPwaBusyError } from "@/lib/pwa/image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  try {
    const bytes = await renderStaffPwaImage((await params).asset);
    if (!bytes) return new NextResponse("Niet gevonden", { status: 404, headers: { "cache-control": "no-store" } });
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "content-type": "image/png",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    } });
  } catch (error) {
    if (error instanceof StaffPwaBusyError) return new NextResponse("Probeer later opnieuw", { status: 429, headers: { "cache-control": "no-store", "retry-after": "2" } });
    return new NextResponse("Niet gevonden", { status: 404, headers: { "cache-control": "no-store" } });
  }
}

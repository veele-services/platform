import {
  PERSONNEL_TENANT_COOKIE,
  resolveActivePersonnelTenantIdByCode,
} from "@/lib/auth/tenant";
import {
  isValidPersonnelTenantCode,
  normalizePersonnelTenantCode,
  requireTenantModule,
} from "@workspace/db";
import { NextResponse, type NextRequest } from "next/server";

const PORTAL_BASE = "/personeel";

function safeNext(value: string | null): string {
  const candidate = value?.trim() || "/login";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/login";
  }
  if (candidate === "/organisatie" || candidate.startsWith("/organisatie/")) {
    return "/login";
  }
  if (candidate === PORTAL_BASE) return "/";
  if (candidate.startsWith(`${PORTAL_BASE}/`)) {
    return candidate.slice(PORTAL_BASE.length) || "/";
  }
  return candidate;
}

function portalUrl(request: NextRequest, pathname: string): URL {
  const relative = new URL(pathname, "https://fieldgrid.invalid");
  const url = request.nextUrl.clone();
  url.pathname = `${PORTAL_BASE}${relative.pathname === "/" ? "" : relative.pathname}`;
  url.search = relative.search;
  url.hash = "";
  return url;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const code = normalizePersonnelTenantCode((await params).code);
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const tenantId = isValidPersonnelTenantCode(code)
    ? await resolveActivePersonnelTenantIdByCode(code)
    : null;

  if (!tenantId) {
    const target = portalUrl(request, "/login");
    target.searchParams.set(
      "error",
      "Organisatiecode niet herkend. Controleer de zes tekens.",
    );
    return NextResponse.redirect(target);
  }

  try {
    await requireTenantModule(tenantId, "personnel_portal");
  } catch {
    const target = portalUrl(request, "/login");
    target.searchParams.set(
      "error",
      "De personeelsapp is niet beschikbaar voor deze organisatie.",
    );
    return NextResponse.redirect(target);
  }

  const response = NextResponse.redirect(portalUrl(request, next));
  response.cookies.set(PERSONNEL_TENANT_COOKIE, code, {
    httpOnly: true,
    path: PORTAL_BASE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

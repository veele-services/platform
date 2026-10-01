import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { scannerReadiness } from "@/lib/tickets/scanner-readiness";

export const dynamic = "force-dynamic";

async function releaseIdentity(deployTarget: string) {
  const path = `${process.cwd()}/.release-sha`;
  try {
    const [value, metadata] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    const release = value.trim();
    if (!/^[0-9a-f]{40}$/.test(release)) throw new Error("invalid release marker");
    if (deployTarget === "staging" && (metadata.uid !== 0 || (metadata.mode & 0o022) !== 0)) throw new Error("untrusted release marker");
    return release;
  } catch (error) {
    if (deployTarget === "staging") throw error;
    return process.env.DEPLOYMENT_VERSION ?? process.env.RELEASE_SHA ?? process.env.GITHUB_SHA ?? "local";
  }
}

export async function GET(request: Request) {
  let release = "unavailable";
  try {
    const env = getServerEnv();
    const admin = createAdminClient();
    const { error } = await admin.from("tenants").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    release = await releaseIdentity(env.DEPLOY_TARGET);
    const expected = new URL(request.url).searchParams.get("release");
    if (expected && expected !== release) return NextResponse.json({ status: "release_mismatch", environment: env.DEPLOY_TARGET, release, database: "ready", checkedAt: new Date().toISOString() }, { status: 409, headers: { "cache-control": "no-store" } });
    const scanner = await scannerReadiness({ DEPLOY_TARGET: env.DEPLOY_TARGET, CLAMAV_ENABLED: env.CLAMAV_ENABLED, CLAMAV_SOCKET: env.CLAMAV_SOCKET, CLAMAV_TIMEOUT_MS: env.CLAMAV_TIMEOUT_MS, CLAMAV_MAX_DATABASE_AGE_HOURS: env.CLAMAV_MAX_DATABASE_AGE_HOURS });
    const healthy = scanner !== "unavailable";
    return NextResponse.json({ status: healthy ? "ok" : "unavailable", environment: env.DEPLOY_TARGET, release, database: "ready", scanner, checkedAt: new Date().toISOString() }, { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable", release, database: "unavailable", checkedAt: new Date().toISOString() }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";

export const dynamic = "force-dynamic";

async function releaseIdentity() {
  try { return (await readFile(`${process.cwd()}/.release-sha`, "utf8")).trim(); }
  catch { return process.env.DEPLOYMENT_VERSION ?? process.env.RELEASE_SHA ?? process.env.GITHUB_SHA ?? "local"; }
}

export async function GET(request: Request) {
  try {
    const env = getServerEnv();
    const admin = createAdminClient();
    const { error } = await admin.from("tenants").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    const release = await releaseIdentity();
    const expected = new URL(request.url).searchParams.get("release");
    if (expected && expected !== release) return NextResponse.json({ status: "release_mismatch", environment: env.DEPLOY_TARGET, release, database: "ready", checkedAt: new Date().toISOString() }, { status: 409, headers: { "cache-control": "no-store" } });
    return NextResponse.json({ status: "ok", environment: env.DEPLOY_TARGET, release, database: "ready", checkedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable", release: await releaseIdentity(), database: "unavailable", checkedAt: new Date().toISOString() }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

import { redirect } from "next/navigation";
import { resetWorkspaceHome } from "@/lib/auth/workspace-destination";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ next?: string; invite?: string }> }) {
  const params = await searchParams;
  const next = resetWorkspaceHome(params.next);
  redirect(`/login?next=${encodeURIComponent(next)}`);
}

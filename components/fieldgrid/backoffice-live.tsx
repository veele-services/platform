"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Only a tenant-scoped revision crosses realtime. Every refresh resolves the
 * current actor and hostname again; open forms keep their existing state. */
export function BackofficeLive({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    let timer = 0;
    const refresh = () => {
      if (!active || !navigator.onLine || document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { if (active) router.refresh(); }, 200);
    };
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const connect = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!active || error || !session?.access_token) return;
      await supabase.realtime.setAuth(session.access_token);
      if (!active) return;
      channel = supabase.channel(`backoffice-revision-${tenantId}`, {
        config: { postgres_changes_options: { wait: true } },
      }).on("postgres_changes", {
        event: "*", schema: "public", table: "staff_workspace_revisions", filter: `tenant_id=eq.${tenantId}`,
      }, refresh);
      channel.subscribe(state => { if (state === "SUBSCRIBED") refresh(); });
    };
    void connect().catch(() => undefined);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    // Recover missed updates after a transient realtime outage.
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, tenantId]);
  return null;
}

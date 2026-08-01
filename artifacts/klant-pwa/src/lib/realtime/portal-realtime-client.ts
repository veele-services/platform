type SubscribeStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED" | string;

type SupabaseRealtimeClient = {
  channel: (topic: string) => any;
  removeChannel: (channel: any) => unknown;
};

export type PortalRealtimeSubscriptionOptions = {
  client: SupabaseRealtimeClient;
  realtimeKey: string;
  channelPrefix: string;
  scheduleRefresh: (force?: boolean) => void;
  onStatus?: (status: "connecting" | "active" | "error") => void;
};

export function createPortalRefreshScheduler(input: {
  router: { refresh: () => void };
  timerRef: { current: ReturnType<typeof setTimeout> | null };
  lastRefreshAtRef: { current: number };
  debounceMs?: number;
  minRefreshIntervalMs?: number;
  isOnline?: () => boolean;
}) {
  const debounceMs = input.debounceMs ?? 220;
  const minRefreshIntervalMs = input.minRefreshIntervalMs ?? 15_000;
  const isOnline =
    input.isOnline ??
    (() => typeof navigator === "undefined" || navigator.onLine !== false);

  return (force = false) => {
    const now = Date.now();
    if (!force && now - input.lastRefreshAtRef.current < minRefreshIntervalMs) {
      return;
    }

    if (input.timerRef.current) {
      clearTimeout(input.timerRef.current);
    }

    input.timerRef.current = setTimeout(() => {
      input.timerRef.current = null;
      if (!isOnline()) {
        return;
      }
      input.lastRefreshAtRef.current = Date.now();
      input.router.refresh();
    }, debounceMs);
  };
}

export function subscribeToPortalRealtimeEvents(options: PortalRealtimeSubscriptionOptions) {
  let closed = false;
  let projectionWatermark = 0;
  options.onStatus?.("connecting");

  const channel = options.client
    .channel(`${options.channelPrefix}:${options.realtimeKey}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "portal_realtime_events",
        filter: `realtime_key=eq.${options.realtimeKey}`,
      },
      (change: { new?: { projection_version?: number | string | null } }) => {
        const version = Number(change.new?.projection_version ?? 0);
        if (closed || !Number.isSafeInteger(version) || version <= projectionWatermark) return;
        projectionWatermark = version;
        options.scheduleRefresh(true);
      },
    )
    .subscribe((status: SubscribeStatus) => {
      if (closed) return;
      if (status === "SUBSCRIBED") {
        options.onStatus?.("active");
        options.scheduleRefresh(true);
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        options.onStatus?.("error");
      }
    });

  return () => {
    closed = true;
    void options.client.removeChannel(channel);
  };
}

type TriggerNotificationWorkerOptions = {
  channels?: Array<"email" | "push">;
  limit?: number;
};

export async function triggerNotificationWorker(
  options: TriggerNotificationWorkerOptions = {},
): Promise<void> {
  const adminSecret = process.env["ADMIN_API_SECRET"];
  const apiBaseUrl =
    process.env["API_INTERNAL_URL"] ??
    (process.env["API_PORT"] ? `http://127.0.0.1:${process.env["API_PORT"]}` : null);

  if (!adminSecret || !apiBaseUrl) return;

  const params = new URLSearchParams();
  params.set("limit", String(Math.min(Math.max(options.limit ?? 25, 1), 250)));
  if (options.channels?.length) params.set("channels", options.channels.join(","));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${apiBaseUrl}/api/admin/notification-worker?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminSecret}` },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("notification worker trigger failed", {
        status: response.status,
        body: await response.text().catch(() => ""),
      });
    }
  } catch (error) {
    console.error("notification worker trigger failed", error);
  } finally {
    clearTimeout(timeout);
  }
}

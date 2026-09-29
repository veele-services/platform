import "server-only";

import { getServerEnv, requireProvider } from "@/lib/env/server";

export async function sendEmail(input: { fromEmail: string; fromName: string; to: string; subject: string; text: string; html: string; attachment?: { filename: string; bytes: Uint8Array }; deliveryKey: string; disableTracking?: boolean }) {
  const endpoint = new URL("v3/mail/send", getServerEnv().SENDGRID_API_BASE);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${requireProvider("SENDGRID_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }], custom_args: { fieldgrid_delivery: input.deliveryKey.slice(0, 100) } }],
      from: { email: input.fromEmail, name: input.fromName }, subject: input.subject,
      content: [{ type: "text/plain", value: input.text }, { type: "text/html", value: input.html }],
      ...(input.disableTracking ? { tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false }, subscription_tracking: { enable: false }, ganalytics: { enable: false } } } : {}),
      ...(input.attachment ? { attachments: [{ filename: input.attachment.filename, content: Buffer.from(input.attachment.bytes).toString("base64"), type: "application/pdf", disposition: "attachment" }] } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 202) {
    const payload = await response.json().catch(() => ({})) as { errors?: Array<{ message?: string }> };
    throw new Error(payload.errors?.[0]?.message ?? `SendGrid gaf HTTP ${response.status}`);
  }
  return { id: response.headers.get("x-message-id") ?? input.deliveryKey };
}

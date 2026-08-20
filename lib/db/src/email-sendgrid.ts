export type SendGridApiRegion = "global" | "eu";

export type SendGridMailConfig = {
  apiKey: string;
  apiRegion: SendGridApiRegion;
  fromEmail: string;
  fromName?: string | null;
  replyTo?: string | null;
};

export type SendGridMailAttachment = {
  filename: string;
  content: Buffer;
};

export type SendGridMailInput = {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: SendGridMailAttachment[];
  deliveryKey?: string;
};

const SENDGRID_ENDPOINTS: Record<SendGridApiRegion, string> = {
  global: "https://api.sendgrid.com/v3/mail/send",
  eu: "https://api.eu.sendgrid.com/v3/mail/send",
};

export function normalizeSendGridApiRegion(value: string | null | undefined): SendGridApiRegion {
  return value === "eu" ? "eu" : "global";
}

export function sendGridMailEndpoint(region: SendGridApiRegion): string {
  return SENDGRID_ENDPOINTS[region];
}

export function buildSendGridMailPayload(
  config: SendGridMailConfig,
  input: SendGridMailInput,
): Record<string, unknown> {
  return {
    personalizations: [
      {
        to: input.to.map((email) => ({ email })),
        ...(input.deliveryKey
          ? { custom_args: { fieldgrid_delivery_key: input.deliveryKey } }
          : {}),
      },
    ],
    from: {
      email: config.fromEmail,
      ...(config.fromName ? { name: config.fromName } : {}),
    },
    ...(config.replyTo ? { reply_to: { email: config.replyTo } } : {}),
    subject: input.subject,
    ...(input.deliveryKey
      ? { headers: { "X-Fieldgrid-Delivery-Key": input.deliveryKey } }
      : {}),
    content: [
      ...(input.text ? [{ type: "text/plain", value: input.text }] : []),
      { type: "text/html", value: input.html },
    ],
    ...(input.attachments?.length
      ? {
          attachments: input.attachments.map((attachment) => ({
            content: attachment.content.toString("base64"),
            filename: attachment.filename,
            disposition: "attachment",
          })),
        }
      : {}),
  };
}

async function sendGridError(response: Response): Promise<string> {
  const body = (await response.text()).slice(0, 1600);
  if (!body) return `SendGrid heeft HTTP ${response.status} teruggegeven.`;

  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{ message?: string; field?: string }>;
    };
    const details = parsed.errors
      ?.map((error) => [error.message, error.field ? `(veld: ${error.field})` : null].filter(Boolean).join(" "))
      .filter(Boolean)
      .join("; ");
    if (details) {
      return `SendGrid heeft HTTP ${response.status} teruggegeven: ${details}`;
    }
  } catch {
    // SendGrid can return a non-JSON proxy response. Keep only a bounded body.
  }

  return `SendGrid heeft HTTP ${response.status} teruggegeven: ${body}`;
}

export async function sendSendGridMail(
  config: SendGridMailConfig,
  input: SendGridMailInput,
  fetchImplementation: typeof fetch = fetch,
): Promise<string | null> {
  const response = await fetchImplementation(sendGridMailEndpoint(config.apiRegion), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildSendGridMailPayload(config, input)),
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status !== 202) {
    throw new Error(await sendGridError(response));
  }

  return response.headers.get("x-message-id");
}

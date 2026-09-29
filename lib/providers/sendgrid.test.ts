import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  getServerEnv: vi.fn(() => ({ SENDGRID_API_BASE: "https://api.sendgrid.com/" })),
  requireProvider: vi.fn(() => "SG.test-key-with-mail-send-rights"),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => env);

import { sendEmail } from "./sendgrid";

const input = {
  fromEmail: "facturen@fieldgrid.test",
  fromName: "Fieldgrid",
  to: "klant@example.test",
  subject: "Factuur FG-1",
  text: "Bijgevoegd staat factuur FG-1.",
  attachment: { filename: "FG-1.pdf", bytes: new Uint8Array([37, 80, 68, 70]) },
  deliveryKey: "invoice-1-version-1",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SendGrid provider", () => {
  it("stuurt de factuur via Mail Send met bearer-auth en base64-bijlage", async () => {
    const request = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>();
    request.mockResolvedValue(new Response(null, { status: 202, headers: { "x-message-id": "sg-message-1" } }));
    vi.stubGlobal("fetch", request);

    await expect(sendEmail(input)).resolves.toEqual({ id: "sg-message-1" });
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toBe("https://api.sendgrid.com/v3/mail/send");
    expect(init?.headers).toEqual({ authorization: "Bearer SG.test-key-with-mail-send-rights", "content-type": "application/json" });
    const body = JSON.parse(String(init?.body));
    expect(body.personalizations[0]).toEqual({
      to: [{ email: "klant@example.test" }],
      custom_args: { fieldgrid_delivery: "invoice-1-version-1" },
    });
    expect(body.attachments[0]).toMatchObject({ filename: "FG-1.pdf", content: "JVBERg==", type: "application/pdf" });
  });

  it("accepteert uitsluitend SendGrid HTTP 202", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "Afzender is niet geverifieerd" }] }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })));

    await expect(sendEmail(input)).rejects.toThrow("Afzender is niet geverifieerd");
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSendGridMailPayload,
  normalizeSendGridApiRegion,
  sendGridMailEndpoint,
  sendSendGridMail,
} from "../../lib/db/src/email-sendgrid";

test("SendGrid endpoints are fixed to the selected supported region", () => {
  assert.equal(normalizeSendGridApiRegion(undefined), "global");
  assert.equal(normalizeSendGridApiRegion("global"), "global");
  assert.equal(normalizeSendGridApiRegion("eu"), "eu");
  assert.equal(normalizeSendGridApiRegion("https://attacker.example"), "global");
  assert.equal(sendGridMailEndpoint("global"), "https://api.sendgrid.com/v3/mail/send");
  assert.equal(sendGridMailEndpoint("eu"), "https://api.eu.sendgrid.com/v3/mail/send");
});

test("SendGrid payload carries recipients, Fieldgrid sender, content and attachments", () => {
  const payload = buildSendGridMailPayload(
    {
      apiKey: "SG.secret",
      apiRegion: "global",
      fromEmail: "noreply@fieldgrid.nl",
      fromName: "Fieldgrid",
      replyTo: "support@fieldgrid.nl",
    },
    {
      to: ["danny@example.nl"],
      subject: "Test",
      text: "Tekst",
      html: "<p>Tekst</p>",
      attachments: [
        {
          filename: "rapport.pdf",
          content: Buffer.from("pdf"),
        },
      ],
    },
  );

  assert.deepEqual(payload, {
    personalizations: [{ to: [{ email: "danny@example.nl" }] }],
    from: { email: "noreply@fieldgrid.nl", name: "Fieldgrid" },
    reply_to: { email: "support@fieldgrid.nl" },
    subject: "Test",
    content: [
      { type: "text/plain", value: "Tekst" },
      { type: "text/html", value: "<p>Tekst</p>" },
    ],
    attachments: [
      {
        content: Buffer.from("pdf").toString("base64"),
        filename: "rapport.pdf",
        disposition: "attachment",
      },
    ],
  });
});

test("SendGrid transport uses Bearer authentication and requires HTTP 202", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const mockedFetch = async (input: string | URL | globalThis.Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(null, {
      status: 202,
      headers: { "x-message-id": "sendgrid-message-id" },
    });
  };

  const messageId = await sendSendGridMail(
    {
      apiKey: "SG.not-a-real-key",
      apiRegion: "global",
      fromEmail: "noreply@fieldgrid.nl",
      fromName: "Fieldgrid",
    },
    {
      to: ["admin@example.nl"],
      subject: "Test",
      html: "<p>Test</p>",
    },
    mockedFetch as typeof fetch,
  );

  assert.equal(requestUrl, "https://api.sendgrid.com/v3/mail/send");
  assert.equal(requestInit?.method, "POST");
  assert.deepEqual(requestInit?.headers, {
    Authorization: "Bearer SG.not-a-real-key",
    "Content-Type": "application/json",
  });
  assert.equal(messageId, "sendgrid-message-id");

  await assert.rejects(
    sendSendGridMail(
      {
        apiKey: "SG.not-a-real-key",
        apiRegion: "global",
        fromEmail: "noreply@fieldgrid.nl",
      },
      {
        to: ["admin@example.nl"],
        subject: "Test",
        html: "<p>Test</p>",
      },
      (async () =>
        new Response(
          JSON.stringify({
            errors: [
              {
                message: "The from address does not match a verified Sender Identity.",
              },
            ],
          }),
          { status: 403 },
        )) as typeof fetch,
    ),
    /HTTP 403.*verified Sender Identity/u,
  );
});

test("SendGrid carries the stable notification delivery key on provider retries", () => {
  const deliveryKey = "notification:10000000-0000-4000-8000-000000000001";
  const payload = buildSendGridMailPayload(
    {
      apiKey: "SG.secret",
      apiRegion: "eu",
      fromEmail: "noreply@fieldgrid.nl",
    },
    {
      to: ["ontvanger@example.nl"],
      subject: "Herhaalbaar",
      html: "<p>Herhaalbaar</p>",
      deliveryKey,
    },
  );

  assert.deepEqual(payload["headers"], {
    "X-Fieldgrid-Delivery-Key": deliveryKey,
  });
  assert.deepEqual(payload["personalizations"], [
    {
      to: [{ email: "ontvanger@example.nl" }],
      custom_args: { fieldgrid_delivery_key: deliveryKey },
    },
  ]);
});

import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:65432/fieldgrid_test";

async function sensitiveOtpSender() {
  return (await import("../../lib/db/src/email-service")).sendSensitiveOtpEmail;
}

test("sensitive OTP uses an in-memory fake without the general outbox", async () => {
  const sendSensitiveOtpEmail = await sensitiveOtpSender();
  const captured: Array<{ to: string; subject: string; html: string; text: string }> = [];
  const result = await sendSensitiveOtpEmail(
    {
      to: "beheer@example.test",
      code: "000042",
      tenantId: "11111111-1111-4111-8111-111111111111",
    },
    { testTransport: async (message) => { captured.push(message); } },
  );
  assert.equal(result.success, true);
  assert.equal(captured.length, 1);
  assert.match(captured[0]!.text, /000042/u);
  assert.equal(result.providerId, "sensitive-otp-memory-transport");
});

test("sensitive OTP rejects malformed codes before transport", async () => {
  const sendSensitiveOtpEmail = await sensitiveOtpSender();
  let called = false;
  const result = await sendSensitiveOtpEmail(
    {
      to: "beheer@example.test",
      code: "12345",
      tenantId: "11111111-1111-4111-8111-111111111111",
    },
    { testTransport: async () => { called = true; } },
  );
  assert.equal(result.success, false);
  assert.equal(called, false);
});

import { expect, test } from "@playwright/test";

const validLead = {
  kind: "contact",
  name: "QA Test",
  organisation: "Testomgeving",
  email: "qa@example.invalid",
  phone: "+31 20 000 0000",
  message: "Dit is uitsluitend een synthetische API-testaanvraag.",
  consent: true,
  website: "",
};

test.describe("lead API", () => {
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL),
    "API-mutaties worden alleen tegen de lokale, uitgeschakelde afleveradapter uitgevoerd.",
  );
  test.describe.configure({ mode: "serial" });

  test("requires JSON", async ({ request }) => {
    const response = await request.post("/api/contact", {
      data: "geen json",
      headers: { "Content-Type": "text/plain" },
    });

    expect(response.status()).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "unsupported_media_type",
    });
  });

  test("rejects missing consent without echoing submitted values", async ({ request }) => {
    const response = await request.post("/api/contact", {
      data: { ...validLead, consent: false },
    });
    const body = await response.text();

    expect(response.status()).toBe(422);
    expect(JSON.parse(body)).toMatchObject({ ok: false, code: "validation_failed" });
    expect(body).not.toContain(validLead.email);
    expect(body).not.toContain(validLead.message);
  });

  test("silently accepts a filled honeypot without delivery", async ({ request }) => {
    const response = await request.post("/api/contact", {
      data: { ...validLead, website: "https://bot.invalid" },
    });

    expect(response.status()).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  test("does not claim delivery when no adapter is configured", async ({ request }) => {
    const response = await request.post("/api/contact", { data: validLead });
    const body = await response.json();

    expect(response.status()).toBe(503);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(body).toMatchObject({ ok: false, code: "not_configured" });
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("rejects cross-site browser origins", async ({ request }) => {
    const response = await request.post("/api/contact", {
      data: validLead,
      headers: {
        Origin: "https://kwaadaardig.invalid",
        "Sec-Fetch-Site": "cross-site",
      },
    });

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "origin_not_allowed",
    });
  });
});

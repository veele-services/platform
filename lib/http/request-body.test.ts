import { describe, expect, it } from "vitest";
import { readBoundedJson, readBoundedRequestBody, RequestBodyTooLargeError } from "./request-body";

describe("bounded route-handler bodies", () => {
  it("rejects a declared oversized body before reading it", async () => {
    const request = new Request("https://fieldgrid.test/", {
      method: "POST",
      headers: { "content-length": "1000" },
      body: "{}",
    });
    await expect(readBoundedRequestBody(request, 100)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it("rejects a chunked body that exceeds the actual byte limit", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("a".repeat(60)));
        controller.enqueue(new TextEncoder().encode("b".repeat(60)));
        controller.close();
      },
    });
    const request = new Request("https://fieldgrid.test/", { method: "POST", body: stream, duplex: "half" } as RequestInit & { duplex: string });
    await expect(readBoundedRequestBody(request, 100)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it("parses a bounded JSON payload", async () => {
    const request = new Request("https://fieldgrid.test/", { method: "POST", body: JSON.stringify({ ok: true }) });
    await expect(readBoundedJson(request, 100)).resolves.toEqual({ ok: true });
  });
});

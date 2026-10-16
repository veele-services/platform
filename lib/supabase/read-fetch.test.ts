import {expect, it, vi} from "vitest";
import {createReadResilientFetch} from "./read-fetch";

function disconnected() {
  return new TypeError("fetch failed", {cause: Object.assign(new Error("other side closed"), {code: "UND_ERR_SOCKET"})});
}

it("repeats a dropped read with identical request options, retaining authorization and cache policy", async () => {
  const response = new Response("fresh");
  const transport = vi.fn<typeof fetch>().mockRejectedValueOnce(disconnected()).mockResolvedValue(response);
  const options = {headers: {Authorization: "fixture-only"}, cache: "no-store" as const};
  expect(await createReadResilientFetch(transport)("https://example.invalid/rest/v1/tenants", options)).toBe(response);
  expect(transport.mock.calls).toEqual([["https://example.invalid/rest/v1/tenants", options], ["https://example.invalid/rest/v1/tenants", options]]);
});

it.each(["POST", "PUT", "PATCH", "DELETE"])("never replays a %s mutation after an unknown outcome", async method => {
  const error = disconnected();
  const transport = vi.fn<typeof fetch>().mockRejectedValue(error);
  await expect(createReadResilientFetch(transport)(new Request("https://example.invalid/rpc", {method}))).rejects.toBe(error);
  expect(transport).toHaveBeenCalledTimes(1);
});

it("does not retry denied, throttled, or failed HTTP responses", async () => {
  for (const status of [401, 403, 429, 500]) {
    const response = new Response(null, {status});
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    expect(await createReadResilientFetch(transport)("https://example.invalid")).toBe(response);
    expect(transport).toHaveBeenCalledTimes(1);
  }
});

it("does not retry an aborted read or unrelated exceptions", async () => {
  const controller = new AbortController(); controller.abort();
  for (const [error, signal] of [[disconnected(), controller.signal], [new TypeError("invalid request"), undefined]] as const) {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(createReadResilientFetch(transport)("https://example.invalid", {signal})).rejects.toBe(error);
    expect(transport).toHaveBeenCalledTimes(1);
  }
});

it("stops after two retries and preserves the last connection error", async () => {
  const error = disconnected(); const transport = vi.fn<typeof fetch>().mockRejectedValue(error);
  await expect(createReadResilientFetch(transport)("https://example.invalid")).rejects.toBe(error);
  expect(transport).toHaveBeenCalledTimes(3);
});

it("honors cancellation during the retry delay", async () => {
  const controller = new AbortController();
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => {setTimeout(() => controller.abort(), 10); throw disconnected();});
  await expect(createReadResilientFetch(transport)("https://example.invalid", {signal: controller.signal})).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(1);
});

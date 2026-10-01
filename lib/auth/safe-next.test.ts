import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("post-authentication destinations", () => {
  it.each([undefined, null, "", "https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/\t/evil.invalid", "/\n/evil.invalid", "/\r/evil.invalid", "/a\u0000b", "/a\u007fb"])("rejects unsafe destination %j", (value) => {
    expect(safeNext(value)).toBe("/app");
  });
  it.each(["%2F%5Cevil.invalid", "%2F%09%2Fevil.invalid", "%2F%0A%2Fevil.invalid"])("rejects decoded query attack %s", (value) => {
    expect(safeNext(new URLSearchParams(`next=${value}`).get("next"))).toBe("/app");
  });
  it.each(["/a/..//evil.invalid", "/.//evil.invalid", "/%2e//evil.invalid", "/a/%2e%2e//evil.invalid"])("rejects normalized network path %s", (value) => {
    expect(safeNext(value)).toBe("/app");
  });
  it.each(["/app", "/staff", "/klant", "/auth/reset", "/app/klanten?q=Jansen%20BV#details"])("preserves local destination %s", (value) => {
    expect(safeNext(value)).toBe(value);
  });
});

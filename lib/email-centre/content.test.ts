import { describe, expect, it } from "vitest";
import { mailContentSchema, mailPlainText, renderMailBlocks } from "./content";
describe("safe mail blocks", () => {
  it("escapes text and renders two columns and a usable plain alternative", () => {
    const content = mailContentSchema.parse({ subject: "Fictieve nieuwsbrief", blocks: [{ type: "columns", columns: [[{ type: "text", text: "A & B" }], [{ type: "button", text: "Lees meer", url: "https://example.invalid/nieuws" }]] }] });
    expect(renderMailBlocks(content.blocks)).toContain("A &amp; B"); expect(mailPlainText(content)).toContain("Lees meer: https://example.invalid/nieuws");
  });
  it("rejects HTML, executable URLs, extra fields and recursive layout", () => {
    for (const block of [{ type: "text", text: "<script>alert(1)</script>" }, { type: "button", text: "Open", url: "javascript:alert(1)" }, { type: "image", url: "https://user:pass@example.invalid/a", alt: "Foto" }, { type: "divider", onclick: "x" }, { type: "columns", columns: [[], [], []] }]) expect(() => renderMailBlocks([block])).toThrow();
  });
});

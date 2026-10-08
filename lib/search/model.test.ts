import { describe, expect, it } from "vitest";
import { literalSearchFilter, searchInput } from "./model";
describe("literal search terms", () => {
  it("quotes PostgREST syntax and escapes wildcard characters as literal text", () => {
    const query = 'name,or(x)._%"\\';
    const filter = literalSearchFilter(["name"], query);
    expect(filter.startsWith("name.ilike.\"")).toBe(true);
    expect(JSON.parse(filter.slice("name.ilike.".length))).toBe('%name,or(x).\\_\\%"\\\\%');
  });
  it("trims terms and bounds search size", () => {
    expect(searchInput.parse({ query: "  hello  " }).query).toBe("hello");
    for (const query of [" ", "aa", "x".repeat(101)]) expect(searchInput.safeParse({ query }).success).toBe(false);
  });
});

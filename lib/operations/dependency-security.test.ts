import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const requireFromRoot = createRequire(`${process.cwd()}/package.json`);

function requireThroughDependencyChain(names: string[]) {
  let scopedRequire = requireFromRoot;
  for (const name of names.slice(0, -1)) {
    scopedRequire = createRequire(scopedRequire.resolve(name));
  }
  return scopedRequire(names.at(-1)!);
}

describe("temporary braces security patch", () => {
  it("keeps the version-only audit exception tied to a committed patch", () => {
    const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
    const patch = readFileSync("patches/braces@3.0.3.patch", "utf8");
    expect(workspace).toContain("GHSA-vfj7-8cjw-p6xm");
    expect(workspace).toContain("braces@3.0.3: patches/braces@3.0.3.patch");
    expect(patch).toContain("MAX_DEPTH: 100");
    expect(patch).toContain("AST parent chain contains a cycle");
  });

  it("rejects advisory-sized nesting in the installed lint dependency", () => {
    const braces = requireThroughDependencyChain([
      "eslint-config-next",
      "@next/eslint-plugin-next",
      "fast-glob",
      "micromatch",
      "braces",
    ]) as ((pattern: string) => string[]) & { expand(pattern: string): string[] };
    const nested = (depth: number) => `${"{".repeat(depth)}x${"}".repeat(depth)}`;
    expect(() => braces(nested(101))).toThrow(/max depth/i);
    expect(() => braces.expand(nested(101))).toThrow(/max depth/i);
    expect(() => braces(nested(4))).not.toThrow();
  });
});

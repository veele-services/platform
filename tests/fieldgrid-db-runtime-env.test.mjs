import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("db cli entrypoints load deployment env files before requiring DATABASE_URL", () => {
  const runtimeEnv = read("lib/db/src/runtime-env.ts");
  const dbIndex = read("lib/db/src/index.ts");
  const migrate = read("lib/db/src/migrate.ts");
  const stagingSeed = read("lib/db/src/seed/staging-demo.ts");
  const drizzleConfig = read("lib/db/drizzle.config.ts");

  assertContains(
    runtimeEnv,
    [
      "ENV_FILE_NAMES",
      "\".env\"",
      "\".env.production\"",
      "process.cwd()",
      "fileURLToPath(import.meta.url)",
      "if (!process.env[rawKey]) process.env[rawKey] = value",
    ],
    "db runtime env loader",
  );

  for (const [label, content] of [
    ["db index", dbIndex],
    ["migration runner", migrate],
    ["staging seed", stagingSeed],
    ["drizzle config", drizzleConfig],
  ]) {
    assertContains(content, ["loadDbRuntimeEnv();", "DATABASE_URL"], label);
  }
});

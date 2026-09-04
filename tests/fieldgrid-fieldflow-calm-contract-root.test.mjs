import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function independentRoot(manifest) {
  const payload = {
    schemaVersion: manifest.schemaVersion,
    name: manifest.name,
    algorithm: manifest.algorithm,
    serialization: manifest.serialization,
    trustPolicy: manifest.trustPolicy,
    digests: manifest.digests,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

test("independent oracle pins the reviewed Fieldflow Calm contract root", () => {
  const manifest = JSON.parse(
    readFileSync(
      resolve(
        ROOT,
        "docs/uiux/fieldflow-calm-handoff/manifests/contract-root.json",
      ),
      "utf8",
    ),
  );
  assert.match(manifest.rootSha256, /^[0-9a-f]{64}$/u);
  assert.equal(manifest.rootSha256, independentRoot(manifest));
});

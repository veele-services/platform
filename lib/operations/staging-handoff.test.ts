import { readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("encrypted staging handoff", () => {
  it("removes plaintext and produces a root-decryptable CMS envelope", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fieldgrid-handoff-"));
    directories.push(directory);
    const key = join(directory, "handoff.key");
    const certificate = join(directory, "handoff.crt");
    const source = join(directory, "runtime.env");
    const envelope = join(directory, "runtime.env.cms");
    const decrypted = join(directory, "runtime.decoded");
    const payload = 'NODE_ENV="production"\nSECRET="with\\\\slash\\\"quote"\n';
    writeFileSync(source, payload, { mode: 0o600 });

    const generated = spawnSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "2",
      "-subj", "/CN=Fieldgrid staging handoff test", "-keyout", key, "-out", certificate,
    ], { encoding: "utf8" });
    expect(generated.status, generated.stderr).toBe(0);

    const encrypted = spawnSync("bash", ["scripts/encrypt-staging-handoff.sh", source, envelope], {
      encoding: "utf8",
      env: {
        ...process.env,
        RUNNER_TEMP: directory,
        STAGING_HANDOFF_ENCRYPTION_CERT_B64: readFileSync(certificate).toString("base64"),
      },
    });
    expect(encrypted.status, encrypted.stderr).toBe(0);
    expect(() => statSync(source)).toThrow();
    expect(statSync(envelope).mode & 0o777).toBe(0o600);

    const decoded = spawnSync("openssl", [
      "cms", "-decrypt", "-binary", "-inform", "DER", "-in", envelope,
      "-recip", certificate, "-inkey", key, "-out", decrypted,
    ], { encoding: "utf8" });
    expect(decoded.status, decoded.stderr).toBe(0);
    expect(await readFile(decrypted, "utf8")).toBe(payload);
  });
});

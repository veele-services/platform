import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  SUPABASE_ROOT_2021_CA_SHA256,
  databaseNodePostgresSslConfig,
  installDatabaseRootCertificateFromBase64,
  validateDatabaseRootCertificateFile,
} from "../../scripts/fieldgrid-database-root-cert.mjs";
import { SUPABASE_ROOT_2021_CA_PEM } from "../fixtures/fieldgrid-supabase-root-2021-ca.mjs";

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "fieldgrid-database-ca-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, certificatePath: join(directory, "supabase-root.crt") };
}

test("pinned Supabase root installs as a private regular file", (t) => {
  const { certificatePath } = fixture(t);
  const installed = installDatabaseRootCertificateFromBase64({
    encodedCertificate: Buffer.from(SUPABASE_ROOT_2021_CA_PEM).toString(
      "base64",
    ),
    outputPath: certificatePath,
  });

  assert.equal(installed.fingerprintSha256, SUPABASE_ROOT_2021_CA_SHA256);
  assert.equal(statSync(certificatePath).mode & 0o777, 0o600);
  assert.equal(
    readFileSync(certificatePath, "utf8"),
    SUPABASE_ROOT_2021_CA_PEM,
  );
  assert.deepEqual(
    databaseNodePostgresSslConfig({
      DB_SSL: "true",
      DB_SSL_REJECT_UNAUTHORIZED: "true",
      PGSSLMODE: "verify-full",
      FIELDGRID_DATABASE_SSL_ROOT_CERT: certificatePath,
    }),
    {
      rejectUnauthorized: true,
      ca: SUPABASE_ROOT_2021_CA_PEM,
    },
  );
});

test("certificate validation rejects tampering, permissive modes and symlinks", (t) => {
  const { directory, certificatePath } = fixture(t);
  writeFileSync(certificatePath, SUPABASE_ROOT_2021_CA_PEM, { mode: 0o600 });

  chmodSync(certificatePath, 0o644);
  assert.throws(
    () => validateDatabaseRootCertificateFile(certificatePath),
    /permissions must be 0600/u,
  );
  chmodSync(certificatePath, 0o600);

  const linkPath = join(directory, "linked-root.crt");
  symlinkSync(certificatePath, linkPath);
  assert.throws(
    () => validateDatabaseRootCertificateFile(linkPath),
    /bounded regular file/u,
  );

  writeFileSync(
    certificatePath,
    SUPABASE_ROOT_2021_CA_PEM.replace("MIIDxD", "MIIDxE"),
    {
      mode: 0o600,
    },
  );
  assert.throws(
    () => validateDatabaseRootCertificateFile(certificatePath),
    /not valid X\.509|fingerprint is not trusted/u,
  );

  writeFileSync(
    certificatePath,
    `${SUPABASE_ROOT_2021_CA_PEM}${SUPABASE_ROOT_2021_CA_PEM}`,
    { mode: 0o600 },
  );
  assert.throws(
    () => validateDatabaseRootCertificateFile(certificatePath),
    /exactly one canonical PEM certificate/u,
  );
});

test("certificate installer rejects non-canonical or unpinned base64", (t) => {
  const { certificatePath } = fixture(t);
  assert.throws(
    () =>
      installDatabaseRootCertificateFromBase64({
        encodedCertificate: "not base64",
        outputPath: certificatePath,
      }),
    /canonical base64/u,
  );
  assert.throws(
    () =>
      installDatabaseRootCertificateFromBase64({
        encodedCertificate: Buffer.from("not a certificate").toString("base64"),
        outputPath: certificatePath,
      }),
    /not valid X\.509/u,
  );
});

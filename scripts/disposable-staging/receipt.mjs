import { chmod, mkdir, open, readFile, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  CONTRACT,
  REPOSITORY,
  STAGING_PROJECT_REF,
  requireThat,
} from "./contract.mjs";

export const RECEIPT_FILE = "receipt.json";

async function assertPrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
  const info = await stat(path);
  requireThat(
    info.isDirectory() && (info.mode & 0o777) === 0o700,
    "RECEIPT_DIRECTORY_INVALID",
  );
}

export async function writeReceipt(path, receipt) {
  requireThat(
    receipt?.contract === CONTRACT &&
      receipt.repository === REPOSITORY &&
      receipt.project === STAGING_PROJECT_REF,
    "RECEIPT_IDENTITY_INVALID",
  );
  const directory = dirname(path);
  await assertPrivateDirectory(directory);
  const temporary = join(
    directory,
    `.receipt-${process.pid}-${Date.now()}-${receipt.attempt}.tmp`,
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  const directoryHandle = await open(directory, "r");
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}

export async function readReceipt(path, { optional = false } = {}) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    throw error;
  }
  let receipt;
  try {
    receipt = JSON.parse(raw);
  } catch {
    throw new Error("RECEIPT_JSON_INVALID");
  }
  requireThat(
    receipt?.contract === CONTRACT &&
      receipt.repository === REPOSITORY &&
      receipt.project === STAGING_PROJECT_REF,
    "RECEIPT_IDENTITY_INVALID",
  );
  return receipt;
}

export function receiptPath(baseDir) {
  requireThat(baseDir === "/var/www/veele/staging", "BASE_DIRECTORY_INVALID");
  return join(baseDir, "shared", "disposable-staging-rebuild", RECEIPT_FILE);
}

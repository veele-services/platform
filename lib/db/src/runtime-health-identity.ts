import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const applications = {
  backoffice: "backoffice",
  personnel: "personeel-pwa",
  customer: "klant-pwa",
  api: "api-server",
} as const;

export type RuntimeHealthService = keyof typeof applications;

/** Capture this process's physical release, never the mutable current symlink. */
export function runtimeHealthHeaders(
  service: RuntimeHealthService,
  { cwd = process.cwd(), environment = process.env.APP_ENV }: { cwd?: string; environment?: string } = {},
): Readonly<Record<string, string>> {
  let release = "unknown";
  let descriptor: number | undefined;
  try {
    const directory = realpathSync(cwd);
    if (basename(directory) === applications[service] && basename(dirname(directory)) === "artifacts") {
      const marker = join(dirname(dirname(directory)), ".fieldgrid-release-sha");
      descriptor = openSync(marker, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const info = fstatSync(descriptor);
      if (info.isFile() && info.size >= 40 && info.size <= 41) {
        const buffer = Buffer.alloc(42);
        const length = readSync(descriptor, buffer, 0, buffer.length, 0);
        const value = buffer.subarray(0, length).toString("utf8");
        if (/^[a-f0-9]{40}\n?$/u.test(value)) release = value.trim();
      }
    }
  } catch {
    // Local development has no release marker. Hosted deploy gates reject unknown.
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return Object.freeze({
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "X-Fieldgrid-Environment": environment === "production" || environment === "staging" ? environment : "unknown",
    "X-Fieldgrid-Release": release,
    "X-Fieldgrid-Service": service,
  });
}

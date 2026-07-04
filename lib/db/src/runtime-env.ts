import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_FILE_NAMES = [".env", ".env.local", ".env.production"] as const;

let loaded = false;

function ancestorDirs(startDir: string): string[] {
  const dirs: string[] = [];
  let current = resolve(startDir);

  while (true) {
    dirs.push(current);
    const parent = dirname(current);
    if (parent === current) return dirs;
    current = parent;
  }
}

function findRuntimeEnvFile(): string | null {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const starts = [process.cwd(), moduleDir];
  const seen = new Set<string>();

  for (const start of starts) {
    for (const dir of ancestorDirs(start)) {
      if (seen.has(dir)) continue;
      seen.add(dir);

      for (const fileName of ENV_FILE_NAMES) {
        const candidate = join(dir, fileName);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  return null;
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const quote = trimmed[0];
  if ((quote !== "\"" && quote !== "'") || trimmed.at(-1) !== quote) return trimmed;

  const inner = trimmed.slice(1, -1);
  if (quote === "'") return inner;

  return inner
    .replace(/\\n/gu, "\n")
    .replace(/\\r/gu, "\r")
    .replace(/\\t/gu, "\t")
    .replace(/\\"/gu, "\"")
    .replace(/\\\\/gu, "\\");
}

function loadEnvLine(line: string): void {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex === -1) return;

  const rawKey = trimmed.slice(0, equalsIndex).replace(/^export\s+/u, "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(rawKey)) return;

  const value = unquoteEnvValue(trimmed.slice(equalsIndex + 1));
  if (!process.env[rawKey]) process.env[rawKey] = value;
}

export function loadDbRuntimeEnv(): void {
  if (loaded) return;
  loaded = true;

  const envFile = findRuntimeEnvFile();
  if (!envFile) return;

  const content = readFileSync(envFile, "utf8");
  for (const line of content.split(/\r?\n/u)) {
    loadEnvLine(line);
  }
}

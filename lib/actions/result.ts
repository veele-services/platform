export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export function message(error: unknown): string {
  return error instanceof Error ? error.message : "Onbekende fout";
}

/** A post-authentication destination is a local path, never a second origin. */
export function safeNext(value?: string | null): string {
  const fallback = "/app";
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const base = new URL("https://fieldgrid.invalid");
    const target = new URL(value, base);
    // Dot-segment normalization can turn /a/..//host into //host. The caller
    // resolves this returned path again, so validate that representation too.
    if (target.origin !== base.origin || target.pathname.startsWith("//")) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

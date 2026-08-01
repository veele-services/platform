const navigationHrefPattern =
  /(?:\bhref\s*=|\bhref\s*:)\s*(?:\{\s*)?(["'`])([^"'`]+)\1\s*\}?/gu;

export function extractNavigationHrefs(content) {
  return [...content.matchAll(navigationHrefPattern)].map((match) => match[2]);
}

export function normalizeNavigationHref(href) {
  return (
    href
      .split(/[?#]/u)[0]
      .replace(/\$\{[^}]+\}/gu, ":param")
      .replace(/\/$/u, "") || "/"
  );
}

export function findBrokenLocalNavigationHrefs({
  content,
  file,
  routePatterns,
  shouldSkipHref,
}) {
  const checked = [];
  const failures = [];

  for (const href of extractNavigationHrefs(content)) {
    if (!href.startsWith("/") || shouldSkipHref(href)) continue;
    checked.push({ file, href });
    const pathname = normalizeNavigationHref(href);
    if (!routePatterns.some((pattern) => pattern.test(pathname))) {
      failures.push({ id: "broken-local-href", file, href });
    }
  }

  return { checked, failures };
}

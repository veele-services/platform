/** Recognize provider integrations without banning the ordinary invitation verb. */
export function hasForbiddenMailProvider(path: string, source: string): boolean {
  if (path === "package.json") {
    const manifest = JSON.parse(source);
    return ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
      .some((section) => Object.entries(manifest[section] ?? {}).some(([name, value]) =>
        /^(?:resend$|@resend\/)/i.test(name) || /\bnpm:(?:resend|@resend\/)/i.test(String(value))));
  }
  if (path === "pnpm-lock.yaml") {
    return /^\s*['"]?(?:resend(?=@|['"]?:)|@resend\/[^\s:'"]+)|\bnpm:(?:resend|@resend\/)/im.test(source);
  }
  return /\bresend\.com\b/i.test(source)
    || /\bRESEND_[A-Z][A-Z0-9_]*\b/i.test(source)
    || /\bnew\s+Resend\s*\(/i.test(source)
    || /\b(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s*)['"](?:resend(?:\/[^'"]*)?|@resend\/[^'"]+)['"]/i.test(source);
}

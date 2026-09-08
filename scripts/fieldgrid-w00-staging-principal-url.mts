const DNS_HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

export function assertSafeStagingDatabaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("The explicit staging database URL is invalid.");
  }

  const databasePath = parsed.pathname.startsWith("/")
    ? parsed.pathname.slice(1)
    : "";
  const port = Number(parsed.port);

  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    !DNS_HOSTNAME_PATTERN.test(parsed.hostname) ||
    !parsed.username ||
    !parsed.password ||
    !parsed.port ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    !databasePath ||
    databasePath.includes("/")
  ) {
    throw new Error(
      "The explicit staging database URL must bind its protocol, host, port, database, and credentials.",
    );
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new Error(
      "The explicit staging database URL must not contain connection overrides.",
    );
  }

  return value;
}

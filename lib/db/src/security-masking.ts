const EMPTY_MASK = "••••";

export function maskEmail(value: string | null | undefined): string {
  if (!value) return EMPTY_MASK;
  const [local, domain] = value.split("@");
  if (!domain) return maskName(value);
  const prefix = local.slice(0, Math.min(2, local.length));
  return `${prefix}${"*".repeat(Math.max(3, local.length - prefix.length))}@${domain}`;
}

export function maskPhone(value: string | null | undefined): string {
  if (!value) return EMPTY_MASK;
  const digits = value.replace(/\D/g, "");
  const suffix = digits.slice(-3);
  const prefix = value.trim().startsWith("+") ? value.trim().slice(0, 3) : "";
  return `${prefix} ******${suffix || "***"}`.trim();
}

export function maskIban(value: string | null | undefined): string {
  if (!value) return EMPTY_MASK;
  const compact = value.replace(/\s/g, "").toUpperCase();
  if (compact.length <= 8) return EMPTY_MASK;
  return `${compact.slice(0, 4)} **** **** ${compact.slice(-4)}`;
}

export function maskName(value: string | null | undefined): string {
  if (!value) return EMPTY_MASK;
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => (index === 0 ? `${part.slice(0, 1)}.` : `${part.slice(0, 1)}***`))
    .join(" ");
}

export function maskPaymentProviderId(value: string | null | undefined): string {
  if (!value) return EMPTY_MASK;
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function maskAddress(input: { street?: string | null; city?: string | null; postalCode?: string | null } | null | undefined): string {
  if (!input) return EMPTY_MASK;
  return input.city ? `Adres verborgen, ${input.city}` : "Adres verborgen";
}

export function maskReference(value: string | null | undefined): string {
  if (!value) return EMPTY_MASK;
  if (value.length <= 6) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 3)}…${value.slice(-3)}`;
}

export function redactLogMetadata<T extends Record<string, unknown>>(metadata: T): Record<string, unknown> {
  const sensitiveKeys = /email|phone|iban|bank|token|secret|authorization|password|checkout|payload|address|name/i;
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, sensitiveKeys.test(key) ? "[REDACTED]" : value]),
  );
}

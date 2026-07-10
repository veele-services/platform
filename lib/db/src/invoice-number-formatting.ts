export const INVOICE_NUMBER_ALLOWED_TOKENS = ["PREFIX", "YYYY", "YY", "MM", "NUMBER"] as const;
export type InvoiceNumberToken = (typeof INVOICE_NUMBER_ALLOWED_TOKENS)[number];

export const INVOICE_NUMBER_RESET_PERIODS = ["never", "yearly", "monthly"] as const;
export type InvoiceNumberResetPeriod = (typeof INVOICE_NUMBER_RESET_PERIODS)[number];

export type InvoiceNumberingConfig = {
  prefix: string;
  format: string;
  numberPadding: number;
  resetPeriod: InvoiceNumberResetPeriod | string;
  defaultStartNumber?: number;
};

export type InvoiceNumberPreview = {
  invoiceNumber: string;
  sequenceValue: number;
  periodKey: string;
};

export type InvoiceNumberValidationResult = {
  valid: boolean;
  errors: string[];
};

const ALLOWED_TOKEN_SET = new Set<string>(INVOICE_NUMBER_ALLOWED_TOKENS);
const TOKEN_PATTERN = /\{([A-Z]+)\}/gu;
const PREFIX_PATTERN = /^[A-Z]{3}$/u;

function parseInvoiceNumberDate(value: Date | string = new Date()): Date {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error("Ongeldige factuurdatum voor factuurnummering.");
  }
  return date;
}

function dateParts(value: Date | string = new Date()) {
  const date = parseInvoiceNumberDate(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return {
    yyyy: String(year),
    yy: String(year).slice(-2),
    mm: month,
  };
}

export function validateInvoiceNumberingConfig(config: InvoiceNumberingConfig): InvoiceNumberValidationResult {
  const errors: string[] = [];
  const prefix = config.prefix?.trim() ?? "";
  const format = config.format?.trim() ?? "";
  const padding = Number(config.numberPadding);
  const startNumber = Number(config.defaultStartNumber ?? 1);

  if (!PREFIX_PATTERN.test(prefix)) {
    errors.push("Prefix moet exact 3 hoofdletters bevatten.");
  }

  if (!format) {
    errors.push("Factuurnummerformaat is verplicht.");
  }
  if (!format.includes("{PREFIX}")) {
    errors.push("Factuurnummerformaat moet {PREFIX} bevatten.");
  }
  if (!format.includes("{NUMBER}")) {
    errors.push("Factuurnummerformaat moet {NUMBER} bevatten.");
  }

  const tokens = [...format.matchAll(TOKEN_PATTERN)].map((match) => match[1] ?? "");
  for (const token of tokens) {
    if (!ALLOWED_TOKEN_SET.has(token)) {
      errors.push(`Onbekende factuurnummertoken: {${token}}.`);
    }
  }
  const formatWithoutKnownTokens = format.replace(TOKEN_PATTERN, (match, token: string) =>
    ALLOWED_TOKEN_SET.has(token) ? "" : match,
  );
  if (/\{[^}]*\}/u.test(formatWithoutKnownTokens)) {
    errors.push("Factuurnummerformaat bevat onbekende of ongeldige tokens.");
  }

  if (!Number.isInteger(padding) || padding < 3 || padding > 8) {
    errors.push("Padding moet een geheel getal tussen 3 en 8 zijn.");
  }
  if (!Number.isInteger(startNumber) || startNumber < 1) {
    errors.push("Startnummer moet minimaal 1 zijn.");
  }
  if (!INVOICE_NUMBER_RESET_PERIODS.includes(config.resetPeriod as InvoiceNumberResetPeriod)) {
    errors.push("Resetperiode moet never, yearly of monthly zijn.");
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidInvoiceNumberingConfig(config: InvoiceNumberingConfig): asserts config is InvoiceNumberingConfig {
  const validation = validateInvoiceNumberingConfig(config);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }
}

export function getInvoiceNumberPeriodKey(
  resetPeriod: InvoiceNumberResetPeriod | string,
  invoiceDate: Date | string = new Date(),
): string {
  const parts = dateParts(invoiceDate);
  switch (resetPeriod) {
    case "never":
      return "all";
    case "yearly":
      return parts.yyyy;
    case "monthly":
      return `${parts.yyyy}-${parts.mm}`;
    default:
      throw new Error("Onbekende resetperiode voor factuurnummering.");
  }
}

export function formatInvoiceNumber(
  config: InvoiceNumberingConfig,
  sequenceValue: number,
  invoiceDate: Date | string = new Date(),
): string {
  assertValidInvoiceNumberingConfig(config);
  if (!Number.isInteger(sequenceValue) || sequenceValue < 1) {
    throw new Error("Factuurnummersequence moet minimaal 1 zijn.");
  }

  const parts = dateParts(invoiceDate);
  const number = String(sequenceValue).padStart(config.numberPadding, "0");
  return config.format
    .replaceAll("{PREFIX}", config.prefix)
    .replaceAll("{YYYY}", parts.yyyy)
    .replaceAll("{YY}", parts.yy)
    .replaceAll("{MM}", parts.mm)
    .replaceAll("{NUMBER}", number);
}

export function previewInvoiceNumber(
  config: InvoiceNumberingConfig,
  nextNumber: number,
  invoiceDate: Date | string = new Date(),
): InvoiceNumberPreview {
  return {
    invoiceNumber: formatInvoiceNumber(config, nextNumber, invoiceDate),
    sequenceValue: nextNumber,
    periodKey: getInvoiceNumberPeriodKey(config.resetPeriod, invoiceDate),
  };
}

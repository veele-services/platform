const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ENDPOINT_PATTERN =
  /^\/api\/website-forms\/[0-9a-f-]{36}\/submissions$/iu;

export type MarketingFormKind = "contact" | "offerte" | "sollicitatie";

type MarketingFormValues = {
  kind: MarketingFormKind;
  name: FormDataEntryValue | null;
  organisation: FormDataEntryValue | null;
  email: FormDataEntryValue | null;
  phone: FormDataEntryValue | null;
  message: FormDataEntryValue | null;
  website: FormDataEntryValue | null;
  submissionId: string;
};

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export function getFieldgridFormSubmissionEndpoint(
  configuredFormId: string | undefined,
): string | null {
  const formId = configuredFormId?.trim() ?? "";
  return UUID_PATTERN.test(formId)
    ? `/api/website-forms/${formId}/submissions`
    : null;
}

export async function resolveFieldgridFormSubmissionEndpoint(): Promise<
  string | null
> {
  try {
    const response = await fetch("/fieldgrid-runtime/form-config", {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    if (
      !payload ||
      typeof payload !== "object" ||
      !("enabled" in payload) ||
      payload.enabled !== true ||
      !("endpoint" in payload) ||
      typeof payload.endpoint !== "string" ||
      !ENDPOINT_PATTERN.test(payload.endpoint)
    ) {
      return null;
    }
    return payload.endpoint;
  } catch {
    return null;
  }
}

export function buildFieldgridFormSubmission(values: MarketingFormValues) {
  const subject =
    values.kind === "offerte"
      ? "Offerteaanvraag"
      : values.kind === "sollicitatie"
        ? "Sollicitatie"
        : "Contactaanvraag";

  return {
    data: {
      name: stringValue(values.name),
      email: stringValue(values.email),
      phone: stringValue(values.phone),
      company: stringValue(values.organisation),
      subject,
      message: stringValue(values.message),
    },
    _submissionId: values.submissionId,
    _companyWebsite: stringValue(values.website),
  };
}

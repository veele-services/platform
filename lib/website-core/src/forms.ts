import { z } from "zod/v4";

export const WEBSITE_FORM_KINDS = [
  "contact",
  "quote",
  "callback",
  "emergency",
] as const;
export type WebsiteFormKind = (typeof WEBSITE_FORM_KINDS)[number];

export const WEBSITE_FORM_STATUSES = [
  "draft",
  "published",
  "archived",
] as const;
export type WebsiteFormStatus = (typeof WEBSITE_FORM_STATUSES)[number];

export const WEBSITE_FORM_FIELD_KEYS = [
  "name",
  "email",
  "phone",
  "company",
  "postalCode",
  "subject",
  "preferredDate",
  "message",
] as const;
export type WebsiteFormFieldKey = (typeof WEBSITE_FORM_FIELD_KEYS)[number];

export const WEBSITE_FORM_SUBMISSION_STATUSES = [
  "new",
  "read",
  "in_progress",
  "converted",
  "archived",
  "spam",
] as const;
export type WebsiteFormSubmissionStatus =
  (typeof WEBSITE_FORM_SUBMISSION_STATUSES)[number];

export const WEBSITE_FORM_NOTIFICATION_STATUSES = [
  "pending",
  "sending",
  "sent",
  "failed",
  "skipped",
] as const;
export type WebsiteFormNotificationStatus =
  (typeof WEBSITE_FORM_NOTIFICATION_STATUSES)[number];

const formKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/u);
const localeSchema = z.string().regex(/^[a-z]{2}-[A-Z]{2}$/u);
const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const websiteFormFieldSchema = z
  .object({
    key: z.enum(WEBSITE_FORM_FIELD_KEYS),
    label: z.string().trim().min(1).max(120),
    required: z.boolean().default(false),
    placeholder: z.string().trim().max(180).nullable().default(null),
  })
  .strict();
export type WebsiteFormField = z.output<typeof websiteFormFieldSchema>;

const fieldsSchema = z
  .array(websiteFormFieldSchema)
  .min(1)
  .max(12)
  .superRefine((fields, context) => {
    const seen = new Set<WebsiteFormFieldKey>();
    for (const [index, field] of fields.entries()) {
      if (seen.has(field.key)) {
        context.addIssue({
          code: "custom",
          path: [index, "key"],
          message: "Een formulierveld mag maar één keer voorkomen",
        });
      }
      seen.add(field.key);
    }
    if (!seen.has("email") && !seen.has("phone")) {
      context.addIssue({
        code: "custom",
        message:
          "Een formulier moet ten minste een e-mailadres of telefoonnummer vragen",
      });
    }
  });

export const websiteFormDraftSchema = z
  .object({
    key: formKeySchema,
    locale: localeSchema,
    kind: z.enum(WEBSITE_FORM_KINDS),
    name: z.string().trim().min(1).max(160),
    fields: fieldsSchema,
    submitLabel: z.string().trim().min(1).max(80),
    successMessage: z.string().trim().min(1).max(500),
    notificationEmail: emailSchema.nullable(),
    status: z.enum(WEBSITE_FORM_STATUSES),
  })
  .strict();
export type WebsiteFormDraft = z.output<typeof websiteFormDraftSchema>;

/**
 * Public, immutable form definition embedded in a website publication.
 * Notification recipients and all processing metadata deliberately stay out of
 * the public snapshot.
 */
export const websitePublicationFormSchema = z
  .object({
    id: z.string().uuid(),
    key: formKeySchema,
    locale: localeSchema,
    kind: z.enum(WEBSITE_FORM_KINDS),
    name: z.string().trim().min(1).max(160),
    fields: fieldsSchema,
    submitLabel: z.string().trim().min(1).max(80),
    successMessage: z.string().trim().min(1).max(500),
  })
  .strict();
export type WebsitePublicationForm = z.output<
  typeof websitePublicationFormSchema
>;

export const websitePublicationFormsSchema = z
  .array(websitePublicationFormSchema)
  .max(100)
  .default([]);

export const websiteFormSourceSchema = websitePublicationFormSchema
  .extend({
    status: z.enum(WEBSITE_FORM_STATUSES),
  })
  .strict();
export type WebsiteFormSource = z.output<typeof websiteFormSourceSchema>;

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);

export const websiteFormSubmissionDataSchema = z
  .object({
    name: optionalText(160),
    email: optionalText(254).pipe(emailSchema.optional()),
    phone: optionalText(50),
    company: optionalText(160),
    postalCode: optionalText(20),
    subject: optionalText(180),
    preferredDate: optionalText(40),
    message: optionalText(5_000),
  })
  .strict();
export type WebsiteFormSubmissionData = z.output<
  typeof websiteFormSubmissionDataSchema
>;

const fieldValueLimits: Record<WebsiteFormFieldKey, number> = {
  name: 160,
  email: 254,
  phone: 50,
  company: 160,
  postalCode: 20,
  subject: 180,
  preferredDate: 40,
  message: 5_000,
};

export function validateWebsiteFormSubmissionData(
  form: Pick<WebsitePublicationForm, "fields">,
  rawData: unknown,
): WebsiteFormSubmissionData {
  const parsed = websiteFormSubmissionDataSchema.parse(rawData);
  const configured = new Set(form.fields.map((field) => field.key));

  for (const key of WEBSITE_FORM_FIELD_KEYS) {
    const value = parsed[key];
    if (value !== undefined && !configured.has(key)) {
      throw new z.ZodError([
        {
          code: "custom",
          input: value,
          path: [key],
          message: "Dit veld hoort niet bij dit formulier",
        },
      ]);
    }
    if (value && value.length > fieldValueLimits[key]) {
      throw new z.ZodError([
        {
          code: "too_big",
          input: value,
          origin: "string",
          maximum: fieldValueLimits[key],
          inclusive: true,
          path: [key],
          message: "De ingevulde waarde is te lang",
        },
      ]);
    }
  }
  for (const field of form.fields) {
    if (field.required && !parsed[field.key]) {
      throw new z.ZodError([
        {
          code: "custom",
          input: parsed[field.key],
          path: [field.key],
          message: `${field.label} is verplicht`,
        },
      ]);
    }
  }
  return Object.fromEntries(
    form.fields.flatMap((field) => {
      const value = parsed[field.key];
      return value === undefined ? [] : [[field.key, value]];
    }),
  ) as WebsiteFormSubmissionData;
}

export const DEFAULT_CONTACT_FORM_FIELDS: WebsiteFormField[] =
  fieldsSchema.parse([
    {
      key: "name",
      label: "Naam",
      required: true,
      placeholder: null,
    },
    {
      key: "email",
      label: "E-mailadres",
      required: true,
      placeholder: null,
    },
    {
      key: "phone",
      label: "Telefoonnummer",
      required: false,
      placeholder: null,
    },
    {
      key: "message",
      label: "Bericht",
      required: true,
      placeholder: null,
    },
  ]);

export function resolvePublicationForm(
  forms: readonly WebsitePublicationForm[],
  input: { formId: string | null; locale: string },
): WebsitePublicationForm | null {
  if (input.formId) {
    return (
      forms.find(
        (form) => form.id === input.formId && form.locale === input.locale,
      ) ?? null
    );
  }
  return (
    forms.find(
      (form) => form.key === "contact" && form.locale === input.locale,
    ) ??
    forms.find(
      (form) => form.kind === "contact" && form.locale === input.locale,
    ) ??
    null
  );
}

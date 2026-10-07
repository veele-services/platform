import { z } from "zod";
import { addressSchema } from "@/lib/addresses/model";

const id=z.uuid(),text=z.string(),version=z.number().int().positive().safe();
const revision=z.number().int().nonnegative().safe();
const moment=z.iso.datetime({offset:true}).nullable();
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable();

export const customerAccountOptionSchema=z.object({id,name:text}).strict();
export const customerAccountOptionsSchema=z.array(customerAccountOptionSchema);
export const customerProfileSchema=z.object({
 fullName:text,email:z.email(),company:text,phone:text,invoiceEmail:text,
 street:text,postalCode:text,city:text,companyNumber:text,address:addressSchema.optional(),
 customerVersion:version,contactVersion:revision,
}).strict();
export const customerInstructionSchema=z.object({id,body:text,version,createdAt:z.iso.datetime({offset:true}),author:text}).strict();
export const customerObjectSchema=z.object({
 id,number:text,name:text,type:z.enum(["office","residential","school","care","retail","industrial","other"]),
 status:z.enum(["draft","active","paused","archived"]),size:z.number().positive().max(1_000_000).nullable(),version,
 street:text,postalCode:text,city:text,contact:text,phone:text,address:addressSchema.optional(),
 contactVersion:revision,contactRecordVersion:revision,services:z.array(text),instructions:z.array(customerInstructionSchema),
}).strict();
export const customerVisitSchema=z.object({
 id,objectId:id,number:text,service:text,status:text,start:moment,end:moment,actualStart:moment,actualEnd:moment,version,
}).strict();
export const customerWorkspaceSchema=z.object({
 account:z.object({id,version,canCreateObjects:z.boolean(),canEditObjects:z.boolean(),canEditProfile:z.boolean(),
  onboardingStep:z.number().int().min(0).max(3),onboardingCompletedAt:moment}).strict(),
 tenant:z.object({name:text,slug:text,timezone:text,primaryColor:color,accentColor:color,hasLogo:z.boolean(),
  whiteLabel:z.boolean(),phone:text,planning:z.boolean(),finance:z.boolean(),paymentConfigured:z.boolean(),reports:z.boolean(),tickets:z.boolean()}).strict(),
 profile:customerProfileSchema,objects:z.array(customerObjectSchema),visits:z.array(customerVisitSchema),
}).strict();
export type CustomerWorkspace=z.infer<typeof customerWorkspaceSchema>;
export type CustomerObject=z.infer<typeof customerObjectSchema>;
export type CustomerVisit=z.infer<typeof customerVisitSchema>;
export type CustomerProfile=z.infer<typeof customerProfileSchema>;
export type CustomerAccountOption=z.infer<typeof customerAccountOptionSchema>;

export const customerViews=["dashboard","objects","appointments","reports","invoices","requests","tickets","news","profile"] as const;
export type CustomerView=typeof customerViews[number];
export const customerViewSchema=z.enum(customerViews);
export const customerPreferenceGroups=["appointments","reports","invoices","tickets","news"] as const;
export const customerPreferencesSchema=z.object({appointments:z.boolean(),reports:z.boolean(),invoices:z.boolean(),tickets:z.boolean(),news:z.boolean()}).strict();
export type CustomerPreferences=z.infer<typeof customerPreferencesSchema>;

// Login email, customer/tenant IDs, ownership and invoice terms are not editable.
export const customerProfileInputSchema=z.object({
 firstName:text.trim().min(1).max(80),lastName:text.trim().min(1).max(100),company:text.trim().min(2).max(180),
 phone:text.trim().min(5).max(40),invoiceEmail:z.email().max(254),street:text.trim().min(2).max(200),
 postalCode:text.trim().regex(/^[1-9][0-9]{3} ?[A-Za-z]{2}$/,"Gebruik een Nederlandse postcode."),city:text.trim().min(2).max(100),
 address:addressSchema.optional(),companyNumber:text.regex(/^(?:[0-9]{8})?$/,"Gebruik acht cijfers of laat het KvK-nummer leeg."),
}).strict();
export const customerObjectInputSchema=z.object({
 id:id.optional(),version:revision,name:text.trim().min(2).max(160),type:customerObjectSchema.shape.type,
 size:z.number().positive().max(1_000_000).nullable(),street:text.trim().min(2).max(200),
 postalCode:text.trim().regex(/^[1-9][0-9]{3} ?[A-Za-z]{2}$/),city:text.trim().min(2).max(100),
 contact:text.trim().min(2).max(180),phone:text.trim().min(5).max(40),contactVersion:revision,contactRecordVersion:revision,
 instruction:text.trim().max(10_000),address:addressSchema.optional(),
}).strict();
export type CustomerProfileInput=z.infer<typeof customerProfileInputSchema>;
export type CustomerObjectInput=z.infer<typeof customerObjectInputSchema>;

export const customerOnboardingContactSchema=customerProfileInputSchema.pick({firstName:true,lastName:true,company:true,phone:true}).strict();
export const customerOnboardingDraftSchema=z.object({step:z.number().int().min(0).max(3),version,
 contact:z.object({firstName:text.max(80),lastName:text.max(100),company:text.max(180),phone:text.max(40)}).partial().strict(),object:customerObjectInputSchema.omit({id:true}).strict().nullable(),preferences:customerPreferencesSchema,
}).strict();
export type CustomerOnboardingDraft=z.infer<typeof customerOnboardingDraftSchema>;
export const customerPreferenceStateSchema=z.object({version:revision,groups:customerPreferencesSchema}).strict();
export const customerBaseSnapshotSchema=z.object({workspace:customerWorkspaceSchema,draft:customerOnboardingDraftSchema,preferences:customerPreferenceStateSchema}).strict();
export type CustomerBaseSnapshot=z.infer<typeof customerBaseSnapshotSchema>;
export const customerOnboardingInputSchema=z.object({mode:z.enum(["save","complete","review"]),expectedVersion:version,customerVersion:version,contactVersion:version,preferenceVersion:revision,
 step:z.number().int().min(0).max(3),contact:customerOnboardingContactSchema,object:customerObjectInputSchema.omit({id:true}).strict().refine(value=>value.version===0&&value.contactVersion===0&&value.contactRecordVersion===0,"Gebruik een nieuw eerste object.").nullable(),
 preferences:customerPreferencesSchema,confirmed:z.boolean(),
}).strict().refine(value=>value.mode!=="complete"||value.step===3&&value.confirmed,"Controleer en bevestig je gegevens.")
 .refine(value=>value.mode!=="review"||value.confirmed,"Bevestig dat je de gewijzigde brongegevens hebt gecontroleerd.");
export type CustomerOnboardingInput=z.infer<typeof customerOnboardingInputSchema>;
export const customerServiceRequestInputSchema=z.object({service:text.trim().min(2).max(100),objectIds:z.array(id).max(25).refine(values=>new Set(values).size===values.length,"Selecteer ieder object eenmaal."),
 frequency:z.enum(["Eenmalig","Wekelijks","Maandelijks","In overleg"]),preferredOn:z.iso.date().nullable(),description:text.trim().min(3).max(10000),
}).strict();
export type CustomerServiceRequestInput=z.infer<typeof customerServiceRequestInputSchema>;
export const customerInstructionInputSchema=z.object({objectId:id,version,body:text.trim().min(2).max(10000)}).strict();

export function profileInput(profile:CustomerProfile):CustomerProfileInput {
 const [firstName="",...lastName]=profile.fullName.split(/\s+/);
 return {firstName,lastName:lastName.join(" "),company:profile.company,phone:profile.phone,invoiceEmail:profile.invoiceEmail,
  street:profile.street,postalCode:profile.postalCode,city:profile.city,companyNumber:profile.companyNumber,...(profile.address?{address:profile.address}:{})};
}

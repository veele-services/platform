export type PersonnelWorkOrderSignatureState = {
  customerSignedAt?: Date | string | null;
  customerSignatureDataUrl?: string | null;
};

export const SIGNED_WORK_ORDER_LOCK_MESSAGE =
  "Deze werkbon is door de klant ondertekend en kan niet meer worden gewijzigd";

export function personnelWorkOrderIsSigned(
  assignment: PersonnelWorkOrderSignatureState,
): boolean {
  return Boolean(
    assignment.customerSignedAt || assignment.customerSignatureDataUrl?.trim(),
  );
}

import "server-only";
import {
  addressSchema,
  normalizeAddress,
  changeAddress,
  type Address,
} from "./model";
import { lookupAddress } from "./pdok";

export async function addressFromForm(
  form: FormData,
  name = "addressPayload",
  required = false,
): Promise<Address> {
  const raw = form.get(name);
  let a =
    typeof raw === "string" && raw
      ? addressSchema.parse(JSON.parse(raw))
      : normalizeAddress({
          street: form.get("street") || "",
          postal_code: form.get("postalCode") || "",
          city: form.get("city") || "",
        });
  if (a.status === "confirmed") {
    if (a.source !== "pdok" || !a.source_id)
      throw new Error(
        "Selecteer het adres opnieuw om de locatie te bevestigen.",
      );
    const fresh = await lookupAddress(a.source_id);
    for (const field of [
      "street_name",
      "house_number",
      "house_letter",
      "house_addition",
      "postal_code",
      "city",
      "country",
    ] as const) {
      if (a[field] !== fresh[field])
        throw new Error(
          "Het adres is gewijzigd. Selecteer het juiste zoekresultaat opnieuw.",
        );
    }
    a = fresh;
  } else a = changeAddress(a, {});
  if (required && (!a.street_name || !a.postal_code || !a.city))
    throw new Error("Vul straat, postcode en plaats in.");
  if (!a.street_name && !a.postal_code && !a.city) a.status = "missing";
  return a;
}

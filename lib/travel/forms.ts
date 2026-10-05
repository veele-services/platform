import "server-only";
import { z } from "zod";
import { addressFromForm } from "@/lib/addresses/form";
import { vehicleKeys } from "@/lib/travel/model";
export async function mobilityFromForm(form: FormData) {
  const vehicle = z
    .enum(["", ...vehicleKeys])
    .parse(form.get("standardVehicle") || "");
  const departure = z
    .enum(["", "home", "depot", "custom"])
    .parse(form.get("departureKind") || "");
  const depot = z
    .string()
    .uuid()
    .or(z.literal(""))
    .parse(form.get("departureDepotId") || "");
  return {
    standard_vehicle: vehicle || null,
    departure_kind: departure || null,
    departure_depot_id: depot || null,
    return_to_departure: form.get("returnToDeparture") === "on",
    home_address: await addressFromForm(form, "homeAddress"),
    alternate_departure_address: await addressFromForm(
      form,
      "departureAddress",
    ),
  };
}

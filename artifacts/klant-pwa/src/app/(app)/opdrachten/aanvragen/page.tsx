export const dynamic = "force-dynamic";

import { RequestAssignmentForm } from "./RequestAssignmentForm";
import { getMyObjects } from "@/actions/objects";
import { getMyCustomerId } from "@/actions/customer";
import { redirect } from "next/navigation";

export default async function AanvragenPage() {
  const customerId = await getMyCustomerId();
  if (!customerId) {
    redirect("/klant/login?error=" + encodeURIComponent("Geen klantprofiel gevonden."));
  }

  const objects = await getMyObjects();

  return (
    <div className="space-y-4 p-4 md:p-0">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
          Opdracht aanvragen
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-secondary)" }}>
          Vul het formulier in en wij nemen zo snel mogelijk contact op.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <RequestAssignmentForm objects={objects} />
      </div>
    </div>
  );
}

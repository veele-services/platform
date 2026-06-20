export const dynamic = "force-dynamic";

import { RequestAssignmentForm } from "./RequestAssignmentForm";
import { getCustomerObjectSectors, getMyObjects } from "@/actions/objects";
import { getMyCustomerId } from "@/actions/customer";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";

export default async function AanvragenPage() {
  const customerId = await getMyCustomerId();
  if (!customerId) {
    redirect("/login?error=" + encodeURIComponent("Geen klantprofiel gevonden."));
  }

  const [objects, sectors] = await Promise.all([
    getMyObjects(),
    getCustomerObjectSectors(),
  ]);

  return (
    <PageShell title="Opdracht aanvragen" subtitle="Vul het formulier in en wij nemen zo snel mogelijk contact op.">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <RequestAssignmentForm objects={objects} sectors={sectors} />
      </div>
    </PageShell>
  );
}

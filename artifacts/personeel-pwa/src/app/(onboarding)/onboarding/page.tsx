import {
  getPersonnelOnboardingWorkspace,
  personnelOnboardingRequiredForCurrentMembership,
} from "@/actions/onboarding";
import { PersonnelOnboardingWizard } from "@/components/onboarding/PersonnelOnboardingWizard";
import { getPersonnelPwaBranding, pwaDisplayName } from "@/lib/pwa-branding";
import { redirect } from "next/navigation";

export default async function PersonnelOnboardingPage() {
  if (!(await personnelOnboardingRequiredForCurrentMembership())) {
    redirect("/personeel");
  }
  const branding = await getPersonnelPwaBranding();
  const workspace = await getPersonnelOnboardingWorkspace(
    pwaDisplayName(branding),
  );
  return <PersonnelOnboardingWizard workspace={workspace} />;
}

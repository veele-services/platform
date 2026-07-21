import { getPersonnelOnboardingWorkspace } from "@/actions/onboarding";
import { PersonnelOnboardingWizard } from "@/components/onboarding/PersonnelOnboardingWizard";
import { getPersonnelPwaBranding, pwaDisplayName } from "@/lib/pwa-branding";

export default async function PersonnelOnboardingPage() {
  const branding = await getPersonnelPwaBranding();
  const workspace = await getPersonnelOnboardingWorkspace(
    pwaDisplayName(branding),
  );
  return <PersonnelOnboardingWizard workspace={workspace} />;
}

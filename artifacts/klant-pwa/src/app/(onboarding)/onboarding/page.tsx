import { getCustomerOnboardingWorkspace } from "@/actions/onboarding";
import { CustomerOnboardingWizard } from "@/components/onboarding/CustomerOnboardingWizard";
import { getCustomerPwaBranding, pwaDisplayName } from "@/lib/pwa-branding";

export default async function CustomerOnboardingPage() {
  const branding = await getCustomerPwaBranding();
  const workspace = await getCustomerOnboardingWorkspace(
    pwaDisplayName(branding),
  );
  return <CustomerOnboardingWizard workspace={workspace} />;
}

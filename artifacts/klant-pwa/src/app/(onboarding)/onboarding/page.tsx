import {
  customerOnboardingRequiredForCurrentMembership,
  getCustomerOnboardingWorkspace,
} from "@/actions/onboarding";
import { CustomerOnboardingWizard } from "@/components/onboarding/CustomerOnboardingWizard";
import { getCustomerPwaBranding, pwaDisplayName } from "@/lib/pwa-branding";
import { redirect } from "next/navigation";

export default async function CustomerOnboardingPage() {
  if (!(await customerOnboardingRequiredForCurrentMembership())) {
    redirect("/klant");
  }
  const branding = await getCustomerPwaBranding();
  const workspace = await getCustomerOnboardingWorkspace(
    pwaDisplayName(branding),
  );
  return <CustomerOnboardingWizard workspace={workspace} />;
}

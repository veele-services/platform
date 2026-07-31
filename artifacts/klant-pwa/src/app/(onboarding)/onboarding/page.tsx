import {
  customerOnboardingRequiredForCurrentMembership,
  getCustomerOnboardingWorkspace,
} from "@/actions/onboarding";
import { getMyCustomerContextState } from "@/actions/customer";
import { CustomerOnboardingWizard } from "@/components/onboarding/CustomerOnboardingWizard";
import { getCustomerPwaBranding, pwaDisplayName } from "@/lib/pwa-branding";
import { redirect } from "next/navigation";

export default async function CustomerOnboardingPage() {
  const customerContext = await getMyCustomerContextState();
  if (customerContext.selectionRequired) {
    redirect("/klant/context-kiezen");
  }
  if (!(await customerOnboardingRequiredForCurrentMembership())) {
    redirect("/klant");
  }
  const branding = await getCustomerPwaBranding();
  const workspace = await getCustomerOnboardingWorkspace(
    pwaDisplayName(branding),
  );
  return <CustomerOnboardingWizard workspace={workspace} />;
}

import { getCustomerFeatureHelp } from "@/actions/knowledgebase";
import { FeatureHelp } from "@/components/FeatureHelp";

type ResolvedFeatureHelpProps = {
  featureKey: string;
  moduleKey?: string | null;
  className?: string;
};

export async function ResolvedFeatureHelp({ featureKey, moduleKey, className }: ResolvedFeatureHelpProps) {
  const help = await getCustomerFeatureHelp(featureKey, moduleKey);
  if (!help) return null;

  return <FeatureHelp help={help} className={className} />;
}

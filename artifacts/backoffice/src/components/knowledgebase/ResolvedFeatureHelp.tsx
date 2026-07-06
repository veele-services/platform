import { FeatureHelp } from "@/components/knowledgebase/FeatureHelp";
import { getPlatformFeatureHelp, getTenantFeatureHelp } from "@/app/actions/knowledgebase-help";
import type { FieldgridContentAudience } from "@workspace/db";

type ResolvedFeatureHelpProps = {
  featureKey: string;
  moduleKey?: string | null;
  audience?: FieldgridContentAudience;
  surface?: "platform" | "tenant";
  className?: string;
};

export async function ResolvedFeatureHelp({
  featureKey,
  moduleKey,
  audience,
  surface = "tenant",
  className,
}: ResolvedFeatureHelpProps) {
  const help = surface === "platform"
    ? await getPlatformFeatureHelp(featureKey, moduleKey)
    : await getTenantFeatureHelp(featureKey, moduleKey, audience);

  if (!help) return null;

  return (
    <FeatureHelp
      title={help.title}
      description={help.description}
      articleHref={help.articleHref}
      articleLabel={help.articleLabel}
      relatedArticles={help.relatedArticles.map((article) => ({
        title: article.title,
        href: article.href ?? undefined,
      }))}
      placement={help.placement}
      showRelatedArticles={help.showRelatedArticles}
      className={className}
    />
  );
}

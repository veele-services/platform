import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { getNewsAudienceOptions, listNewsPosts } from "@/app/actions/news";
import { NewsView } from "@/components/news/NewsView";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";

export const metadata: Metadata = {
  title: "Nieuws",
};

export default async function NewsPage() {
  if (!(await hasPermission("news", "read"))) {
    return <ForbiddenPage resource="news" action="read" />;
  }

  const [posts, audienceOptions, canWrite, canSend, canDelete] = await Promise.all([
    listNewsPosts(),
    getNewsAudienceOptions(),
    hasPermission("news", "write"),
    hasPermission("news", "send"),
    hasPermission("news", "delete"),
  ]);

  return (
    <TenantPageShell size="wide" className="max-w-[1800px]">
      <TenantPageHeader
        title="Nieuws"
        description="Beheer tenantnieuws voor medewerkers en klanten met doelgroepselectie per groep, sector of individuele ontvanger."
      />
      <NewsView
        initialPosts={posts}
        audienceOptions={audienceOptions}
        canWrite={canWrite}
        canSend={canSend}
        canDelete={canDelete}
      />
    </TenantPageShell>
  );
}

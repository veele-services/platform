import type { Metadata } from "next";
import Link from "next/link";
import {
  WEBSITE_FORM_SUBMISSION_STATUSES,
  type WebsiteFormSubmissionStatus,
} from "@workspace/website-core/forms";
import { getWebsiteSubmissionsAction } from "@/app/actions/website-forms";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { Badge } from "@/components/ui/badge";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Website-inzendingen" };

const STATUS_LABELS: Record<WebsiteFormSubmissionStatus, string> = {
  new: "Nieuw",
  read: "Gelezen",
  in_progress: "In behandeling",
  converted: "Geconverteerd",
  archived: "Gearchiveerd",
  spam: "Spam",
};

type PageProps = {
  searchParams: Promise<{ status?: string | string[] }>;
};

export default async function WebsiteSubmissionsPage({
  searchParams,
}: PageProps) {
  const canRead = await hasPermission("website_submissions", "read");
  if (!canRead) {
    return <ForbiddenPage resource="website_submissions" action="read" />;
  }
  const query = await searchParams;
  const rawStatus = Array.isArray(query.status)
    ? query.status[0]
    : query.status;
  const status = WEBSITE_FORM_SUBMISSION_STATUSES.find(
    (candidate) => candidate === rawStatus,
  );
  const view = await getWebsiteSubmissionsAction({ status, limit: 100 });

  return (
    <TenantPageShell>
      <TenantPageHeader
        title="Inzendingen"
        description="Verwerk publieke aanvragen zonder tenantgrenzen of oorspronkelijke formulierdata te doorbreken."
        breadcrumbs={[
          { label: "Website", href: "/website" },
          { label: "Inzendingen" },
        ]}
      />
      <WebsiteTabs />
      {!view ? (
        <section className="veele-card">
          <p className="text-sm text-slate-600">
            Initialiseer eerst een website.
          </p>
        </section>
      ) : (
        <>
          <nav aria-label="Filter inzendingen" className="flex flex-wrap gap-2">
            <FilterLink href="/website/submissions" active={!status}>
              Alles
            </FilterLink>
            {WEBSITE_FORM_SUBMISSION_STATUSES.map((candidate) => (
              <FilterLink
                key={candidate}
                href={`/website/submissions?status=${candidate}`}
                active={status === candidate}
              >
                {STATUS_LABELS[candidate]}
              </FilterLink>
            ))}
          </nav>
          <section className="veele-card overflow-hidden p-0">
            {view.submissions.length === 0 ? (
              <p className="p-6 text-sm text-slate-600">
                Geen inzendingen voor dit filter.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Ontvangen</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Formulier</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Notificatie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.submissions.map((submission) => (
                      <tr
                        key={submission.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="whitespace-nowrap px-4 py-3">
                          <Link
                            href={`/website/submissions/${submission.id}`}
                            className="font-medium text-cyan-700 hover:underline"
                          >
                            {new Intl.DateTimeFormat("nl-NL", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(submission.receivedAt))}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">
                            {submission.isRedacted
                              ? "Gegevens gewist"
                              : (submission.contactName ??
                                submission.contactEmail ??
                                submission.contactPhone ??
                                "Onbekend")}
                          </p>
                          {!submission.isRedacted &&
                          submission.contactName &&
                          submission.contactEmail ? (
                            <p className="text-xs text-slate-500">
                              {submission.contactEmail}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">{submission.formName}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">
                            {STATUS_LABELS[submission.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {submission.notificationStatus}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </TenantPageShell>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
        active
          ? "border-cyan-700 bg-cyan-700 text-white"
          : "border-slate-200 bg-white text-slate-700"
      }`}
    >
      {children}
    </Link>
  );
}

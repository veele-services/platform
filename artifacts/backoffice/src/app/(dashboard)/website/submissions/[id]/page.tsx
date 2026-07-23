import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWebsiteSubmissionAction } from "@/app/actions/website-forms";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { Badge } from "@/components/ui/badge";
import { WebsiteSubmissionActions } from "@/components/website/WebsiteSubmissionActions";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Website-inzending" };

const FIELD_LABELS: Record<string, string> = {
  name: "Naam",
  email: "E-mailadres",
  phone: "Telefoonnummer",
  company: "Bedrijf",
  postalCode: "Postcode",
  subject: "Onderwerp",
  preferredDate: "Voorkeursdatum",
  message: "Bericht",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function WebsiteSubmissionPage({ params }: PageProps) {
  const [canRead, canWrite, canWriteCustomers] = await Promise.all([
    hasPermission("website_submissions", "read"),
    hasPermission("website_submissions", "write"),
    hasPermission("customers", "write"),
  ]);
  if (!canRead) {
    return <ForbiddenPage resource="website_submissions" action="read" />;
  }
  const { id } = await params;
  const submission = await getWebsiteSubmissionAction(id);
  if (!submission) notFound();

  return (
    <TenantPageShell>
      <TenantPageHeader
        title={submission.contactName ?? submission.formName}
        eyebrow="Website-inzending"
        description={`Ontvangen via ${submission.sourceHostname}`}
        badges={
          <>
            <Badge>{submission.status}</Badge>
            <Badge variant="outline">
              Notificatie: {submission.notificationStatus}
            </Badge>
          </>
        }
        breadcrumbs={[
          { label: "Website", href: "/website" },
          { label: "Inzendingen", href: "/website/submissions" },
          { label: submission.id.slice(0, 8) },
        ]}
      />
      <WebsiteTabs />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section className="veele-card">
          <h2 className="font-semibold text-slate-950">Inhoud</h2>
          {submission.isRedacted ? (
            <p className="mt-3 text-sm text-slate-600">
              De persoonsgegevens en oorspronkelijke inhoud zijn definitief
              gewist.
            </p>
          ) : (
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {Object.entries(submission.payload).map(([key, value]) =>
                value ? (
                  <div
                    key={key}
                    className={key === "message" ? "sm:col-span-2" : ""}
                  >
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {FIELD_LABELS[key] ?? key}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">
                      {value}
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
          )}
          {submission.customerId ? (
            <Link
              href={`/customers/${submission.customerId}`}
              className="mt-5 inline-block text-sm font-medium text-cyan-700"
            >
              Open gekoppelde klant →
            </Link>
          ) : null}
        </section>

        <section className="veele-card">
          <h2 className="font-semibold text-slate-950">Bewaring</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Ontvangen</dt>
              <dd>
                {new Intl.DateTimeFormat("nl-NL", {
                  dateStyle: "long",
                  timeStyle: "short",
                }).format(new Date(submission.receivedAt))}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Bewaren tot</dt>
              <dd>
                {new Intl.DateTimeFormat("nl-NL", {
                  dateStyle: "long",
                }).format(new Date(submission.retentionUntil))}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Formulier</dt>
              <dd>{submission.formName}</dd>
            </div>
          </dl>
        </section>
      </div>

      <WebsiteSubmissionActions
        submission={submission}
        canWrite={canWrite}
        canConvert={canWrite && canWriteCustomers}
      />

      <section className="veele-card">
        <h2 className="font-semibold text-slate-950">Tijdlijn</h2>
        <ol className="mt-4 space-y-3">
          {submission.events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-3 text-sm last:border-0"
            >
              <span className="font-medium text-slate-900">
                {event.eventType.replaceAll("_", " ")}
              </span>
              <time className="text-slate-500" dateTime={event.createdAt}>
                {new Intl.DateTimeFormat("nl-NL", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(event.createdAt))}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </TenantPageShell>
  );
}

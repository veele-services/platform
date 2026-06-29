import { and, eq, inArray } from "drizzle-orm";
import { emitDomainEvent, type DomainEventFallbackTemplate } from "./events";
import {
  assignmentPersonnelTable,
  assignmentsTable,
  customersTable,
  db,
  invoicesTable,
  objectsTable,
  personnelTable,
  reportsTable,
} from "./index";

type Audience = "customer" | "personnel" | "management" | "mixed";

type WorkflowRecipients = {
  customerIds?: string[];
  personnelIds?: string[];
};

function nlDate(value: string | null | undefined): string {
  if (!value) return "nog niet ingepland";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function timeRange(start: string | null | undefined, end: string | null | undefined): string {
  if (start && end) return `${start} - ${end}`;
  if (start) return start;
  return "tijd nog niet bekend";
}

function money(value: string | null | undefined): string {
  const number = Number.parseFloat(value ?? "0");
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
    Number.isFinite(number) ? number : 0,
  );
}

async function getAssignmentContext(assignmentId: string) {
  const [assignment] = await db
    .select({
      id: assignmentsTable.id,
      tenantId: assignmentsTable.tenantId,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      completionReason: assignmentsTable.completionReason,
      completionNotes: assignmentsTable.completionNotes,
      customerId: customersTable.id,
      customerName: customersTable.name,
      objectId: objectsTable.id,
      objectName: objectsTable.name,
      objectAddress: objectsTable.address,
      objectCity: objectsTable.city,
      objectPostalCode: objectsTable.postalCode,
    })
    .from(assignmentsTable)
    .innerJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  return assignment ?? null;
}

async function getAssignedPersonnel(assignmentId: string, personnelIds?: string[]) {
  const conditions = [
    eq(assignmentPersonnelTable.assignmentId, assignmentId),
    eq(assignmentPersonnelTable.status, "assigned"),
  ];

  if (personnelIds && personnelIds.length > 0) {
    conditions.push(inArray(assignmentPersonnelTable.personnelId, personnelIds));
  }

  return db
    .select({
      id: personnelTable.id,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
      email: personnelTable.email,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(personnelTable, eq(assignmentPersonnelTable.personnelId, personnelTable.id))
    .where(and(...conditions));
}

function assignmentPayload(
  assignment: NonNullable<Awaited<ReturnType<typeof getAssignmentContext>>>,
  personnel: Awaited<ReturnType<typeof getAssignedPersonnel>>,
) {
  const firstPerson = personnel[0] ?? null;
  const personnelName = firstPerson
    ? `${firstPerson.firstName} ${firstPerson.lastName}`.trim()
    : "medewerker";

  return {
    assignment: {
      id: assignment.id,
      code: assignment.code,
      title: assignment.title,
      status: assignment.status,
      date: nlDate(assignment.scheduledDate),
      raw_date: assignment.scheduledDate,
      start: assignment.scheduledStart ?? "",
      end: assignment.scheduledEnd ?? "",
      time_range: timeRange(assignment.scheduledStart, assignment.scheduledEnd),
      completion_reason: assignment.completionReason ?? "",
      completion_notes: assignment.completionNotes ?? "",
    },
    customer: {
      id: assignment.customerId,
      name: assignment.customerName ?? "klant",
    },
    object: {
      id: assignment.objectId,
      name: assignment.objectName ?? "object",
      address: assignment.objectAddress ?? "",
      city: assignment.objectCity ?? "",
      postal_code: assignment.objectPostalCode ?? "",
    },
    personnel: {
      id: firstPerson?.id ?? "",
      first_name: firstPerson?.firstName ?? "medewerker",
      name: personnelName,
    },
    recipient: {
      name: personnel.length > 0 ? personnelName : assignment.customerName ?? "relatie",
    },
  };
}

function assignmentFallback(eventKey: string, code: string): DomainEventFallbackTemplate {
  switch (eventKey) {
    case "assignment_assigned":
      return {
        title: `Werkbon ${code} ingepland`,
        body: "Je bent ingepland voor deze werkbon. Bekijk de details in Mijn planning.",
        pushTitle: `Werkbon ${code} ingepland`,
        pushBody: "Je planning is bijgewerkt. Bekijk de werkbon in de personeelsapp.",
        category: "planning",
        href: `/opdrachten`,
      };
    case "assignment_personnel_linked":
      return {
        title: `Werkbon ${code} gekoppeld`,
        body: "Je bent gekoppeld aan deze werkbon. Zodra planning datum en tijd vastzet, verschijnt hij in Mijn planning.",
        pushTitle: `Werkbon ${code} gekoppeld`,
        pushBody: "Planning heeft je gekoppeld aan een werkbon. Datum en tijd volgen nog.",
        category: "planning",
        href: `/opdrachten`,
      };
    case "assignment_rescheduled":
      return {
        title: `Werkbon ${code} verplaatst`,
        body: "Een ingeplande werkbon is gewijzigd. Controleer de nieuwe planning.",
        category: "planning",
        href: `/opdrachten`,
      };
    case "assignment_seen":
      return {
        title: `Werkbon ${code} gezien`,
        body: "Een medewerker heeft de werkbon geopend.",
        category: "planning",
        href: `/assignments`,
      };
    case "assignment_started":
      return {
        title: `Werkbon ${code} gestart`,
        body: "De werkzaamheden zijn gestart.",
        category: "planning",
        href: `/assignments`,
      };
    case "assignment_completed":
      return {
        title: `Werkbon ${code} afgerond`,
        body: "De werkzaamheden zijn afgerond. De rapportage kan worden verwerkt.",
        category: "planning",
        href: `/opdrachten`,
      };
    case "assignment_not_completed":
      return {
        title: `Werkbon ${code} afgemeld`,
        body: "De werkbon kon niet worden afgerond en vraagt om opvolging.",
        category: "planning",
        priority: "high",
        href: `/assignments`,
      };
    default:
      return {
        title: `Update voor werkbon ${code}`,
        body: "Er is een update in de werkbonworkflow.",
        category: "system",
      };
  }
}

export async function emitAssignmentWorkflowEvent(input: {
  eventKey: string;
  assignmentId: string;
  actorUserId?: string | null;
  audience?: Audience;
  recipients?: WorkflowRecipients;
  fallback?: Partial<DomainEventFallbackTemplate>;
}) {
  const assignment = await getAssignmentContext(input.assignmentId);
  if (!assignment) return null;

  const recipients = input.recipients ?? (
    input.eventKey === "assignment_completed"
      ? { customerIds: [assignment.customerId] }
      : undefined
  );
  const personnel = await getAssignedPersonnel(input.assignmentId, recipients?.personnelIds);
  const fallback = {
    ...assignmentFallback(input.eventKey, assignment.code),
    ...input.fallback,
  };

  return emitDomainEvent({
    eventKey: input.eventKey,
    tenantId: assignment.tenantId,
    actorUserId: input.actorUserId ?? null,
    audience: input.audience ?? "management",
    aggregate: { type: "assignment", id: assignment.id },
    payload: assignmentPayload(assignment, personnel),
    recipients,
    fallback,
    audit: false,
  });
}

export async function emitReportWorkflowEvent(input: {
  eventKey: "report_submitted" | "report_approved" | "report_rejected" | "report_available_to_customer";
  reportId: string;
  actorUserId?: string | null;
  rejectionReason?: string | null;
}) {
  const [report] = await db
    .select({
      id: reportsTable.id,
      assignmentId: reportsTable.assignmentId,
      submittedBy: reportsTable.submittedBy,
      content: reportsTable.content,
      assignmentTenantId: assignmentsTable.tenantId,
      assignmentCode: assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      customerId: customersTable.id,
      customerName: customersTable.name,
      personnelId: personnelTable.id,
      personnelFirstName: personnelTable.firstName,
      personnelLastName: personnelTable.lastName,
    })
    .from(reportsTable)
    .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
    .innerJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .leftJoin(personnelTable, eq(personnelTable.userId, reportsTable.submittedBy))
    .where(eq(reportsTable.id, input.reportId))
    .limit(1);

  if (!report) return null;

  const personnelName = report.personnelFirstName
    ? `${report.personnelFirstName} ${report.personnelLastName ?? ""}`.trim()
    : "medewerker";

  const recipients: WorkflowRecipients =
    input.eventKey === "report_available_to_customer"
      ? { customerIds: [report.customerId] }
      : report.personnelId && ["report_approved", "report_rejected"].includes(input.eventKey)
        ? { personnelIds: [report.personnelId] }
        : {};

  const audience: Audience =
    input.eventKey === "report_available_to_customer"
      ? "customer"
      : input.eventKey === "report_submitted"
        ? "management"
        : "personnel";

  const fallback: DomainEventFallbackTemplate =
    input.eventKey === "report_rejected"
      ? {
          title: `Rapport ${report.assignmentCode} afgekeurd`,
          body: input.rejectionReason ?? "Het rapport is afgekeurd en vraagt om aanpassing.",
          category: "planning",
          priority: "high",
          href: `/opdrachten/${report.assignmentId}`,
        }
      : input.eventKey === "report_available_to_customer"
        ? {
            title: `Rapport ${report.assignmentCode} beschikbaar`,
            body: "Het rapport van de uitgevoerde werkzaamheden staat klaar in het klantportaal.",
            category: "rapportage",
            href: "/rapportages",
          }
        : {
            title: `Rapport ${report.assignmentCode} ${
              input.eventKey === "report_submitted" ? "ingediend" : "goedgekeurd"
            }`,
            body: "Er is een rapportage-update voor deze werkbon.",
            category: "planning",
            href: `/opdrachten/${report.assignmentId}`,
          };

  return emitDomainEvent({
    eventKey: input.eventKey,
    tenantId: report.assignmentTenantId,
    actorUserId: input.actorUserId ?? null,
    audience,
    aggregate: { type: "report", id: report.id },
    payload: {
      assignment: {
        id: report.assignmentId,
        code: report.assignmentCode,
        title: report.assignmentTitle,
      },
      customer: {
        id: report.customerId,
        name: report.customerName ?? "klant",
      },
      personnel: {
        id: report.personnelId ?? "",
        first_name: report.personnelFirstName ?? "medewerker",
        name: personnelName,
      },
      report: {
        id: report.id,
        summary: report.content.slice(0, 180),
        rejection_reason: input.rejectionReason ?? "",
      },
      recipient: {
        name: input.eventKey === "report_available_to_customer" ? report.customerName ?? "klant" : personnelName,
      },
    },
    recipients,
    fallback,
    audit: false,
  });
}

export async function emitInvoiceWorkflowEvent(input: {
  eventKey: "invoice_sent" | "invoice_paid";
  invoiceId: string;
  actorUserId?: string | null;
}) {
  const [invoice] = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      totalAmount: invoicesTable.totalAmount,
      dueDate: invoicesTable.dueDate,
      paidDate: invoicesTable.paidDate,
      assignmentId: invoicesTable.assignmentId,
      assignmentTenantId: assignmentsTable.tenantId,
      assignmentCode: assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      customerId: customersTable.id,
      customerName: customersTable.name,
    })
    .from(invoicesTable)
    .innerJoin(assignmentsTable, eq(invoicesTable.assignmentId, assignmentsTable.id))
    .innerJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(eq(invoicesTable.id, input.invoiceId))
    .limit(1);

  if (!invoice) return null;

  const fallback: DomainEventFallbackTemplate =
    input.eventKey === "invoice_paid"
      ? {
          title: `Factuur ${invoice.invoiceNumber} betaald`,
          body: "De betaling is ontvangen en verwerkt.",
          category: "facturatie",
          href: "/facturen",
        }
      : {
          title: `Factuur ${invoice.invoiceNumber} staat klaar`,
          body: "De factuur staat klaar in het klantportaal.",
          category: "facturatie",
          href: "/facturen",
        };

  return emitDomainEvent({
    eventKey: input.eventKey,
    tenantId: invoice.assignmentTenantId,
    actorUserId: input.actorUserId ?? null,
    audience: "customer",
    aggregate: { type: "invoice", id: invoice.id },
    payload: {
      assignment: {
        id: invoice.assignmentId,
        code: invoice.assignmentCode,
        title: invoice.assignmentTitle,
      },
      customer: {
        id: invoice.customerId,
        name: invoice.customerName ?? "klant",
      },
      invoice: {
        id: invoice.id,
        number: invoice.invoiceNumber,
        amount: money(invoice.totalAmount),
        due_date: nlDate(invoice.dueDate),
        paid_date: nlDate(invoice.paidDate),
      },
      recipient: {
        name: invoice.customerName ?? "klant",
      },
    },
    recipients: { customerIds: [invoice.customerId] },
    fallback,
    audit: false,
  });
}

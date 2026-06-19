"use server";

import { getMyAssignments } from "./assignments";
import { getMyInvoices } from "./invoices";
import { getMyQuotes } from "./quotes";
import { getMyReports } from "./reports";

export type CustomerNotification = {
  id:        string;
  title:     string;
  body:      string;
  category:  "invoice" | "quote" | "report" | "request" | "system";
  priority:  "low" | "normal" | "high";
  href:      string;
  createdAt: string;
};

export type CustomerNotificationSummary = {
  unreadCount: number;
  recent:      CustomerNotification[];
};

function nowIso(): string {
  return new Date().toISOString();
}

export async function getMyCustomerNotifications(): Promise<CustomerNotification[]> {
  const [assignments, invoices, quotes, reports] = await Promise.all([
    getMyAssignments(),
    getMyInvoices(),
    getMyQuotes(),
    getMyReports(),
  ]);

  const notifications: CustomerNotification[] = [];

  for (const invoice of invoices.filter((item) => item.status === "sent")) {
    notifications.push({
      id:        `invoice-${invoice.id}`,
      title:     `Factuur ${invoice.invoiceNumber} staat open`,
      body:      `Te betalen: ${Number.parseFloat(invoice.totalAmount).toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}.`,
      category:  "invoice",
      priority:  "high",
      href:      `/facturen/${invoice.id}`,
      createdAt: invoice.createdAt,
    });
  }

  for (const quote of quotes.filter((item) => item.assignmentStatus === "awaiting_approval")) {
    notifications.push({
      id:        `quote-${quote.id}`,
      title:     `Offerte ${quote.quoteNumber} wacht op akkoord`,
      body:      `${quote.assignmentTitle} is klaar om te beoordelen.`,
      category:  "quote",
      priority:  "high",
      href:      "/offertes",
      createdAt: quote.createdAt,
    });
  }

  for (const report of reports.slice(0, 5)) {
    notifications.push({
      id:        `report-${report.id}`,
      title:     "Nieuw rapport beschikbaar",
      body:      report.assignmentTitle,
      category:  "report",
      priority:  "normal",
      href:      "/rapporten",
      createdAt: report.submittedAt,
    });
  }

  for (const assignment of assignments.filter((item) => ["requested", "review", "quote_preparation"].includes(item.status)).slice(0, 5)) {
    notifications.push({
      id:        `request-${assignment.id}`,
      title:     "Aanvraag in behandeling",
      body:      assignment.title,
      category:  "request",
      priority:  "low",
      href:      `/opdrachten/${assignment.id}`,
      createdAt: assignment.createdAt,
    });
  }

  if (notifications.length === 0) {
    notifications.push({
      id:        "system-empty",
      title:     "Geen acties nodig",
      body:      "Er zijn momenteel geen openstaande klantacties.",
      category:  "system",
      priority:  "low",
      href:      "/",
      createdAt: nowIso(),
    });
  }

  return notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMyCustomerNotificationSummary(): Promise<CustomerNotificationSummary> {
  const notifications = await getMyCustomerNotifications();
  const actionable = notifications.filter((item) => item.category !== "system");
  return {
    unreadCount: actionable.length,
    recent:      actionable.slice(0, 3),
  };
}

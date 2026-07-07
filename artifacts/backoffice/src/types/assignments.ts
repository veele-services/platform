export const ASSIGNMENT_STATUSES = [
  "requested",
  "review",
  "quote_preparation",
  "awaiting_approval",
  "approved",
  "plannable",
  "scheduled",
  "seen",
  "en_route",
  "in_progress",
  "not_completed",
  "completed",
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type AssignmentPriority = (typeof ASSIGNMENT_PRIORITIES)[number];

export const ASSIGNMENT_STATUS_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  requested:         ["review", "plannable"],
  review:            ["quote_preparation", "approved", "plannable"],
  quote_preparation: ["awaiting_approval"],
  awaiting_approval: ["approved", "review"],
  approved:          ["plannable"],
  plannable:         ["scheduled"],
  scheduled:         ["seen", "en_route", "in_progress", "plannable"],
  seen:              ["en_route", "in_progress", "scheduled"],
  en_route:          ["in_progress", "scheduled"],
  in_progress:       ["completed", "not_completed"],
  not_completed:     ["in_progress", "plannable"],
  completed:         ["report_submitted"],
  report_submitted:  ["report_approved", "completed"],
  report_approved:   ["invoice_ready"],
  invoice_ready:     ["invoiced"],
  invoiced:          ["paid"],
  paid:              ["closed"],
  closed:            [],
};

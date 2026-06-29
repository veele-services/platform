import type {
  PersonnelTicketDepartment,
  PersonnelTicketPriority,
} from "@workspace/db";

export const TICKET_DEPARTMENT_OPTIONS: Array<{
  value: PersonnelTicketDepartment;
  label: string;
}> = [
  { value: "planning", label: "Planning" },
  { value: "management", label: "Management" },
  { value: "backoffice", label: "Backoffice" },
  { value: "hr", label: "HR / Personeel" },
  { value: "finance", label: "Administratie" },
  { value: "it", label: "IT / App support" },
];

export const TICKET_PRIORITY_OPTIONS: Array<{
  value: PersonnelTicketPriority;
  label: string;
}> = [
  { value: "low", label: "Laag" },
  { value: "normal", label: "Normaal" },
  { value: "high", label: "Hoog" },
  { value: "urgent", label: "Urgent" },
];

import type { MyAssignmentDetail } from "@/actions/assignments";
import type { ExtraWorkItem, TaskCodeOption } from "@/actions/extra-work";
import type { ReportNote } from "@/actions/reports";

export type WorkOrderTab = "home" | "werkzaamheden" | "rapportage";

export type AssignmentView = Pick<
  MyAssignmentDetail,
  | "id"
  | "code"
  | "title"
  | "description"
  | "scheduledDate"
  | "scheduledStart"
  | "scheduledEnd"
  | "status"
  | "customerName"
  | "objectName"
  | "objectAddress"
  | "objectCity"
  | "objectPostalCode"
  | "tasks"
> & {
  contactName?: string | null;
  phone?: string | null;
  isMock?: boolean;
};

export type MaterialUsageItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitLabel?: string;
};

export const MOCK_ASSIGNMENTS: Record<string, AssignmentView> = {
  "SCH-2026-0600001": {
    id:               "SCH-2026-0600001",
    code:             "SCH-2026-0600001",
    title:            "Lift onderhoud en controle uitvoeren",
    description:      "Lift onderhoud en controle uitvoeren.\nLet op: oudere installatie, rustig afstemmen met bewoner.",
    scheduledDate:    "2026-06-19",
    scheduledStart:   "08:02",
    scheduledEnd:     "10:00",
    status:           "in_progress",
    customerName:     "Chantal Veele",
    contactName:      "Chantal Veele",
    objectName:       "VvE Residentie Zeezicht",
    objectAddress:    "Strandweg 14",
    objectCity:       "Den Haag",
    objectPostalCode: "2586 JK",
    phone:            "06-34108400",
    tasks:            [
      { id: "mock-task-1", sortOrder: 1, notes: "Visuele inspectie liftinstallatie" },
      { id: "mock-task-2", sortOrder: 2, notes: "Werking veiligheidsvoorzieningen controleren" },
      { id: "mock-task-3", sortOrder: 3, notes: "Smeren en afstellen bewegende delen" },
      { id: "mock-task-4", sortOrder: 4, notes: "Eindcontrole en testrit uitvoeren" },
    ],
    isMock:           true,
  },
  "BEV-2026-0600002": {
    id:               "BEV-2026-0600002",
    code:             "BEV-2026-0600002",
    title:            "Avonddienst toegangscontrole",
    description:      "Controleer entree, sluitronde en overdracht.\nLet op: extra aandacht voor personeelsingang aan de achterzijde.",
    scheduledDate:    "2026-06-19",
    scheduledStart:   "14:00",
    scheduledEnd:     "22:00",
    status:           "seen",
    customerName:     "Michael Veele",
    contactName:      "Michael Veele",
    objectName:       "Horeca De Haven",
    objectAddress:    "Westplein 8",
    objectCity:       "Rotterdam",
    objectPostalCode: "3016 BM",
    phone:            "06-24291576",
    tasks:            [
      { id: "mock-bev-task-1", sortOrder: 1, notes: "Entree en nooduitgangen controleren" },
      { id: "mock-bev-task-2", sortOrder: 2, notes: "Sluitronde uitvoeren" },
      { id: "mock-bev-task-3", sortOrder: 3, notes: "Overdracht vastleggen" },
    ],
    isMock:           true,
  },
  "FAC-2026-0600003": {
    id:               "FAC-2026-0600003",
    code:             "FAC-2026-0600003",
    title:            "Facilitaire ondersteuning evenement",
    description:      "Ondersteun bij zaalopbouw en controle algemene ruimtes.\nStem bijzonderheden af met de locatiemanager.",
    scheduledDate:    "2026-06-19",
    scheduledStart:   "18:00",
    scheduledEnd:     "23:30",
    status:           "in_progress",
    customerName:     "Danny de Groot",
    contactName:      "Danny de Groot",
    objectName:       "Eventlocatie Houtrust",
    objectAddress:    "Laan van Poot 353",
    objectCity:       "Den Haag",
    objectPostalCode: "2566 DA",
    phone:            "070-1234567",
    tasks:            [
      { id: "mock-fac-task-1", sortOrder: 1, notes: "Zaalopbouw controleren" },
      { id: "mock-fac-task-2", sortOrder: 2, notes: "Sanitaire ruimtes nalopen" },
      { id: "mock-fac-task-3", sortOrder: 3, notes: "Locatiemanager informeren" },
    ],
    isMock:           true,
  },
  "SCH-2026-0600004": {
    id:               "SCH-2026-0600004",
    code:             "SCH-2026-0600004",
    title:            "Ochtendronde kantoorvloeren",
    description:      "Controleer entree, sanitaire ruimtes en pantry.\nMeld defecten direct via de rapportage.",
    scheduledDate:    "2026-06-19",
    scheduledStart:   "07:30",
    scheduledEnd:     "09:00",
    status:           "completed",
    customerName:     "Jeroen Smit",
    contactName:      "Jeroen Smit",
    objectName:       "Kantoor Weststaete",
    objectAddress:    "Delftseplein 27",
    objectCity:       "Rotterdam",
    objectPostalCode: "3013 AA",
    phone:            "010-5551234",
    tasks:            [
      { id: "mock-sch-task-1", sortOrder: 1, notes: "Entree stofzuigen en dweilen" },
      { id: "mock-sch-task-2", sortOrder: 2, notes: "Sanitaire ruimtes reinigen" },
      { id: "mock-sch-task-3", sortOrder: 3, notes: "Pantry aanvullen" },
    ],
    isMock:           true,
  },
};

export const MOCK_EXTRA_WORK: ExtraWorkItem[] = [
  {
    id:           "mock-extra-1",
    taskCodeId:   "mock-extra-code-1",
    taskCodeName: "Vervangen batterij noodverlichting",
    description:  "Vervangen batterij noodverlichting",
    hours:        "1",
    price:        "65.00",
    createdBy:    "mock",
    photos:       [],
  },
  {
    id:           "mock-extra-2",
    taskCodeId:   "mock-extra-code-2",
    taskCodeName: "Afstellen deurmechanisme",
    description:  "Afstellen deurmechanisme",
    hours:        "1",
    price:        "45.00",
    createdBy:    "mock",
    photos:       [],
  },
];

export const MOCK_TASK_CODES: TaskCodeOption[] = [
  {
    id:              "mock-extra-code-1",
    code:            "SCH-MW-001",
    name:            "Vervangen batterij noodverlichting",
    price:           "65.00",
    durationMinutes: 60,
  },
  {
    id:              "mock-extra-code-2",
    code:            "FAC-MW-002",
    name:            "Afstellen deurmechanisme",
    price:           "45.00",
    durationMinutes: 60,
  },
  {
    id:              "mock-extra-code-3",
    code:            "SCH-MW-003",
    name:            "Extra reinigingsronde",
    price:           "37.50",
    durationMinutes: 45,
  },
];

export const MOCK_MATERIAL_ITEMS: MaterialUsageItem[] = [
  {
    id:        "mock-material-1",
    name:      "Smeerolie HLP 46",
    quantity:  1,
    unitPrice: 12.5,
  },
  {
    id:        "mock-material-2",
    name:      "Reinigingsdoek industrieel",
    quantity:  2,
    unitPrice: 4.75,
  },
];

export const MOCK_REPORT_NOTES: ReportNote[] = [
  {
    id:          "mock-report-note-1",
    body:        "Regulier onderhoud uitgevoerd.\nInstallatie werkt naar behoren.\nNoodverlichting vervangen als meerwerk.",
    authorName:  "Veele Services",
    createdAt:   "2026-06-19T14:58:00.000+02:00",
    attachments: [],
  },
  {
    id:          "mock-report-note-2",
    body:        "Controle uitgevoerd op bewegende delen.\nAdvies: volgende onderhoudsbeurt volgens schema.",
    authorName:  "Veele Services",
    createdAt:   "2026-06-19T14:28:00.000+02:00",
    attachments: [],
  },
  {
    id:          "mock-report-note-3",
    body:        "Noodverlichting unit 3 vervangen.\nTest uitgevoerd, werking OK.\nFoto bijgevoegd.",
    authorName:  "Veele Services",
    createdAt:   "2026-06-19T12:05:00.000+02:00",
    attachments: [
      {
        id:          "mock-report-attachment-1",
        storagePath: "mock/noodverlichting-unit3.jpg",
        signedUrl:   null,
        fileName:    "noodverlichting_unit3.jpg",
        mimeType:    "image/jpeg",
        fileSize:    1200000,
        createdAt:   "2026-06-19T12:05:00.000+02:00",
      },
    ],
  },
  {
    id:          "mock-report-note-4",
    body:        "Start werkzaamheden.\nInstallatie visueel geinspecteerd.\nGeen bijzonderheden.",
    authorName:  "Veele Services",
    createdAt:   "2026-06-19T10:11:00.000+02:00",
    attachments: [],
  },
];

export const MATERIAL_CATALOG: MaterialUsageItem[] = [
  { id: "mat-001", name: "Smeerolie HLP 46", quantity: 1, unitPrice: 12.5 },
  { id: "mat-002", name: "Reinigingsdoek industrieel", quantity: 1, unitPrice: 4.75 },
  { id: "mat-003", name: "Batterij noodverlichting", quantity: 1, unitPrice: 18.75 },
  { id: "mat-004", name: "Klein montagemateriaal", quantity: 1, unitPrice: 7.5 },
];

export const FINISHED_STATUSES = new Set([
  "completed",
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

export const FAILED_FINAL_STATUSES = new Set(["not_completed", "cancelled", "canceled", "afgemeld"]);

export const STEP_LABELS = ["Gezien", "Gestart", "Afgerond"];

export function getMockAssignment(id: string): AssignmentView | null {
  return MOCK_ASSIGNMENTS[id] ?? null;
}

export function formatTimeSlot(start: string | null, end: string | null): string {
  if (start && end) return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
  if (start) return `Vanaf ${start.slice(0, 5)}`;
  return "Tijd nog niet bekend";
}

export function getHeaderStatus(status: string): { label: string; background: string; color: string } {
  if (FAILED_FINAL_STATUSES.has(status)) {
    return { label: "NIET AFGEROND", background: "#FEE2E2", color: "#DC2626" };
  }
  if (FINISHED_STATUSES.has(status)) {
    return { label: "AFGEROND", background: "#E6F8ED", color: "#249357" };
  }
  if (status === "in_progress") {
    return { label: "GESTART", background: "#FFF4D8", color: "#B7790F" };
  }
  if (status === "seen" || status === "scheduled") {
    return { label: "GEZIEN", background: "#EAF5FF", color: "#2563A9" };
  }
  return { label: "NIEUW", background: "#EAF5FF", color: "#2563A9" };
}

export function getActiveStep(status: string): number {
  if (FAILED_FINAL_STATUSES.has(status) || FINISHED_STATUSES.has(status)) return 2;
  if (status === "in_progress") return 1;
  return 0;
}

export function getTaskCompletionCount(assignment: AssignmentView): number {
  if (assignment.tasks.length === 0) return 0;
  if (FINISHED_STATUSES.has(assignment.status)) return assignment.tasks.length;
  if (assignment.status === "in_progress") return Math.max(assignment.tasks.length - 1, 0);
  return 0;
}

export function parseNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style:                 "currency",
    currency:              "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function calculateExtraWorkLineTotal(item: Pick<ExtraWorkItem, "hours" | "price">): number {
  const price = parseNumber(item.price);
  const hours = parseNumber(item.hours);
  return hours > 0 ? hours * price : price;
}

export function calculateMaterialLineTotal(item: MaterialUsageItem): number {
  return item.quantity * item.unitPrice;
}

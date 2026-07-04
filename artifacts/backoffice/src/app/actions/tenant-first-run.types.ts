export const FIRST_RUN_WIZARD_STEPS = [
  {
    id: "company",
    title: "Bedrijfsgegevens",
    href: "/instellingen/organisatie",
    required: true,
  },
  {
    id: "branding",
    title: "Branding",
    href: "/instellingen/organisatie",
    required: true,
  },
  {
    id: "sectors",
    title: "Sectoren",
    href: "/instellingen/sectoren",
    required: true,
  },
  {
    id: "regions",
    title: "Regio's",
    href: "/instellingen/organisatie",
    required: true,
  },
  {
    id: "users",
    title: "Gebruikers",
    href: "/instellingen/gebruikers",
    required: true,
  },
  {
    id: "modules",
    title: "Modules",
    href: "/platform",
    required: true,
  },
  {
    id: "basics",
    title: "Basisinstellingen",
    href: "/instellingen/organisatie",
    required: true,
  },
  {
    id: "first_data",
    title: "Eerste klant/object/opdracht",
    href: "/customers",
    required: false,
  },
] as const;

export type TenantFirstRunStep = (typeof FIRST_RUN_WIZARD_STEPS)[number]["id"];

export type TenantFirstRunStateRow = {
  tenantId: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  requiredSteps: string[];
  completedSteps: string[];
  completedAt: string | null;
  updatedAt: string;
};

export type TenantFirstRunWizardStep = {
  id: TenantFirstRunStep;
  title: string;
  href: string;
  required: boolean;
  done: boolean;
  autoDone: boolean;
  manualDone: boolean;
  warning: string | null;
};

export type TenantFirstRunWizard = TenantFirstRunStateRow & {
  tenantName: string;
  readinessScore: number;
  requiredDone: number;
  requiredTotal: number;
  readinessWarnings: string[];
  settings: {
    companyName: string;
    companyAddress: string;
    kvkNumber: string;
    btwNumber: string;
    logoUrl: string;
    brandColor: string;
    accentColor: string;
    emailSender: string;
    paymentTermDays: number;
    availabilityAdvanceDays: number;
    emailFooterText: string;
    emailSignature: string;
  };
  counts: {
    sectors: number;
    regions: number;
    users: number;
    modules: number;
    customers: number;
    objects: number;
    assignments: number;
  };
  regionNames: string[];
  moduleNames: string[];
  steps: TenantFirstRunWizardStep[];
};

export type PlatformSmokeStatus = "ok" | "warning" | "blocked" | "manual";

export type PlatformSmokeCheck = {
  id: string;
  label: string;
  status: PlatformSmokeStatus;
  summary: string;
  detail: string;
  testIds: string[];
  nextAction: string;
};

export type PlatformSmokeRunHistoryEntry = {
  id: string;
  kind: "dashboard-snapshot" | "migration-smoke" | "staging-smoke";
  label: string;
  status: PlatformSmokeStatus;
  startedAt: string;
  finishedAt: string;
  source: string;
  summary: string;
  artifactPath: string | null;
  checks: string[];
  cleanup: "not-needed" | "required" | "completed" | "unknown";
};

export type PlatformLiveSmokeTarget = {
  id: string;
  label: string;
  status: PlatformSmokeStatus;
  host: string;
  route: string;
  command: string;
  testIds: string[];
  nextAction: string;
};

export type PlatformMigrationSmokeStatus = {
  status: PlatformSmokeStatus;
  command: string;
  reportDirectory: string;
  latestRun: PlatformSmokeRunHistoryEntry | null;
  targets: {
    id: "empty-database" | "staging-copy";
    label: string;
    status: PlatformSmokeStatus;
    requiredSecret: string;
    confirmVar: string;
    testIds: string[];
  }[];
  nextAction: string;
};

export type PlatformMutatingSmokeCheck = {
  id: string;
  label: string;
  status: PlatformSmokeStatus;
  tenantScope: string;
  cleanupStatus: "required-before-run" | "ready" | "not-configured";
  confirmVar: string;
  cleanupSelector: string;
  testIds: string[];
  nextAction: string;
};

export type PlatformFinalGateRequirement = {
  id: string;
  label: string;
  status: PlatformSmokeStatus;
  evidence: string;
  command: string;
  testIds: string[];
  nextAction: string;
};

export type PlatformPostLaunchException = {
  id: string;
  label: string;
  risk: "P0/P1" | "P1" | "P1/P2";
  owner: string;
  acceptedUntil: string;
  targetEvidence: string;
  testIds: string[];
  requiresGoNoGoApproval: boolean;
};

export type PlatformFinalExternalTenantGate = {
  status: PlatformSmokeStatus;
  decision: "conditional-go" | "blocked" | "ready";
  summary: string;
  command: string;
  checklist: string;
  reportDirectory: string;
  requirements: PlatformFinalGateRequirement[];
  postLaunchExceptions: PlatformPostLaunchException[];
};

export type PlatformAdminReleaseGateItem = {
  id: string;
  label: string;
  status: PlatformSmokeStatus;
  owner: string;
  persona:
    | "owner"
    | "admin"
    | "support"
    | "platform"
    | "tenant-a-b-veele"
    | "enterprise"
    | "non-enterprise"
    | "ci";
  host: string;
  route: string;
  command: string;
  evidence: string;
  testIds: string[];
  nextAction: string;
  blocksRelease: boolean;
};

export type PlatformAdminReleaseGateException = {
  id: string;
  label: string;
  severity: "P0" | "P1";
  owner: string;
  acceptedUntil: string;
  targetEvidence: string;
  goNoGoRequired: boolean;
};

export type PlatformAdminReleaseGate = {
  status: PlatformSmokeStatus;
  decision: "ready" | "conditional-go" | "blocked";
  summary: string;
  command: string;
  checklist: string;
  reportDirectory: string;
  items: PlatformAdminReleaseGateItem[];
  exceptions: PlatformAdminReleaseGateException[];
  requiredCommands: string[];
};

export type PlatformStagingPromotionGateSignal = {
  id: string;
  label: string;
  status: PlatformSmokeStatus;
  owner: string;
  command: string;
  evidence: string;
  nextAction: string;
  testIds: string[];
  blocksPromotion: boolean;
};

export type PlatformStagingPromotionGate = {
  status: PlatformSmokeStatus;
  decision: "ready" | "conditional-go" | "blocked";
  summary: string;
  command: string;
  checklist: string;
  reportDirectory: string;
  evidenceDirectories: string[];
  signals: PlatformStagingPromotionGateSignal[];
  requiredCommands: string[];
  evidenceRuns: PlatformSmokeRunHistoryEntry[];
};

export type PlatformStagingSmokeDashboard = {
  generatedAt: string;
  environment: {
    platformHost: string;
    stagingHost: string;
    platformHostKnown: boolean;
    stagingHostKnown: boolean;
  };
  totals: {
    tenants: number;
    activeTenants: number;
    demoTenants: number;
    tenantDomains: number;
    verifiedTenantDomains: number;
    activeTenantUsers: number;
    activePlatformUsers: number;
    moduleCatalog: number;
    tenantsWithEnabledModules: number;
    enabledTenantModules: number;
    tenantSectors: number;
    tenantSectorSettings: number;
    tenantRegions: number;
    documents: number;
    tenantPrefixedDocuments: number;
    legacyDocumentPaths: number;
    reports: number;
    quotes: number;
    invoices: number;
    activeSupportGrants: number;
    supportAuditEvents: number;
    auditEvents: number;
    downloadAuditEvents: number;
    migrationHistoryTables: number;
  };
  checks: PlatformSmokeCheck[];
  runHistory: PlatformSmokeRunHistoryEntry[];
  liveSmokes: PlatformLiveSmokeTarget[];
  migrationSmoke: PlatformMigrationSmokeStatus;
  mutatingChecks: PlatformMutatingSmokeCheck[];
  finalExternalTenantGate: PlatformFinalExternalTenantGate;
  platformAdminReleaseGate: PlatformAdminReleaseGate;
  stagingPromotionGate: PlatformStagingPromotionGate;
  minimumGreen: string[];
  playbooks: string[];
};

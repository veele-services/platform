"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, History, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AuditLogEntry } from "@/app/actions/settings";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const ACTION_LABELS: Record<string, string> = {
  create:             "Aangemaakt",
  update:             "Bijgewerkt",
  delete:             "Verwijderd",
  invite:             "Uitgenodigd",
  resend_invite:      "Uitnodiging opnieuw verstuurd",
  deactivate:         "Gedeactiveerd",
  activate:           "Geactiveerd",
  update_roles:       "Rollen gewijzigd",
  grant_permission:   "Recht verleend",
  revoke_permission:  "Recht ingetrokken",
  update_permissions: "Rechten bijgewerkt",
  approve:            "Goedgekeurd",
  reject:             "Afgekeurd",
  submit:             "Ingediend",
  transition:         "Status gewijzigd",
};

const RESOURCE_LABELS: Record<string, string> = {
  settings:    "Instellingen",
  roles:       "Rollen",
  users:       "Gebruikers",
  customers:   "Klanten",
  objects:     "Objecten",
  assignments: "Opdrachten",
  personnel:   "Personeel",
  invoices:    "Facturen",
  quotes:      "Offertes",
  reports:     "Rapporten",
  planning:    "Planning",
  leave:       "Verlof",
};

const MODULES = [
  "assignments", "customers", "invoices", "objects", "personnel",
  "planning", "quotes", "reports", "roles", "settings", "users", "leave",
] as const;

const ACTION_BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  create:             { bg: "#D1FAE5", color: "#065F46" },
  update:             { bg: "#DBEAFE", color: "#1D4ED8" },
  update_roles:       { bg: "#DBEAFE", color: "#1D4ED8" },
  update_permissions: { bg: "#DBEAFE", color: "#1D4ED8" },
  transition:         { bg: "#DBEAFE", color: "#1D4ED8" },
  delete:             { bg: "#FEE2E2", color: "#991B1B" },
  deactivate:         { bg: "#FEE2E2", color: "#991B1B" },
  revoke_permission:  { bg: "#FEE2E2", color: "#991B1B" },
  reject:             { bg: "#FEE2E2", color: "#991B1B" },
  invite:             { bg: "#EFF6FF", color: "#1E40AF" },
  resend_invite:      { bg: "#EFF6FF", color: "#1E40AF" },
  grant_permission:   { bg: "#D1FAE5", color: "#065F46" },
  approve:            { bg: "#D1FAE5", color: "#065F46" },
  activate:           { bg: "#D1FAE5", color: "#065F46" },
  submit:             { bg: "#FEF3C7", color: "#D97706" },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface RoleOption {
  id:   string;
  name: string;
}

interface Props {
  entries:         AuditLogEntry[];
  total:           number;
  page:            number;
  initialSearch:   string;
  initialModule:   string;
  initialDateFrom: string;
  initialDateTo:   string;
  initialRoleId:   string;
  roles:           RoleOption[];
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ActiviteitslogView({
  entries,
  total,
  page,
  initialSearch,
  initialModule,
  initialDateFrom,
  initialDateTo,
  initialRoleId,
  roles,
}: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState(initialSearch);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null;

  // Debounce search: fire 400 ms after the user stops typing
  useEffect(() => {
    if (searchInput === initialSearch) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      applyFilter("search", searchInput);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // applyFilter is stable (closes over router / pathname / initial* which are
    // stable per render); excluding it from deps is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const merged: Record<string, string | undefined> = {
      search:   initialSearch   || undefined,
      module:   initialModule   || undefined,
      dateFrom: initialDateFrom || undefined,
      dateTo:   initialDateTo   || undefined,
      roleId:   initialRoleId   || undefined,
      page:     page > 1 ? String(page) : undefined,
      ...overrides,
    };
    const params = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => { if (v) params.set(k, v); });
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function applyFilter(key: string, value: string) {
    startTransition(() => {
      router.replace(buildUrl({ [key]: value || undefined, page: undefined }));
    });
  }

  function goToPage(p: number) {
    startTransition(() => {
      router.replace(buildUrl({ page: p > 1 ? String(p) : undefined }));
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Free text search — debounced 400 ms */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
            style={{ color: "#94A3B8" }}
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Zoek op actie, gebruiker of module…"
            className="pl-8 h-9"
          />
        </div>

        {/* Module filter */}
        <Select
          value={initialModule || "all"}
          onValueChange={(v) => applyFilter("module", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Alle modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle modules</SelectItem>
            {MODULES.map((m) => (
              <SelectItem key={m} value={m}>
                {RESOURCE_LABELS[m] ?? m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Role filter */}
        {roles.length > 0 && (
          <Select
            value={initialRoleId || "all"}
            onValueChange={(v) => applyFilter("roleId", v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Alle rollen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle rollen</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Date range */}
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={initialDateFrom}
            onChange={(e) => applyFilter("dateFrom", e.target.value)}
            className="h-9 w-[140px] text-sm"
            title="Vanaf datum"
          />
          <span className="text-xs" style={{ color: "#94A3B8" }}>t/m</span>
          <Input
            type="date"
            value={initialDateTo}
            onChange={(e) => applyFilter("dateTo", e.target.value)}
            className="h-9 w-[140px] text-sm"
            title="Tot datum"
          />
        </div>

        <span className="self-center text-sm ml-auto" style={{ color: "#94A3B8" }}>
          {total} {total === 1 ? "regel" : "regels"}
        </span>
      </div>

      {/* Table */}
      <div className="veele-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                {["Datum/tijd", "Gebruiker", "Actie", "Module", "Details"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                    style={{ color: "#94A3B8" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="py-12 text-center" style={{ color: "#94A3B8" }}>
                      <History className="h-8 w-8 mx-auto mb-2" strokeWidth={1.5} />
                      <p className="text-sm">Geen activiteiten gevonden.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr
                    key={e.id}
                    className="hover:bg-slate-50 transition-colors"
                    style={{ borderBottom: "1px solid #F8FAFC" }}
                  >
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#64748B" }}>
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm" style={{ color: "var(--color-foreground)" }}>
                        {e.userName ?? <span style={{ color: "#94A3B8" }}>Onbekend</span>}
                      </div>
                      <div className="text-xs" style={{ color: "#94A3B8" }}>{e.userEmail}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ActionBadge action={e.action} />
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#475569" }}>
                      {RESOURCE_LABELS[e.resource] ?? e.resource}
                      {e.resourceId && (
                        <span className="ml-1 text-xs font-mono" style={{ color: "#CBD5E1" }}>
                          #{e.resourceId.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-center justify-between gap-3">
                        <MetadataCell metadata={e.metadata} action={e.action} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEntryId(e.id)}
                        >
                          <Eye className="h-4 w-4" />
                          Details
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: "#64748B" }}>
            {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} van {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3" style={{ color: "var(--color-foreground)" }}>
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <AuditDetailSheet
        entry={selectedEntry}
        open={Boolean(selectedEntry)}
        onOpenChange={(open) => !open && setSelectedEntryId(null)}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_BADGE_STYLES[action] ?? { bg: "#F3F4F6", color: "#374151" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {ACTION_LABELS[action] ?? action}
    </span>
  );
}

function MetadataCell({
  metadata,
  action,
}: {
  metadata: Record<string, unknown> | null;
  action:   string;
}) {
  if (!metadata) return <span style={{ color: "#CBD5E1" }}>—</span>;

  if (action === "update_roles" && Array.isArray(metadata.roleNames)) {
    const names = metadata.roleNames as string[];
    return (
      <span className="text-xs" style={{ color: "#475569" }}>
        {names.length > 0 ? names.join(", ") : <em style={{ color: "#94A3B8" }}>geen rollen</em>}
      </span>
    );
  }
  if (action === "invite" && typeof metadata.email === "string") {
    return <span className="text-xs" style={{ color: "#475569" }}>{metadata.email}</span>;
  }
  if ((action === "grant_permission" || action === "revoke_permission") && metadata.permissionId) {
    return (
      <span className="text-xs font-mono" style={{ color: "#475569" }}>
        {String(metadata.permissionId).slice(0, 8)}
      </span>
    );
  }
  if (Array.isArray(metadata.fields)) {
    return (
      <span className="text-xs" style={{ color: "#475569" }}>
        {(metadata.fields as string[]).join(", ")}
      </span>
    );
  }
  if (typeof metadata.status === "string") {
    return <span className="text-xs" style={{ color: "#475569" }}>{metadata.status}</span>;
  }

  const json = JSON.stringify(metadata);
  const truncated = json.length > 80 ? json.slice(0, 80) + "…" : json;
  return <span className="text-xs font-mono break-all" style={{ color: "#94A3B8" }}>{truncated}</span>;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
  );
}

function AuditDetailSheet({
  entry,
  open,
  onOpenChange,
}: {
  entry: AuditLogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Auditregel</SheetTitle>
          <SheetDescription>Volledige context van deze activiteit.</SheetDescription>
        </SheetHeader>
        {entry && (
          <div className="mt-6 space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <DetailItem label="Datum/tijd" value={formatDateTime(entry.createdAt)} />
              <DetailItem label="Gebruiker" value={entry.userName ?? "Onbekend"} />
              <DetailItem label="E-mail" value={entry.userEmail ?? "-"} />
              <DetailItem label="Actie" value={ACTION_LABELS[entry.action] ?? entry.action} />
              <DetailItem label="Module" value={RESOURCE_LABELS[entry.resource] ?? entry.resource} />
              <DetailItem label="Resource ID" value={entry.resourceId ?? "-"} />
            </dl>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Metadata</p>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-foreground">
                {entry.metadata ? JSON.stringify(entry.metadata, null, 2) : "-"}
              </pre>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}

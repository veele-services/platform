"use client";

import { FormEvent, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createQualificationItem,
  deleteQualificationItem,
  removePersonnelQualification,
  removeRoleQualification,
  removeTaskCodeQualification,
  setQualificationStatus,
  upsertPersonnelQualification,
  upsertRoleQualification,
  upsertTaskCodeQualification,
  type QualificationItemRow,
  type QualificationLinkRow,
  type QualificationManagementData,
} from "@/app/actions/qualifications";

type QualificationType = "certificate" | "diploma" | "knowledge";

type Props = {
  data: QualificationManagementData;
  canWrite: boolean;
};

const TYPE_META: Record<
  QualificationType,
  { label: string; plural: string; icon: typeof ShieldCheck; color: string; bg: string }
> = {
  certificate: {
    label: "Certificaat",
    plural: "Certificaten",
    icon: ShieldCheck,
    color: "#047857",
    bg: "#ECFDF5",
  },
  diploma: {
    label: "Diploma",
    plural: "Diploma's",
    icon: GraduationCap,
    color: "#5B21B6",
    bg: "#F3E8FF",
  },
  knowledge: {
    label: "Kennisgebied",
    plural: "Kennisgebieden",
    icon: BookOpenCheck,
    color: "#A16207",
    bg: "#FEF9C3",
  },
};

function optionLabel(item: QualificationItemRow): string {
  return `${TYPE_META[item.type].label}: ${item.name}`;
}

function linkStatusStyle(status: QualificationLinkRow["expiryStatus"]) {
  if (status === "expired") {
    return { label: "Verlopen", color: "#DC2626", bg: "#FEF2F2", icon: XCircle };
  }
  if (status === "expiring") {
    return { label: "Verloopt binnenkort", color: "#B45309", bg: "#FFFBEB", icon: AlertTriangle };
  }
  if (status === "valid") {
    return { label: "Geldig", color: "#059669", bg: "#ECFDF5", icon: CheckCircle2 };
  }
  return { label: "Geen verloopdatum", color: "#64748B", bg: "#F8FAFC", icon: CheckCircle2 };
}

function getSelectValue(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export function QualificationsView({ data, canWrite }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const activeItems = data.items.filter((item) => item.isActive);
  const itemOptions = useMemo(
    () => activeItems.map((item) => ({ id: item.id, label: optionLabel(item), type: item.type })),
    [activeItems],
  );

  function refresh(message: string) {
    toast.success(message);
    router.refresh();
  }

  function handleCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const validityRaw = getSelectValue(form, "validityMonths");
    const payload = {
      type: getSelectValue(form, "type") as QualificationType,
      code: getSelectValue(form, "code"),
      name: getSelectValue(form, "name"),
      description: getSelectValue(form, "description"),
      sectorId: getSelectValue(form, "sectorId"),
      validityMonths: validityRaw ? Number(validityRaw) : null,
      isActive: true,
    };
    startTransition(async () => {
      const result = await createQualificationItem(payload);
      if (result.success) {
        event.currentTarget.reset();
        refresh("Kwalificatie aangemaakt");
      } else {
        toast.error(result.message);
      }
    });
  }

  function handlePersonnelLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await upsertPersonnelQualification({
        personnelId: getSelectValue(form, "personnelId"),
        qualificationId: getSelectValue(form, "qualificationId"),
        issuedAt: getSelectValue(form, "issuedAt"),
        expiresAt: getSelectValue(form, "expiresAt"),
        notes: getSelectValue(form, "notes"),
      });
      if (result.success) {
        event.currentTarget.reset();
        refresh("Kwalificatie aan medewerker gekoppeld");
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleRoleLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await upsertRoleQualification({
        roleId: getSelectValue(form, "roleId"),
        qualificationId: getSelectValue(form, "qualificationId"),
        required: form.get("required") === "on",
      });
      if (result.success) {
        event.currentTarget.reset();
        refresh("Kwalificatie aan functie gekoppeld");
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleTaskCodeLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await upsertTaskCodeQualification({
        taskCodeId: getSelectValue(form, "taskCodeId"),
        qualificationId: getSelectValue(form, "qualificationId"),
        required: form.get("required") === "on",
      });
      if (result.success) {
        event.currentTarget.reset();
        refresh("Kwalificatie aan taakcode gekoppeld");
      } else {
        toast.error(result.message);
      }
    });
  }

  function run(action: () => Promise<{ success: boolean; message?: string }>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        refresh(successMessage);
      } else {
        toast.error(result.message ?? "Actie mislukt");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard label="Kwalificaties" value={data.items.length} description="Certificaten, diploma's en kennis" />
        <SummaryCard label="Verloopt binnenkort" value={data.expiringCount} description="Binnen 60 dagen" tone="warning" />
        <SummaryCard label="Verlopen" value={data.expiredCount} description="Actie nodig voor planning" tone="danger" />
      </div>

      <section className="veele-card p-0">
        <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ borderBottom: "1px solid #E2E8F0" }}>
          <div>
            <h2 className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
              Kwalificatiecatalogus
            </h2>
            <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
              Beheer de vaste lijst met certificaten, diploma's en kennisgebieden. Deze lijst stuurt personeelsprofielen, taakcodes en planningfilters.
            </p>
          </div>
        </div>
        {canWrite && (
          <form onSubmit={handleCreateItem} className="grid gap-3 bg-slate-50 px-5 py-4 lg:grid-cols-6" style={{ borderBottom: "1px solid #E2E8F0" }}>
            <div className="space-y-1">
              <Label>Type</Label>
              <select name="type" className="h-9 w-full rounded-md border bg-white px-3 text-sm" defaultValue="certificate">
                <option value="certificate">Certificaat</option>
                <option value="diploma">Diploma</option>
                <option value="knowledge">Kennisgebied</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Code</Label>
              <Input name="code" placeholder="VCA" required />
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label>Naam</Label>
              <Input name="name" placeholder="VCA basis" required />
            </div>
            <div className="space-y-1">
              <Label>Sector</Label>
              <select name="sectorId" className="h-9 w-full rounded-md border bg-white px-3 text-sm" defaultValue="">
                <option value="">Alle sectoren</option>
                {data.sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>{sector.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Geldig maanden</Label>
              <Input name="validityMonths" type="number" min={1} max={240} placeholder="36" />
            </div>
            <div className="space-y-1 lg:col-span-5">
              <Label>Omschrijving</Label>
              <Textarea name="description" className="min-h-9" placeholder="Waar is deze kwalificatie voor nodig?" />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Toevoegen
              </Button>
            </div>
          </form>
        )}
        <div className="grid gap-5 p-5 lg:grid-cols-3">
          {(["certificate", "diploma", "knowledge"] as QualificationType[]).map((type) => (
            <QualificationGroup
              key={type}
              type={type}
              items={data.items.filter((item) => item.type === type)}
              canWrite={canWrite}
              isPending={isPending}
              onToggle={(item) => run(() => setQualificationStatus(item.id, !item.isActive), item.isActive ? "Kwalificatie gedeactiveerd" : "Kwalificatie geactiveerd")}
              onDelete={(item) => run(() => deleteQualificationItem(item.id), "Kwalificatie verwijderd")}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <section className="veele-card">
          <SectionHeader title="Koppelen aan medewerkers" description="Registreer wie welk certificaat, diploma of kennisgebied bezit. Verloopdatums worden zichtbaar als waarschuwing." />
          {canWrite && (
            <form onSubmit={handlePersonnelLink} className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 lg:grid-cols-2">
              <FieldSelect name="personnelId" label="Medewerker" options={data.personnel.map((p) => ({ id: p.id, label: `${p.label}${p.roleName ? ` - ${p.roleName}` : ""}` }))} />
              <FieldSelect name="qualificationId" label="Kwalificatie" options={itemOptions} />
              <FieldInput name="issuedAt" label="Afgiftedatum" type="date" />
              <FieldInput name="expiresAt" label="Verloopdatum" type="date" />
              <div className="lg:col-span-2">
                <Label>Notitie</Label>
                <Textarea name="notes" className="mt-1 min-h-9" placeholder="Bijv. kopie aanwezig in dossier" />
              </div>
              <div className="lg:col-span-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Koppelen
                </Button>
              </div>
            </form>
          )}
          <LinkList
            rows={data.personnelLinks}
            empty="Nog geen kwalificaties aan medewerkers gekoppeld."
            canWrite={canWrite}
            onRemove={(row) => run(() => removePersonnelQualification(row.id), "Medewerkerskwalificatie verwijderd")}
            showExpiry
          />
        </section>

        <section className="veele-card">
          <SectionHeader title="Koppelen aan functies" description="Functie-eisen worden meegenomen in slimme planning wanneer een taakcode een functie vereist." />
          {canWrite && (
            <form onSubmit={handleRoleLink} className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4">
              <FieldSelect name="roleId" label="Functie/rol" options={data.roles.map((role) => ({ id: role.id, label: role.name }))} />
              <FieldSelect name="qualificationId" label="Vereiste kwalificatie" options={itemOptions} />
              <CheckField name="required" label="Hard vereiste" />
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Koppelen
              </Button>
            </form>
          )}
          <LinkList
            rows={data.roleLinks}
            empty="Nog geen functie-eisen gekoppeld."
            canWrite={canWrite}
            onRemove={(row) => run(() => removeRoleQualification(row.id), "Functie-eis verwijderd")}
          />
        </section>
      </div>

      <section className="veele-card">
        <SectionHeader title="Koppelen aan taakcodes" description="Taakcode-eisen blokkeren medewerkers die het certificaat, diploma of kennisgebied missen. De bestaande taakcodevelden blijven automatisch gesynchroniseerd." />
        {canWrite && (
          <form onSubmit={handleTaskCodeLink} className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 lg:grid-cols-[1.5fr_1.5fr_auto_auto]">
            <FieldSelect name="taskCodeId" label="Taakcode" options={data.taskCodes.map((task) => ({ id: task.id, label: `${task.label}${task.sectorName ? ` - ${task.sectorName}` : ""}` }))} />
            <FieldSelect name="qualificationId" label="Vereiste kwalificatie" options={itemOptions} />
            <CheckField name="required" label="Hard vereiste" />
            <div className="flex items-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Koppelen
              </Button>
            </div>
          </form>
        )}
        <LinkList
          rows={data.taskCodeLinks}
          empty="Nog geen taakcode-eisen gekoppeld."
          canWrite={canWrite}
          onRemove={(row) => run(() => removeTaskCodeQualification(row.id), "Taakcode-eis verwijderd")}
        />
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  description,
  tone = "neutral",
}: {
  label: string;
  value: number;
  description: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  const color = tone === "danger" ? "#DC2626" : tone === "warning" ? "#B45309" : "#081D3A";
  return (
    <div className="veele-card">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>{label}</p>
      <p className="mt-2 text-3xl font-bold" style={{ color }}>{value}</p>
      <p className="mt-1 text-sm" style={{ color: "#64748B" }}>{description}</p>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>{title}</h2>
      <p className="mt-1 text-sm" style={{ color: "#64748B" }}>{description}</p>
    </div>
  );
}

function QualificationGroup({
  type,
  items,
  canWrite,
  isPending,
  onToggle,
  onDelete,
}: {
  type: QualificationType;
  items: QualificationItemRow[];
  canWrite: boolean;
  isPending: boolean;
  onToggle: (item: QualificationItemRow) => void;
  onDelete: (item: QualificationItemRow) => void;
}) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: meta.bg, color: meta.color }}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "#081D3A" }}>{meta.plural}</h3>
          <p className="text-xs" style={{ color: "#94A3B8" }}>{items.length} item(s)</p>
        </div>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm" style={{ color: "#94A3B8" }}>Nog geen items.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>{item.name}</p>
                  <p className="text-xs" style={{ color: "#64748B" }}>
                    {item.code}{item.sectorName ? ` - ${item.sectorName}` : ""}{item.validityMonths ? ` - ${item.validityMonths} maanden geldig` : ""}
                  </p>
                  {item.description && <p className="mt-1 text-xs" style={{ color: "#64748B" }}>{item.description}</p>}
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: item.isActive ? "#ECFDF5" : "#F8FAFC",
                    color: item.isActive ? "#059669" : "#64748B",
                  }}
                >
                  {item.isActive ? "Actief" : "Inactief"}
                </span>
              </div>
              {canWrite && (
                <div className="mt-2 flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={isPending} onClick={() => onToggle(item)}>
                    {item.isActive ? "Deactiveren" : "Activeren"}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-600" disabled={isPending} onClick={() => onDelete(item)}>
                    <Trash2 className="h-3 w-3" />
                    Verwijderen
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FieldSelect({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select name={name} className="h-9 w-full rounded-md border bg-white px-3 text-sm" required defaultValue="">
        <option value="" disabled>Kies...</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function FieldInput({ name, label, type = "text" }: { name: string; label: string; type?: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input name={name} type={type} />
    </div>
  );
}

function CheckField({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-end gap-2 pb-2 text-sm font-medium" style={{ color: "#475569" }}>
      <input name={name} type="checkbox" defaultChecked className="mb-0.5 h-4 w-4 rounded border-slate-300" />
      {label}
    </label>
  );
}

function LinkList({
  rows,
  empty,
  canWrite,
  showExpiry,
  onRemove,
}: {
  rows: QualificationLinkRow[];
  empty: string;
  canWrite: boolean;
  showExpiry?: boolean;
  onRemove: (row: QualificationLinkRow) => void;
}) {
  return (
    <div className="mt-4 space-y-2">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm" style={{ color: "#94A3B8" }}>{empty}</p>
      ) : (
        rows.map((row) => {
          const meta = TYPE_META[row.qualificationType];
          const expiry = linkStatusStyle(row.expiryStatus);
          const ExpiryIcon = expiry.icon;
          return (
            <div key={row.id} className="flex items-start justify-between gap-3 rounded-lg border bg-white p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: meta.bg, color: meta.color }}>
                    {meta.label}
                  </span>
                  {row.required !== undefined && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium" style={{ color: "#475569" }}>
                      {row.required ? "Hard vereiste" : "Voorkeur"}
                    </span>
                  )}
                  {showExpiry && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: expiry.bg, color: expiry.color }}>
                      <ExpiryIcon className="h-3 w-3" />
                      {expiry.label}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-semibold" style={{ color: "#081D3A" }}>{row.targetLabel}</p>
                <p className="text-xs" style={{ color: "#64748B" }}>
                  {row.qualificationName} ({row.qualificationCode})
                  {row.secondaryLabel ? ` - ${row.secondaryLabel}` : ""}
                  {row.expiresAt ? ` - verloopt ${new Date(`${row.expiresAt}T00:00:00`).toLocaleDateString("nl-NL")}` : ""}
                </p>
              </div>
              {canWrite && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-red-600" onClick={() => onRemove(row)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

import Link from "next/link";
import { Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import type { PlatformContentPreviewModel, PlatformPreviewResource } from "@/lib/platform-content-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type PlatformContentPreviewPanelProps = {
  model: PlatformContentPreviewModel;
  resource: PlatformPreviewResource;
  preserveParams?: Record<string, string | null | undefined>;
};

function resourceLabel(resource: PlatformPreviewResource): string {
  if (resource === "knowledgebase") return "KB-artikelen";
  if (resource === "releases") return "Releases";
  return "Tooltips";
}

function statusClass(visible: boolean): string {
  return visible
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-800";
}

export function PlatformContentPreviewPanel({
  model,
  resource,
  preserveParams = {},
}: PlatformContentPreviewPanelProps) {
  const { options, snapshot } = model;
  const visibleItems = snapshot.items.filter((item) => item.visible).slice(0, 5);
  const hiddenItems = snapshot.items.filter((item) => !item.visible).slice(0, 5);

  return (
    <section className="rounded-lg border border-cyan-100 bg-white shadow-sm">
      <div className="grid gap-4 border-b border-cyan-100 bg-cyan-50/70 p-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-cyan-700" />
            <h2 className="text-lg font-semibold text-slate-950">Preview als audience / tenant / rol</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Controleer met dezelfde runtime visibility-code wat zichtbaar is voor {resourceLabel(resource).toLowerCase()}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline" className="border-cyan-200 bg-white text-cyan-800">{snapshot.label}</Badge>
            <Badge variant="outline" className="bg-white">{snapshot.surface}</Badge>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{snapshot.visibleCount} zichtbaar</Badge>
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">{snapshot.hiddenCount} verborgen</Badge>
          </div>
        </div>

        <form className="grid gap-3 rounded-lg border border-cyan-100 bg-white p-3">
          {Object.entries(preserveParams).map(([key, value]) => (
            value ? <input key={key} type="hidden" name={key} value={value} /> : null
          ))}
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Previewmodus
            <select
              name="previewMode"
              defaultValue={snapshot.input.mode}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"
            >
              {options.modes.map((mode) => (
                <option key={mode.key} value={mode.key}>{mode.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Tenant
            <select
              name="previewTenantId"
              defaultValue={snapshot.input.tenantId ?? ""}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"
            >
              <option value="">Geen tenant / alle modules</option>
              {options.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.slug})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Modules override
            <select
              name="previewModuleKeys"
              multiple
              defaultValue={snapshot.input.moduleKeys}
              className="min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
            >
              {options.modules.map((module) => (
                <option key={module.key} value={module.key}>
                  {module.name} ({module.key})
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-slate-500">Leeg laten gebruikt de actieve modules van de gekozen tenant.</span>
          </label>
          <Button type="submit" variant="outline" className="gap-2">
            <Eye className="h-4 w-4" />
            Preview bijwerken
          </Button>
        </form>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">Runtime context</p>
          <dl className="mt-3 grid gap-2 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Audiences</dt>
              <dd className="mt-1 break-words text-slate-700">{snapshot.runtimeAudiences.join(", ") || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Actieve modules</dt>
              <dd className="mt-1 break-words text-slate-700">{snapshot.activeModuleKeys.join(", ") || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Permissies</dt>
              <dd className="mt-1 max-h-20 overflow-auto break-words text-slate-700">{snapshot.permissionKeys.join(", ") || "-"}</dd>
            </div>
          </dl>
          {snapshot.baseReasons.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {snapshot.baseReasons.join(" ")}
            </div>
          )}
        </div>

        <div className="grid gap-3">
          <PreviewList title="Zichtbaar" icon="visible" items={visibleItems} empty="Niets zichtbaar in deze preview." />
          <PreviewList title="Verborgen" icon="hidden" items={hiddenItems} empty="Geen verborgen items in de eerste set." />
        </div>
      </div>
    </section>
  );
}

function PreviewList({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: "visible" | "hidden";
  items: PlatformContentPreviewModel["snapshot"]["items"];
  empty: string;
}) {
  const Icon = icon === "visible" ? Eye : EyeOff;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      </div>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                {item.href ? (
                  <Link href={item.href} className="font-semibold text-slate-950 hover:underline">
                    {item.title}
                  </Link>
                ) : (
                  <p className="font-semibold text-slate-950">{item.title}</p>
                )}
                {item.subtitle && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.subtitle}</p>}
              </div>
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(item.visible)}`}>
                {item.visible ? "zichtbaar" : "verborgen"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {item.audienceKeys.map((audience) => <Badge key={audience} variant="outline">{audience}</Badge>)}
              {item.moduleKeys.map((moduleKey) => <Badge key={moduleKey} variant="outline">{moduleKey}</Badge>)}
              <Badge variant="outline">{item.status}</Badge>
            </div>
            {(item.visible ? item.matched : item.reasons).length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">
                {(item.visible ? item.matched : item.reasons).slice(0, 4).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">{empty}</p>}
      </div>
    </div>
  );
}

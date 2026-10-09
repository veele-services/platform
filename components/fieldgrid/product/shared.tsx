"use client";
import { X } from "lucide-react";
import { ActionIcon } from "../action-icon";
import { useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useTenantTheme } from "../tenant-theme";
import { saveProduct, uploadProductFile } from "@/lib/product/actions";
import {
  groupLabels,
  audienceSummary,
  type ProductAudience,
  type ProductOptions,
  type AvailabilityInput,
  type ProductOperation,
  type ProductWorkspace,
} from "@/lib/product/model";
import "../work-orders/work-orders.css";
import "./product.css";
export function ProductDialog({
  title,
  description,
  children,
  close,
  busy = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  close: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="commercial-dialog wo-dialog product-dialog"
        data-dialog-size="compact"
        style={useTenantTheme()}
      >
        <header>
          <div className="product-dialog-heading">
            <span className="eyebrow">FIELDGRID PRODUCTONTWIKKELING</span>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
          <ActionIcon
            className="product-dialog-close"
            label="Sluiten"
            icon={<X />}
            disabled={busy}
            onClick={close}
          />
        </header>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function useProductCommand(workspace: ProductWorkspace) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    intent = useRef<{
      fingerprint: string;
      id: string;
    } | null>(null),
    locked = useRef(false);
  async function run(operation: ProductOperation) {
    if (locked.current) return null;
    locked.current = true;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify(operation);
    if (intent.current?.fingerprint !== fingerprint)
      intent.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const r = await saveProduct({
        workspace,
        requestId: intent.current.id,
        operation,
      });
      if (!r.ok) {
        setError(r.error);
        return null;
      }
      intent.current = null;
      return r.id;
    } catch {
      setError(
        "De uitkomst is nog niet bevestigd. Probeer opnieuw; dezelfde aanvraag wordt gebruikt.",
      );
      return null;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error, setError };
}
export function Feedback({ error }: { error: string }) {
  return error ? (
    <p className="product-error" role="alert">
      {error}
    </p>
  ) : null;
}
export function AudienceEditor({
  value,
  onChange,
  options,
  label = "Doelgroep",
}: {
  value: ProductAudience;
  onChange: (a: ProductAudience) => void;
  options: ProductOptions;
  label?: string;
}) {
  return (
    <fieldset className="product-audience">
      <legend>{label}</legend>
      <label>
        Tenantbereik
        <select
          value={value.scope}
          onChange={(e) => {
            const scope = e.target.value as ProductAudience["scope"];
            onChange({
              scope,
              tenants: scope === "selected" ? value.tenants : [],
              groups: scope === "internal" ? [] : value.groups,
            });
          }}
        >
          <option value="internal">Alleen intern</option>
          <option value="all">Alle tenants</option>
          <option value="selected">Geselecteerde tenants</option>
        </select>
      </label>
      {value.scope !== "internal" && (
        <fieldset className="product-checks">
          <legend>Gebruikersgroepen</legend>
          {Object.entries(groupLabels).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={value.groups.includes(
                  key as ProductAudience["groups"][number],
                )}
                onChange={(e) =>
                  onChange({
                    ...value,
                    groups: e.target.checked
                      ? [
                          ...value.groups,
                          key as ProductAudience["groups"][number],
                        ]
                      : value.groups.filter((g) => g !== key),
                  })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      {value.scope === "selected" && (
        <TenantSelection
          value={value.tenants}
          onChange={(tenants) => onChange({ ...value, tenants })}
          options={options}
        />
      )}
      <p className="product-notice">
        {audienceSummary(value, options.tenants)}. Een lege selectie verleent
        geen toegang.
      </p>
    </fieldset>
  );
}
function TenantSelection({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  options: ProductOptions;
}) {
  return (
    <fieldset className="product-checks product-targets">
      <legend>Organisaties</legend>
      {options.tenants.map((t) => (
        <label key={t.id}>
          <input
            type="checkbox"
            checked={value.includes(t.id)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, t.id]
                  : value.filter((id) => id !== t.id),
              )
            }
          />
          {t.name}
        </label>
      ))}
      {!options.tenants.length && <p>Er zijn nog geen actieve organisaties.</p>}
    </fieldset>
  );
}
export function AvailabilityEditor({
  value,
  onChange,
  options,
}: {
  value: AvailabilityInput;
  onChange: (v: AvailabilityInput) => void;
  options: ProductOptions;
}) {
  return (
    <fieldset className="product-audience">
      <legend>Handmatige beschikbaarheidsregistratie</legend>
      <p className="product-notice">
        Deze registratie voert geen deployment uit en schakelt geen functie in.
      </p>
      {(["staging", "production"] as const).map((environment) => {
        const v = value.find((a) => a.environment === environment),
          update = (next: AvailabilityInput[number]) =>
            onChange([
              ...value.filter((a) => a.environment !== environment),
              next,
            ]);
        return (
          <section key={environment} className="product-availability-editor">
            <label className="product-checkbox">
              <input
                type="checkbox"
                checked={!!v}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [
                          ...value,
                          {
                            environment,
                            scope: "internal",
                            tenants: [],
                            phased: false,
                          },
                        ]
                      : value.filter((a) => a.environment !== environment),
                  )
                }
              />
              {environment === "staging" ? "Staging" : "Productie"} registreren
            </label>
            {v && (
              <>
                <label>
                  Beschikbaar voor
                  <select
                    value={v.scope}
                    onChange={(e) =>
                      update({
                        ...v,
                        scope: e.target.value as typeof v.scope,
                        tenants: e.target.value === "selected" ? v.tenants : [],
                      })
                    }
                  >
                    <option value="internal">Nog niet beschikbaar</option>
                    <option value="all">Alle tenants</option>
                    <option value="selected">Geselecteerde tenants</option>
                  </select>
                </label>
                {v.scope === "selected" && (
                  <TenantSelection
                    value={v.tenants}
                    onChange={(tenants) => update({ ...v, tenants })}
                    options={options}
                  />
                )}
                <label className="product-checkbox">
                  <input
                    type="checkbox"
                    checked={v.phased}
                    onChange={(e) => update({ ...v, phased: e.target.checked })}
                  />
                  Gefaseerde beschikbaarheid
                </label>
              </>
            )}
          </section>
        );
      })}
    </fieldset>
  );
}
export function ProductFiles({
  files,
  workspace,
}: {
  files: Array<{
    id: string;
    name: string;
    size: number;
  }>;
  workspace: ProductWorkspace;
}) {
  return (
    <ul className="product-files">
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={`/api/product/files/${f.id}?workspace=${workspace}`}
            target="_blank"
            rel="noreferrer"
          >
            {f.name}
          </a>
          <small>{Math.ceil(f.size / 1024)} KB</small>
        </li>
      ))}
    </ul>
  );
}
export function FileUpload({
  workspace,
  id,
  kind,
  changed,
}: {
  workspace: ProductWorkspace;
  id: string;
  kind: "idea" | "change";
  changed: () => Promise<void>;
}) {
  const intent = useRef<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="product-upload"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.currentTarget,
          data = new FormData(form);
        intent.current ??= crypto.randomUUID();
        data.set("workspace", workspace);
        data.set("id", id);
        data.set("kind", kind);
        data.set("requestId", intent.current);
        setBusy(true);
        setError("");
        try {
          const r = await uploadProductFile(data);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          intent.current = null;
          form.reset();
          await changed();
        } catch {
          setError(
            "Upload niet bevestigd. Probeer opnieuw met dezelfde aanvraag.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Bijlage toevoegen
        <input
          type="file"
          name="file"
          required
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          disabled={busy}
          onChange={() => {
            intent.current = null;
          }}
        />
      </label>
      <small>
        PDF of afbeelding, maximaal 10 MB. Bestanden worden gecontroleerd.
      </small>
      <Feedback error={error} />
      <button className="secondary-button" disabled={busy}>
        {busy ? "Controleren…" : "Bijlage opslaan"}
      </button>
    </form>
  );
}
export function RoadmapPicker({
  workspace,
  name = "roadmapId",
  value = "",
  label = "",
  onChange,
}: {
  workspace: ProductWorkspace;
  name?: string;
  value?: string;
  label?: string;
  onChange?: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(value),
    [items, setItems] = useState<
      Array<{
        id: string;
        title: string;
      }>
    >(value ? [{ id: value, title: label || "Gekoppelde ontwikkeling" }] : []),
    [busy, setBusy] = useState(false);
  async function search() {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/product?${new URLSearchParams({ workspace, section: "roadmap", search: query, pageSize: "25" })}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      if (!r.ok) throw new Error();
      const d = await r.json();
      setItems(d.items);
    } catch {
      setItems([]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="product-audience">
      <legend>Roadmapkoppeling</legend>
      <div className="product-picker-search">
        <label>
          Ontwikkeling zoeken
          <input
            value={query}
            maxLength={160}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void search()}
        >
          {busy ? "Zoeken…" : "Zoeken"}
        </button>
      </div>
      <label>
        Ontwikkeling
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            onChange?.(e.target.value);
          }}
        >
          <option value="">Niet gekoppeld</option>
          {selected && !items.some((r) => r.id === selected) && (
            <option value={selected}>
              {label || "Gekoppelde ontwikkeling"}
            </option>
          )}
          {items.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name={name} value={selected} />
      <small>Een koppeling geeft geen extra leesrechten.</small>
    </fieldset>
  );
}

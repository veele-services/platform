"use client";
import { useRef, useState, type FormEvent } from "react";
import { uploadProductFile } from "@/lib/product/actions";
import {
  internalAudience,
  progressLabels,
  changeLabels,
  type ProductAudience,
  type AvailabilityInput,
  type ProductOptions,
  type ProductItem,
  type ReleaseChange,
  type ProductRelease,
  type ProductOperation,
  type ProductWorkspace,
  type ProductSection,
} from "@/lib/product/model";
import {
  ProductDialog,
  AudienceEditor,
  AvailabilityEditor,
  Feedback,
  useProductCommand,
  RoadmapPicker,
} from "./shared";
type EditorKind = ProductSection | "change" | "convert";
const labels: Record<EditorKind, string> = {
  ideas: "Idee indienen",
  roadmap: "Ontwikkeling bewerken",
  releases: "Release bewerken",
  change: "Releaseonderdeel bewerken",
  convert: "Algemene ontwikkeling maken",
};
export function ProductEditor({
  workspace,
  kind,
  item,
  release,
  options,
  close,
  saved,
}: {
  workspace: ProductWorkspace;
  kind: EditorKind;
  item?: ProductItem | ReleaseChange;
  release?: ProductRelease;
  options: ProductOptions;
  close: () => void;
  saved: (section: ProductSection, id: string) => Promise<void>;
}) {
  const value = (item ?? {}) as Record<string, unknown> & {
      audience?: ProductAudience | null;
      availabilityInput?: AvailabilityInput;
    },
    command = useProductCommand(workspace);
  const [audience, setAudience] = useState<ProductAudience>(
    kind === "convert"
      ? internalAudience
      : (value.audience ?? internalAudience),
  );
  const [inherit, setInherit] = useState(
    kind === "change" && value.audience == null,
  );
  const [availability, setAvailability] = useState<AvailabilityInput>(
    kind === "convert" ? [] : (value.availabilityInput ?? []),
  );
  const [uploading, setUploading] = useState(false),
    submitting = useRef(false);
  const created = useRef<string | null>(null),
    fileIntent = useRef<string | null>(null);
  const admin = workspace === "platform";
  const initial = (field: string) =>
    kind === "convert"
      ? ""
      : String((value as Record<string, unknown>)[field] ?? "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    try {
      const form = new FormData(event.currentTarget),
        text = (key: string) => String(form.get(key) ?? "");
      const reference = item
        ? {
            id: item.id,
            revision: kind === "change" ? release!.revision : item.revision,
          }
        : {};
      let operation: ProductOperation;
      if (kind === "ideas")
        operation = {
          command: "submit_idea",
          payload: {
            title: text("title"),
            category: text("category"),
            problem: text("problem"),
            suggestion: text("suggestion"),
            benefit: text("benefit"),
          },
        };
      else if (kind === "releases")
        operation = {
          command: "save_release",
          payload: {
            ...reference,
            revision: item?.revision ?? 0,
            title: text("title"),
            version: text("version"),
            intro: text("intro"),
            audience,
          },
        };
      else if (kind === "change")
        operation = {
          command: "save_change",
          payload: {
            ...reference,
            releaseId: release!.id,
            revision: release!.revision,
            title: text("title"),
            body: text("body"),
            category: text("category"),
            kind: text("changeKind") as ReleaseChange["kind"],
            roadmapId: text("roadmapId") || null,
            audience: inherit ? null : audience,
            availability,
          },
        };
      else
        operation = {
          command: kind === "convert" ? "convert_idea" : "save_roadmap",
          payload: {
            ...reference,
            revision: item?.revision ?? 0,
            title: text("title"),
            summary: text("summary"),
            body: text("body"),
            category: text("category"),
            progress: text("progress") as keyof typeof progressLabels,
            priority: text("priority") as "low" | "normal" | "high" | "urgent",
            responsible: text("responsible") || null,
            planning: text("planning"),
            audience,
            availability,
          },
        };
      const id = created.current ?? (await command.run(operation));
      if (!id) return;
      created.current = id;
      const file = form.get("file");
      if (kind === "ideas" && file instanceof File && file.size > 0) {
        setUploading(true);
        fileIntent.current ??= crypto.randomUUID();
        const upload = new FormData();
        upload.set("workspace", workspace);
        upload.set("id", id);
        upload.set("kind", "idea");
        upload.set("requestId", fileIntent.current);
        upload.set("file", file);
        const r = await uploadProductFile(upload).catch(() => ({
          ok: false as const,
          error:
            "De bijlage is nog niet bevestigd. Je idee is wel ingediend; probeer de bijlage opnieuw.",
        }));
        if (!r.ok) {
          command.setError(r.error);
          return;
        }
      }
      await saved(
        kind === "convert" ? "roadmap" : kind === "change" ? "releases" : kind,
        kind === "change" ? release!.id : id,
      );
    } finally {
      submitting.current = false;
      setUploading(false);
    }
  }
  return (
    <ProductDialog
      title={labels[kind]}
      description={
        kind === "ideas"
          ? "Je idee wordt gedeeld met bevoegd management van je organisatie en Fieldgrid."
          : kind === "convert"
            ? "Schrijf een algemene omschrijving. De oorspronkelijke inzending en bijlagen blijven afzonderlijk."
            : "Sla de inhoud op als voorbereiding. Publiceren is een afzonderlijke beheeractie."
      }
      close={close}
      busy={command.busy || uploading}
    >
      <form className="wo-form product-form" onSubmit={submit}>
        <div className="wo-dialog-body product-body">
          <label>
            Titel
            <input
              name="title"
              defaultValue={initial("title")}
              required
              minLength={2}
              maxLength={180}
            />
          </label>
          {kind === "releases" ? (
            <>
              <label>
                Versienummer of releasenaam
                <input
                  name="version"
                  defaultValue={initial("version")}
                  required
                  maxLength={80}
                  placeholder="Bijvoorbeeld 1.1.0"
                />
              </label>
              <label>
                Algemene introductie
                <textarea
                  name="intro"
                  defaultValue={initial("intro")}
                  maxLength={4000}
                  rows={4}
                />
                <small>
                  Gebruik tekst die geschikt is voor de volledige
                  releasedoelgroep.
                </small>
              </label>
            </>
          ) : (
            <label>
              Onderdeel / categorie
              <input
                name="category"
                defaultValue={initial("category")}
                required
                maxLength={80}
                list="product-categories"
              />
              <datalist id="product-categories">
                {[
                  "Planning",
                  "Werkbonnen",
                  "Facturatie",
                  "Personeel",
                  "Klantportaal",
                  "Platform",
                  "Overig",
                ].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          )}
          {kind === "ideas" ? (
            <>
              <label>
                Wat wil je verbeteren?
                <textarea
                  name="problem"
                  defaultValue={initial("problem")}
                  required
                  minLength={10}
                  maxLength={20000}
                  rows={5}
                />
              </label>
              <label>
                Hoe zou het volgens jou moeten werken?
                <textarea
                  name="suggestion"
                  defaultValue={initial("suggestion")}
                  maxLength={12000}
                  rows={3}
                />
              </label>
              <label>
                Wat levert dit op?
                <textarea
                  name="benefit"
                  defaultValue={initial("benefit")}
                  maxLength={8000}
                  rows={3}
                />
              </label>
              <label>
                Bijlage / screenshot (optioneel)
                <input
                  name="file"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={() => {
                    fileIntent.current = null;
                  }}
                />
                <small>
                  Maximaal 10 MB; PDF of afbeelding. Bestanden worden
                  gecontroleerd.
                </small>
              </label>
            </>
          ) : null}
          {(kind === "roadmap" || kind === "convert") && (
            <>
              <label>
                Korte omschrijving
                <textarea
                  name="summary"
                  defaultValue={initial("summary")}
                  required
                  maxLength={600}
                  rows={3}
                />
              </label>
              <label>
                Uitgebreide toelichting
                <textarea
                  name="body"
                  defaultValue={initial("body")}
                  maxLength={20000}
                  rows={6}
                />
              </label>
              <div className="product-form-grid">
                <label>
                  Voortgang
                  <select
                    name="progress"
                    defaultValue={initial("progress") || "research"}
                  >
                    {Object.entries(progressLabels).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Interne prioriteit
                  <select
                    name="priority"
                    defaultValue={initial("priority") || "normal"}
                  >
                    <option value="low">Laag</option>
                    <option value="normal">Normaal</option>
                    <option value="high">Hoog</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
              </div>
              <label>
                Interne verantwoordelijke
                <select
                  name="responsible"
                  defaultValue={initial("responsible")}
                >
                  <option value="">Niet toegewezen</option>
                  {options.owners.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Indicatieve planning
                <input
                  name="planning"
                  defaultValue={initial("planning")}
                  maxLength={160}
                  placeholder="Bijvoorbeeld Volgende release of indicatief Q1"
                />
                <small>Een indicatie is geen gegarandeerde opleverdatum.</small>
              </label>
            </>
          )}
          {kind === "change" && (
            <>
              <label>
                Type wijziging
                <select
                  name="changeKind"
                  defaultValue={initial("kind") || "new"}
                >
                  {Object.entries(changeLabels).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Uitleg
                <textarea
                  name="body"
                  defaultValue={initial("body")}
                  required
                  maxLength={20000}
                  rows={6}
                />
              </label>
              <RoadmapPicker
                workspace={workspace}
                value={initial("roadmapId")}
                label={
                  item && "roadmap" in item ? (item.roadmap?.title ?? "") : ""
                }
              />
              <label>
                Doelgroep van onderdeel
                <select
                  value={inherit ? "inherit" : "restrict"}
                  onChange={(e) => setInherit(e.target.value === "inherit")}
                >
                  <option value="inherit">Expliciet erven van release</option>
                  <option value="restrict">Verder beperken / intern</option>
                </select>
              </label>
            </>
          )}
          {admin && (kind !== "change" || !inherit) && (
            <AudienceEditor
              value={audience}
              onChange={setAudience}
              options={options}
            />
          )}
          {admin && kind !== "releases" && (
            <AvailabilityEditor
              value={availability}
              onChange={setAvailability}
              options={options}
            />
          )}
          {admin && (
            <p className="product-notice">
              Publicatiestatus:{" "}
              {item && "publication" in item
                ? item.publication === "published"
                  ? "Gepubliceerd"
                  : item.publication === "archived"
                    ? "Gearchiveerd"
                    : "Concept"
                : "Concept"}
              . Opslaan verstuurt geen aankondiging.
            </p>
          )}
          <Feedback error={command.error} />
        </div>
        <footer className="wizard-footer">
          <button
            className="secondary-button"
            type="button"
            disabled={command.busy || uploading}
            onClick={close}
          >
            Annuleren
          </button>
          <button
            className="primary-button"
            disabled={command.busy || uploading}
          >
            {command.busy || uploading
              ? "Opslaan…"
              : kind === "ideas"
                ? "Idee indienen"
                : "Opslaan"}
          </button>
        </footer>
      </form>
    </ProductDialog>
  );
}

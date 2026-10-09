"use client";
import { useState } from "react";
import {
  Plus,
  Edit,
  Archive,
  Send,
  Eye,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { ActionIcon } from "../action-icon";
import { EmptyState } from "../empty-state";
import {
  roadmapSchema,
  releaseSchema,
  progressLabels,
  ideaLabels,
  publicationLabels,
  changeLabels,
  audienceSummary,
  type ProductActorSnapshot,
  type ProductOptions,
  type ProductItem,
  type ProductSection,
  type ProductIdea,
  type ProductRelease,
  type RoadmapItem,
  type ProductWorkspace,
} from "@/lib/product/model";
import {
  ProductDialog,
  ProductFiles,
  FileUpload,
  Feedback,
  RoadmapPicker,
  useProductCommand,
} from "./shared";
import type { EditorRequest } from "./hub";
export function ProductDetail({
  section,
  item,
  snapshot,
  close,
  edit,
  refresh,
  publish,
  preview,
}: {
  section: ProductSection;
  item: ProductItem;
  snapshot: ProductActorSnapshot;
  close: () => void;
  edit: (r: EditorRequest) => void;
  refresh: () => Promise<void>;
  publish: (action: "publish" | "announce" | "archive") => void;
  preview: () => void;
}) {
  const publication = "publication" in item ? item.publication : undefined;
  const admin = snapshot.access.canManage,
    command = useProductCommand(snapshot.workspace),
    kind =
      section === "ideas"
        ? "idea"
        : section === "roadmap"
          ? "roadmap"
          : "release";
  const idea = section === "ideas" ? (item as ProductIdea) : null,
    roadmap = section === "roadmap" ? (item as RoadmapItem) : null,
    release = section === "releases" ? (item as ProductRelease) : null;
  async function order(index: number, direction: number) {
    if (!release) return;
    const ids = release.changes.map((c) => c.id),
      target = index + direction;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    if (
      await command.run({
        command: "reorder_changes",
        payload: { releaseId: release.id, revision: release.revision, ids },
      })
    )
      await refresh();
  }
  return (
    <ProductDialog
      title={item.title}
      description={
        idea
          ? "Inzending en terugkoppeling van de organisatie."
          : roadmap
            ? "Voortgang, publicatie en geregistreerde beschikbaarheid."
            : "Alleen de wijzigingen voor jouw doelgroep worden getoond."
      }
      close={close}
      busy={command.busy}
    >
      <div className="wo-dialog-body product-body">
        <div className="product-detail-actions">
          {admin && section !== "ideas" && (
            <ActionIcon
              label="Bewerken"
              icon={<Edit />}
              onClick={() => edit({ kind: section, item })}
            />
          )}{" "}
          {admin && section !== "ideas" && (
            <>
              <ActionIcon
                label="Voorbeeld als ontvanger"
                icon={<Eye />}
                onClick={preview}
              />
              {publication !== "published" ? (
                <ActionIcon
                  label="Publiceren"
                  icon={<Send />}
                  onClick={() => publish("publish")}
                />
              ) : (
                <ActionIcon
                  label="Opnieuw aankondigen"
                  icon={<Send />}
                  onClick={() => publish("announce")}
                />
              )}
              <ActionIcon
                label="Archiveren"
                icon={<Archive />}
                disabled={publication === "archived"}
                onClick={() => publish("archive")}
              />
            </>
          )}
        </div>
        {admin && "audience" in item && item.audience && (
          <p className="product-notice">
            {audienceSummary(item.audience, snapshot.options.tenants)} ·
            Publicatiestatus: {publicationLabels[item.publication!]}
          </p>
        )}
        {idea && (
          <>
            <div className="product-meta">
              <span className="resource-status">{ideaLabels[idea.state]}</span>
              <span>{idea.category}</span>
              {idea.tenantName && <span>{idea.tenantName}</span>}
            </div>
            <Content title="Wat wil je verbeteren?" text={idea.problem} />
            {idea.suggestion && (
              <Content
                title="Hoe zou het moeten werken?"
                text={idea.suggestion}
              />
            )}{" "}
            {idea.benefit && (
              <Content title="Wat levert dit op?" text={idea.benefit} />
            )}{" "}
            {idea.decision && (
              <Content title="Terugkoppeling" text={idea.decision} />
            )}
            <ProductFiles files={idea.files} workspace={snapshot.workspace} />
            {snapshot.access.canSubmit || admin ? (
              <FileUpload
                workspace={snapshot.workspace}
                id={idea.id}
                kind="idea"
                changed={refresh}
              />
            ) : null}
            {idea.roadmap && (
              <section className="product-linked">
                <h3>Gekoppelde ontwikkeling</h3>
                <a
                  className="table-record-link"
                  href={`${productPath(snapshot.workspace)}?roadmap=${idea.roadmap.id}`}
                >
                  {idea.roadmap.title}
                </a>
                <p>{idea.roadmap.summary}</p>
                <small>{progressLabels[idea.roadmap.progress]}</small>
              </section>
            )}
            {admin && (
              <>
                <IdeaTreatment
                  idea={idea}
                  workspace={snapshot.workspace}
                  refresh={refresh}
                />
                <button
                  className="secondary-button"
                  onClick={() => edit({ kind: "convert", item: idea })}
                >
                  Nieuw roadmapitem maken
                </button>
                <IdeaLink
                  idea={idea}
                  workspace={snapshot.workspace}
                  refresh={refresh}
                />
              </>
            )}
            <section>
              <h3>Behandelgeschiedenis</h3>
              <ol className="product-timeline">
                {idea.history.map((h) => (
                  <li key={h.id}>
                    <strong>{ideaLabels[h.state]}</strong>
                    <time dateTime={h.createdAt}>{date(h.createdAt)}</time>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h3>Gesprek met Fieldgrid</h3>
              <ol className="product-timeline">
                {idea.messages.map((m) => (
                  <li key={m.id}>
                    <div>
                      <strong>{m.from}</strong>
                      <time dateTime={m.createdAt}>{date(m.createdAt)}</time>
                    </div>
                    <p>{m.body}</p>
                  </li>
                ))}
              </ol>
              {!idea.messages.length && (
                <p>Je idee is ontvangen. Reacties verschijnen hier.</p>
              )}
            </section>
            {(admin || snapshot.access.canSubmit) && (
              <MessageForm
                workspace={snapshot.workspace}
                operation="reply"
                id={idea.id}
                revision={idea.revision}
                kind="idea"
                changed={refresh}
              />
            )}
          </>
        )}
        {roadmap && (
          <>
            <div className="product-meta">
              <span className="resource-status">
                {progressLabels[roadmap.progress]}
              </span>
              <span>{roadmap.category}</span>
            </div>
            <p>{roadmap.summary}</p>
            <div className="product-copy">{roadmap.body}</div>
            {roadmap.planning && (
              <p>
                Indicatieve planning: {roadmap.planning}. Dit is geen
                gegarandeerde opleverdatum.
              </p>
            )}
            <Availability value={roadmap.availability} />
            {admin && roadmap.linkedReleases && (
              <section>
                <h3>Gekoppelde releaseonderdelen</h3>
                {roadmap.linkedReleases.map((r, i) => (
                  <p key={`${r.id}:${i}`}>
                    <a
                      className="table-record-link"
                      href={`/platform/productbeheer?release=${r.id}`}
                    >
                      {r.version} · {r.title}
                    </a>{" "}
                    — {r.changeTitle}
                  </p>
                ))}
                {!roadmap.linkedReleases.length && (
                  <p>Nog geen gekoppelde releaseonderdelen.</p>
                )}
              </section>
            )}
            {admin && roadmap.linkedIdeas && (
              <section>
                <h3>Gekoppelde inzendingen</h3>
                {roadmap.linkedIdeas.map((i) => (
                  <p key={i.id}>
                    <a
                      className="table-record-link"
                      href={`/platform/productbeheer?idea=${i.id}`}
                    >
                      {i.title}
                    </a>{" "}
                    · {i.tenantName}
                  </p>
                ))}
                {!roadmap.linkedIdeas.length && (
                  <p>Nog geen gekoppelde ideeën.</p>
                )}
              </section>
            )}
          </>
        )}
        {release && (
          <>
            <div className="product-meta">
              <span>{release.version}</span>
              <span>
                {release.publishedAt ? date(release.publishedAt) : "Concept"}
              </span>
            </div>
            <div className="product-copy">{release.intro}</div>
            {admin && (
              <button
                className="secondary-button"
                onClick={() => edit({ kind: "change", release })}
              >
                <Plus size={16} />
                Onderdeel toevoegen
              </button>
            )}
            {release.changes.map((c, index) => (
              <article className="product-release-part" key={c.id}>
                <header>
                  <span className="resource-status">
                    {changeLabels[c.kind]}
                  </span>
                  <small>{c.category}</small>
                  {admin && (
                    <div className="resource-actions">
                      <ActionIcon
                        label={`Bewerk ${c.title}`}
                        icon={<Edit />}
                        onClick={() =>
                          edit({ kind: "change", item: c, release })
                        }
                      />
                      <ActionIcon
                        label={`Verplaats ${c.title} omhoog`}
                        icon={<ArrowUp />}
                        disabled={command.busy || index === 0}
                        onClick={() => void order(index, -1)}
                      />
                      <ActionIcon
                        label={`Verplaats ${c.title} omlaag`}
                        icon={<ArrowDown />}
                        disabled={
                          command.busy || index === release.changes.length - 1
                        }
                        onClick={() => void order(index, 1)}
                      />
                    </div>
                  )}
                </header>
                <h3>{c.title}</h3>
                <div className="product-copy">{c.body}</div>
                <Availability value={c.availability} />
                {c.roadmap && (
                  <p>
                    Ontwikkeling:{" "}
                    <a
                      className="table-record-link"
                      href={`${productPath(snapshot.workspace)}?roadmap=${c.roadmap.id}`}
                    >
                      {c.roadmap.title}
                    </a>{" "}
                    · {progressLabels[c.roadmap.progress]}
                  </p>
                )}
                {admin && (
                  <p className="product-notice">
                    {c.audience
                      ? audienceSummary(c.audience, snapshot.options.tenants)
                      : "Erft expliciet de doelgroep van deze release."}
                  </p>
                )}
                <ProductFiles files={c.files} workspace={snapshot.workspace} />
                {admin && (
                  <FileUpload
                    workspace={snapshot.workspace}
                    id={c.id}
                    kind="change"
                    changed={refresh}
                  />
                )}
              </article>
            ))}
            {!release.changes.length && (
              <EmptyState
                title="Nog geen releaseonderdelen"
                description="Voeg minimaal één wijziging toe vóór publiceren."
              />
            )}
          </>
        )}
        {admin && (
          <>
            <section>
              <h3>Interne Fieldgrid-notities</h3>
              {item.notes?.map((n) => (
                <div className="product-internal" key={n.id}>
                  <time dateTime={n.createdAt}>{date(n.createdAt)}</time>
                  <p>{n.body}</p>
                </div>
              ))}
              <MessageForm
                workspace={snapshot.workspace}
                operation="note"
                id={item.id}
                revision={item.revision}
                kind={kind}
                changed={refresh}
              />
            </section>
            {item.audit && (
              <details>
                <summary>Beheerhistorie</summary>
                <ol className="product-timeline">
                  {item.audit.map((a, index) => (
                    <li key={index}>
                      <strong>{a.action}</strong>
                      <time dateTime={a.created_at}>{date(a.created_at)}</time>
                      <small>
                        Beheerder:{" "}
                        {snapshot.options.owners.find(
                          (o) => o.id === a.actor_id,
                        )?.name ?? "Bevoegde beheerder"}
                      </small>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        )}
        <Feedback error={command.error} />
      </div>
    </ProductDialog>
  );
}
function productPath(workspace: ProductWorkspace) {
  return {
    platform: "/platform/productbeheer",
    backoffice: "/app/updates",
    staff: "/staff/updates",
    customer: "/klant/updates",
  }[workspace];
}
function Content({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h3>{title}</h3>
      <div className="product-copy">{text}</div>
    </section>
  );
}
export function Availability({
  value,
}: {
  value: {
    staging: string;
    production: string;
  };
}) {
  return (
    <dl className="product-availability">
      <div>
        <dt>Productie</dt>
        <dd>{value.production}</dd>
      </div>
      <div>
        <dt>Staging</dt>
        <dd>{value.staging}</dd>
      </div>
    </dl>
  );
}
function date(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}
function MessageForm({
  workspace,
  operation,
  id,
  revision,
  kind,
  changed,
}: {
  workspace: ProductWorkspace;
  operation: "reply" | "note";
  id: string;
  revision: number;
  kind: "idea" | "roadmap" | "release";
  changed: () => Promise<void>;
}) {
  const command = useProductCommand(workspace),
    [body, setBody] = useState("");
  return (
    <form
      className="product-message-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await command.run(
          operation === "reply"
            ? { command: "reply", payload: { id, revision, body } }
            : { command: "note", payload: { id, kind, body } },
        );
        if (result) {
          setBody("");
          await changed();
        }
      }}
    >
      <label>
        {operation === "note"
          ? "Interne notitie toevoegen"
          : "Reactie toevoegen"}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          maxLength={12000}
          rows={3}
        />
      </label>
      <Feedback error={command.error} />
      <button className="primary-button" disabled={command.busy}>
        {command.busy
          ? "Opslaan…"
          : operation === "note"
            ? "Intern opslaan"
            : "Reactie versturen"}
      </button>
    </form>
  );
}
function IdeaTreatment({
  idea,
  workspace,
  refresh,
}: {
  idea: ProductIdea;
  workspace: ProductWorkspace;
  refresh: () => Promise<void>;
}) {
  const [state, setState] = useState<
      "review" | "information" | "followup" | "parked" | "rejected" | "closed"
    >("review"),
    [decision, setDecision] = useState(""),
    command = useProductCommand(workspace);
  return (
    <form
      className="product-message-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await command.run({
            command: "idea_state",
            payload: { id: idea.id, revision: idea.revision, state, decision },
          })
        ) {
          setDecision("");
          await refresh();
        }
      }}
    >
      <h3>Behandeling</h3>
      <label>
        Status
        <select
          value={state}
          onChange={(e) => setState(e.target.value as typeof state)}
        >
          {(
            [
              "review",
              "information",
              "followup",
              "parked",
              "rejected",
              "closed",
            ] as const
          ).map((s) => (
            <option key={s} value={s}>
              {ideaLabels[s]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Toelichting / vraag aan tenant
        <textarea
          value={decision}
          required={["information", "parked", "rejected"].includes(state)}
          minLength={
            ["information", "parked", "rejected"].includes(state) ? 5 : 0
          }
          maxLength={8000}
          onChange={(e) => setDecision(e.target.value)}
          rows={3}
        />
      </label>
      <Feedback error={command.error} />
      <button className="secondary-button" disabled={command.busy}>
        Behandeling opslaan
      </button>
    </form>
  );
}
function IdeaLink({
  idea,
  workspace,
  refresh,
}: {
  idea: ProductIdea;
  workspace: ProductWorkspace;
  refresh: () => Promise<void>;
}) {
  const command = useProductCommand(workspace),
    [id, setId] = useState(idea.roadmapId ?? "");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await command.run({
            command: "idea_link",
            payload: { id: idea.id, revision: idea.revision, roadmapId: id },
          })
        )
          await refresh();
      }}
    >
      <RoadmapPicker
        workspace={workspace}
        value={id}
        label={idea.roadmap?.title}
        onChange={setId}
      />
      <Feedback error={command.error} />
      <button className="secondary-button" disabled={command.busy || !id}>
        Koppelen aan ontwikkeling
      </button>
    </form>
  );
}
export function PublicationDialog({
  item,
  section,
  action,
  workspace,
  options,
  close,
  changed,
}: {
  item: ProductItem;
  section: ProductSection;
  action: "publish" | "announce" | "archive";
  workspace: ProductWorkspace;
  options: ProductOptions;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const command = useProductCommand(workspace),
    [checked, setChecked] = useState(false),
    [inform, setInform] = useState(false),
    kind = section === "roadmap" ? "roadmap" : "release";
  return (
    <ProductDialog
      title={
        action === "archive"
          ? "Publicatie archiveren"
          : action === "announce"
            ? "Expliciet opnieuw aankondigen"
            : "Publicatie bevestigen"
      }
      description="Controleer de inhoud, doelgroep en geregistreerde beschikbaarheid. Deze actie voert geen softwaredeployment uit."
      close={close}
      busy={command.busy}
    >
      <form
        className="product-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await command.run({
              command: action,
              payload: {
                id: item.id,
                revision: item.revision,
                kind,
                checked,
                inform,
              },
            })
          )
            await changed();
        }}
      >
        <div className="wo-dialog-body product-body">
          <h3>{item.title}</h3>
          {"intro" in item && <p>{item.intro}</p>}
          {"summary" in item && (
            <>
              <p>{item.summary}</p>
              <div className="product-copy">{item.body}</div>
            </>
          )}
          {"audience" in item && item.audience && (
            <p>{audienceSummary(item.audience, options.tenants)}</p>
          )}
          {"changes" in item
            ? item.changes.map((c) => (
                <article key={c.id}>
                  <h4>{c.title}</h4>
                  <p>{c.body}</p>
                  <p>
                    {c.audience
                      ? audienceSummary(c.audience, options.tenants)
                      : "Erft de releasedoelgroep."}
                  </p>
                  <Availability value={c.availability} />
                </article>
              ))
            : "availability" in item && (
                <Availability value={item.availability} />
              )}
          {action !== "archive" && (
            <>
              {kind === "release" ? (
                <>
                  <label className="product-checkbox">
                    <input
                      type="checkbox"
                      required
                      checked={checked}
                      onChange={(e) => setChecked(e.target.checked)}
                    />
                    Ik heb inhoud, doelgroep, beschikbaarheid en de relevante
                    productie-uitrol gecontroleerd.
                  </label>
                  <label className="product-checkbox">
                    <input
                      type="checkbox"
                      checked={inform}
                      onChange={(e) => setInform(e.target.checked)}
                    />
                    Doelgroep informeren via een melding in de app
                  </label>
                </>
              ) : (
                <p>
                  {action === "announce"
                    ? "Deze actie informeert uitsluitend bevoegd management van gekoppelde ideeën waarvoor de ontwikkeling zichtbaar en als beschikbaar in productie geregistreerd is."
                    : "Een roadmappublicatie verandert geen voortgang en verstuurt geen meldingsronde."}
                </p>
              )}
            </>
          )}
          <Feedback error={command.error} />
        </div>
        <footer className="wizard-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={close}
            disabled={command.busy}
          >
            Annuleren
          </button>
          <button
            className="primary-button"
            disabled={
              command.busy ||
              (kind === "release" && action !== "archive" && !checked)
            }
          >
            {command.busy ? "Verwerken…" : "Bevestigen"}
          </button>
        </footer>
      </form>
    </ProductDialog>
  );
}
export function ProductPreview({
  workspace,
  section,
  id,
  options,
  close,
}: {
  workspace: ProductWorkspace;
  section: ProductSection;
  id: string;
  options: ProductOptions;
  close: () => void;
}) {
  const [tenant, setTenant] = useState(options.tenants[0]?.id ?? ""),
    [group, setGroup] = useState("backoffice"),
    [result, setResult] = useState<ProductItem | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function preview() {
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const r = await fetch(
        `/api/product?${new URLSearchParams({ workspace, section, id, preview: "true", tenantId: tenant, group })}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      if (!r.ok) throw new Error();
      const d = await r.json();
      setResult(
        d.item
          ? (section === "roadmap" ? roadmapSchema : releaseSchema).parse(
              d.item,
            )
          : null,
      );
      if (d.noRecipient)
        setError(
          "Deze organisatie heeft nog geen actieve ontvanger met toegang in dit portaal.",
        );
    } catch {
      setError(
        "Voorbeeld niet beschikbaar. Controleer je toegang en ontvanger.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <ProductDialog
      title="Voorbeeld als ontvanger"
      description="Alleen-lezen. Dit toont de opgeslagen inhoud met dezelfde doelgroepselectie als het portaal. Een concept wordt uitsluitend hier als publicatie gesimuleerd."
      close={close}
    >
      <div className="wo-dialog-body product-body">
        <label>
          Organisatie
          <select
            value={tenant}
            onChange={(e) => {
              setTenant(e.target.value);
              setResult(null);
            }}
          >
            <option value="">Kies een organisatie</option>
            {options.tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Doelgroep
          <select
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setResult(null);
            }}
          >
            <option value="backoffice">Management</option>
            <option value="staff">Personeel</option>
            <option value="customer">Klanten</option>
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={busy || !tenant}
          onClick={() => void preview()}
        >
          Voorbeeld tonen
        </button>
        <Feedback error={error} />
        {result ? (
          <section className="product-preview">
            <h3>{result.title}</h3>
            {"changes" in result ? (
              <>
                <p>{result.intro}</p>
                {result.changes.map((c) => (
                  <article key={c.id}>
                    <h4>{c.title}</h4>
                    <p>{c.body}</p>
                    <Availability value={c.availability} />
                    <ProductFiles files={c.files} workspace={workspace} />
                  </article>
                ))}
              </>
            ) : (
              <>
                <p>{"summary" in result ? result.summary : ""}</p>
                <p>{"body" in result ? result.body : ""}</p>
                {"progress" in result && (
                  <p>
                    {progressLabels[result.progress]}
                    {result.planning ? ` · Indicatie: ${result.planning}` : ""}
                  </p>
                )}
                {"availability" in result && (
                  <Availability value={result.availability} />
                )}
              </>
            )}
          </section>
        ) : (
          <p>
            Geen toegestane inhoud in dit voorbeeld. Sla editorwijzigingen op
            vóór de controle.
          </p>
        )}
      </div>
    </ProductDialog>
  );
}

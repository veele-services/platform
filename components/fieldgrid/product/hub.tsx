"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Eye, RefreshCw, Columns3, List, Search } from "lucide-react";
import { PageHeading } from "../page-heading";
import { ContentTabs } from "../content-tabs";
import { EmptyState } from "../empty-state";
import { ActionIcon } from "../action-icon";
import { ListPagination } from "../list-pagination";
import { CompactFilterMenu } from "../compact-filter-menu";
import { ProductEditor } from "./editors";
import { ProductDetail, PublicationDialog, ProductPreview } from "./details";
import {
  productListSchema,
  ideaSchema,
  roadmapSchema,
  releaseSchema,
  ideaLabels,
  progressLabels,
  publicationLabels,
  type ProductActorSnapshot,
  type ProductItem,
  type ProductList,
  type ProductSection,
  type ProductRelease,
  type ReleaseChange,
  type RoadmapItem,
  type ProductIdea,
} from "@/lib/product/model";
import "./product.css";
export type EditorRequest = {
  kind: ProductSection | "change" | "convert";
  item?: ProductItem | ReleaseChange;
  release?: ProductRelease;
};
type Modal =
  | {
      type: "detail";
      section: ProductSection;
      item: ProductItem;
    }
  | {
      type: "editor";
      request: EditorRequest;
    }
  | {
      type: "publish";
      section: ProductSection;
      item: ProductItem;
      action: "publish" | "announce" | "archive";
    }
  | {
      type: "preview";
      section: ProductSection;
      id: string;
    };
const empty: ProductList = { items: [], total: 0, page: 1, pageSize: 25 };
async function request(url: string) {
  const r = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  });
  if (!r.ok)
    throw new Error(
      r.status === 403 ? "denied" : r.status === 404 ? "missing" : "failed",
    );
  return r.json();
}
export function ProductHub({
  snapshot,
  initialSelection,
}: {
  snapshot: ProductActorSnapshot;
  initialSelection?: {
    section: ProductSection;
    id: string;
  };
}) {
  const admin = snapshot.access.canManage,
    management = snapshot.workspace === "backoffice";
  const tabs = admin
    ? [
        ["ideas", "Ideeën"],
        ["roadmap", "Roadmap"],
        ["releases", "Releases"],
      ]
    : management
      ? [
          ["releases", "Nieuw"],
          ["development", "In ontwikkeling"],
          ["planned", "Gepland"],
          ["ideas", "Onze ideeën"],
        ]
      : [
          ["releases", "Updates"],
          ["roadmap", "Roadmap"],
        ];
  const [tab, setTab] = useState<string>(
    initialSelection?.section === "roadmap" && management
      ? "planned"
      : (initialSelection?.section ?? (admin ? "ideas" : "releases")),
  );
  const section: ProductSection =
    tab === "ideas" ? "ideas" : tab === "releases" ? "releases" : "roadmap";
  const [lists, setLists] = useState(snapshot.initial),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [category, setCategory] = useState(""),
    [publication, setPublication] = useState(""),
    [priority, setPriority] = useState(""),
    [scope, setScope] = useState(""),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(25),
    [board, setBoard] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [denied, setDenied] = useState(false),
    [modal, setModal] = useState<Modal | null>(null),
    [success, setSuccess] = useState("");
  const modalRef = useRef(modal),
    serial = useRef(0),
    openedInitial = useRef(false),
    accessEpoch = useRef(0),
    modalEpoch = useRef(0);
  const showModal = useCallback((next: Modal | null) => {
    ++modalEpoch.current;
    modalRef.current = next;
    setModal(next);
  }, []);
  useEffect(() => {
    modalRef.current = modal;
  }, [modal]);
  useEffect(
    () => () => {
      ++serial.current;
      ++accessEpoch.current;
      ++modalEpoch.current;
    },
    [],
  );
  const parameters = new URLSearchParams({
    workspace: snapshot.workspace,
    section,
    search,
    status,
    category,
    publication: admin ? publication : "",
    priority: admin ? priority : "",
    scope: admin ? scope : "",
    phase:
      tab === "planned"
        ? "planned"
        : tab === "development"
          ? "development"
          : "",
    page: String(page),
    pageSize: String(pageSize),
  }).toString();
  const clearPrivate = useCallback(() => {
    ++accessEpoch.current;
    setDenied(true);
    setLists({ ideas: null, roadmap: empty, releases: empty });
    showModal(null);
  }, [showModal]);
  const openDetail = useCallback(
    async (kind: ProductSection, id: string) => {
      const epoch = accessEpoch.current,
        token = ++modalEpoch.current;
      try {
        const raw = await request(
            `/api/product?${new URLSearchParams({ workspace: snapshot.workspace, section: kind, id })}`,
          ),
          value = (
            kind === "ideas"
              ? ideaSchema
              : kind === "roadmap"
                ? roadmapSchema
                : releaseSchema
          ).parse(raw);
        if (epoch !== accessEpoch.current || token !== modalEpoch.current)
          return;
        showModal({ type: "detail", section: kind, item: value });
      } catch (e) {
        if (epoch !== accessEpoch.current || token !== modalEpoch.current)
          return;
        if (e instanceof Error && e.message === "denied") clearPrivate();
        else {
          showModal(null);
          setError(
            "Deze informatie is niet meer beschikbaar. Vernieuw het overzicht.",
          );
        }
      }
    },
    [snapshot.workspace, clearPrivate, showModal],
  );
  const refresh = useCallback(async () => {
    const seq = ++serial.current;
    setBusy(true);
    try {
      const raw = await request(`/api/product?${parameters}`);
      if (seq !== serial.current) return;
      const result = productListSchema.parse(raw);
      setLists((previous) => ({ ...previous, [section]: result }));
      setError("");
      const current = modalRef.current;
      if (current?.type === "detail") {
        const rawDetail = await request(
          `/api/product?${new URLSearchParams({ workspace: snapshot.workspace, section: current.section, id: current.item.id })}`,
        );
        if (seq !== serial.current) return;
        const item = (
          current.section === "ideas"
            ? ideaSchema
            : current.section === "roadmap"
              ? roadmapSchema
              : releaseSchema
        ).parse(rawDetail);
        setModal((previous) =>
          previous?.type === "detail" && previous.item.id === item.id
            ? { ...previous, item }
            : previous,
        );
      }
    } catch (e) {
      if (seq !== serial.current) return;
      if (e instanceof Error && e.message === "denied") clearPrivate();
      else if (e instanceof Error && e.message === "missing") {
        showModal(null);
        setError("Deze publicatie is niet meer beschikbaar.");
      } else
        setError("Gegevens konden niet worden vernieuwd. Probeer opnieuw.");
    } finally {
      if (seq === serial.current) setBusy(false);
    }
  }, [parameters, section, snapshot.workspace, clearPrivate, showModal]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 250);
    return () => {
      clearTimeout(timer);
    };
  }, [refresh]);
  useEffect(() => {
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    document.addEventListener("visibilitychange", focus);
    const timer = setInterval(focus, 20000);
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      document.removeEventListener("visibilitychange", focus);
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (initialSelection && !openedInitial.current) {
      openedInitial.current = true;
      void openDetail(initialSelection.section, initialSelection.id);
    }
  }, [initialSelection, openDetail]);
  async function saved(kind: ProductSection, id: string) {
    showModal(null);
    const token = modalEpoch.current;
    setSuccess("Opgeslagen.");
    await refresh();
    if (token === modalEpoch.current) await openDetail(kind, id);
  }
  const list = lists[section] ?? empty;
  const filters = (
    <div className="product-filter-grid">
      {section !== "releases" && (
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Alle statussen</option>
            {Object.entries(section === "ideas" ? ideaLabels : progressLabels)
              .filter(([key]) =>
                admin
                  ? key !== "received"
                  : key !== "draft" && key !== "rejected",
              )
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {key === "draft" && section === "ideas"
                    ? "Nieuwe inzendingen (Concept)"
                    : label}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        Categorie
        <input
          value={category}
          maxLength={80}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        />
      </label>
      {admin && section !== "ideas" && (
        <>
          <label>
            Publicatie
            <select
              value={publication}
              onChange={(e) => {
                setPublication(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Alle publicaties</option>
              {Object.entries(publicationLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tenantbereik
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Alle doelgroepen</option>
              <option value="internal">Alleen intern</option>
              <option value="all">Alle tenants</option>
              <option value="selected">Geselecteerde tenants</option>
            </select>
          </label>
          {section === "roadmap" && (
            <label>
              Prioriteit
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Alle prioriteiten</option>
                <option value="low">Laag</option>
                <option value="normal">Normaal</option>
                <option value="high">Hoog</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          )}
        </>
      )}
    </div>
  );
  if (denied)
    return (
      <section className="panel">
        <EmptyState
          title="Je toegang is gewijzigd"
          description="De actuele informatie is niet beschikbaar. Open je organisatie opnieuw of neem contact op met je beheerder."
        />
      </section>
    );
  const body = (
    <>
      <section
        className="panel resource-table-panel product-panel"
        aria-label={tabs.find(([id]) => id === tab)?.[1]}
        aria-busy={busy}
      >
        {board && section === "roadmap" && admin ? (
          <div className="product-board">
            {Object.entries(progressLabels).map(([progress, label]) => (
              <section key={progress} className="product-column">
                <h2>{label}</h2>
                {list.items
                  .filter((r) => "progress" in r && r.progress === progress)
                  .map((r) => (
                    <button
                      className="product-board-card"
                      key={r.id}
                      onClick={() => void openDetail("roadmap", r.id)}
                    >
                      <strong>{r.title}</strong>
                      <small>{"summary" in r ? r.summary : ""}</small>
                      <span className="resource-status">
                        {"publication" in r
                          ? publicationLabels[r.publication!]
                          : ""}
                      </span>
                    </button>
                  ))}
                {!list.items.some(
                  (r) => "progress" in r && r.progress === progress,
                ) && <p>Geen items op deze pagina.</p>}
              </section>
            ))}
          </div>
        ) : (
          <ProductTable
            section={section}
            list={list}
            admin={admin}
            open={(id) => void openDetail(section, id)}
          />
        )}
        {!list.items.length && (
          <EmptyState
            title={
              section === "ideas"
                ? "Nog geen ideeën"
                : section === "roadmap"
                  ? "Nog geen ontwikkelingen"
                  : "Nog geen updates"
            }
            description={
              section === "ideas"
                ? "Gebruik de knop bovenaan om een idee voor jouw organisatie in te dienen."
                : "Gepubliceerde informatie voor jouw doelgroep verschijnt hier. Pas eventueel de filters aan."
            }
          />
        )}
      </section>
      <ListPagination
        total={list.total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        noun={
          section === "ideas"
            ? "ideeën"
            : section === "roadmap"
              ? "ontwikkelingen"
              : "updates"
        }
        busy={busy}
        preferenceKey={`product:${snapshot.actorKey}:${section}`}
      />
    </>
  );
  return (
    <div className="product-hub">
      <PageHeading
        eyebrow={admin ? "PLATFORMBEHEER" : "FIELDGRID ONTWIKKELING"}
        title={
          admin
            ? "Productbeheer"
            : management
              ? "Roadmap & updates"
              : "Wat is er nieuw?"
        }
        help="Voortgang, publicatie en beschikbaarheid zijn afzonderlijk. Een planning is indicatief. Je ziet uitsluitend informatie voor je huidige organisatie en portaal."
        actions={
          <>
            <label className="product-search">
              <Search aria-hidden="true" size={16} />
              <span className="sr-only">Productinformatie zoeken</span>
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Zoek in dit overzicht…"
                maxLength={160}
              />
            </label>
            <CompactFilterMenu
              activeCount={
                [status, category, publication, priority, scope].filter(Boolean)
                  .length
              }
            >
              {filters}
            </CompactFilterMenu>
            <ActionIcon
              label="Vernieuwen"
              icon={<RefreshCw />}
              disabled={busy}
              onClick={() => void refresh()}
            />
            {admin && section === "roadmap" && (
              <ActionIcon
                label={board ? "Lijstweergave" : "Bordweergave"}
                icon={board ? <List /> : <Columns3 />}
                onClick={() => setBoard((v) => !v)}
              />
            )}{" "}
            {admin && section !== "ideas" ? (
              <ActionIcon
                className="primary-button"
                label={
                  section === "roadmap"
                    ? "Nieuwe ontwikkeling"
                    : "Nieuwe release"
                }
                icon={<Plus />}
                onClick={() =>
                  showModal({ type: "editor", request: { kind: section } })
                }
              />
            ) : (
              snapshot.access.canSubmit && (
                <button
                  className="primary-button"
                  onClick={() =>
                    showModal({ type: "editor", request: { kind: "ideas" } })
                  }
                >
                  <Plus size={16} />
                  Idee indienen
                </button>
              )
            )}
          </>
        }
      />
      {error && (
        <p className="product-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="sr-only" role="status">
          {success}
        </p>
      )}
      <ContentTabs
        label="Productonderdelen"
        value={tab}
        onValueChange={(next) => {
          setTab(next);
          setPage(1);
          setStatus("");
          setPublication("");
          setPriority("");
          setScope("");
        }}
        tabs={tabs.map(([id, title]) => ({
          id,
          title,
          content: id === tab ? body : null,
        }))}
      />
      {modal?.type === "editor" && (
        <ProductEditor
          key={`${modal.request.kind}:${modal.request.item?.id ?? "new"}`}
          workspace={snapshot.workspace}
          options={snapshot.options}
          {...modal.request}
          close={() => showModal(null)}
          saved={saved}
        />
      )}
      {modal?.type === "detail" && (
        <ProductDetail
          section={modal.section}
          item={modal.item}
          snapshot={snapshot}
          close={() => showModal(null)}
          edit={(request) => showModal({ type: "editor", request })}
          refresh={refresh}
          publish={(action) =>
            showModal({
              type: "publish",
              section: modal.section,
              item: modal.item,
              action,
            })
          }
          preview={() =>
            showModal({
              type: "preview",
              section: modal.section,
              id: modal.item.id,
            })
          }
        />
      )}
      {modal?.type === "publish" && (
        <PublicationDialog
          {...modal}
          workspace={snapshot.workspace}
          options={snapshot.options}
          close={() => showModal(null)}
          changed={() => saved(modal.section, modal.item.id)}
        />
      )}
      {modal?.type === "preview" && (
        <ProductPreview
          {...modal}
          workspace={snapshot.workspace}
          options={snapshot.options}
          close={() => showModal(null)}
        />
      )}
    </div>
  );
}
function ProductTable({
  section,
  list,
  admin,
  open,
}: {
  section: ProductSection;
  list: ProductList;
  admin: boolean;
  open: (id: string) => void;
}) {
  const headers =
    section === "ideas"
      ? [
          "Idee",
          "Onderdeel",
          "Status",
          ...(admin ? ["Organisatie"] : []),
          "Bijgewerkt",
          "Acties",
        ]
      : section === "roadmap"
        ? [
            "Ontwikkeling",
            "Onderdeel",
            "Voortgang",
            "Indicatie",
            ...(admin ? ["Publicatie"] : []),
            "Acties",
          ]
        : [
            "Release",
            "Gepubliceerd",
            "Wijzigingen",
            ...(admin ? ["Publicatie"] : []),
            "Acties",
          ];
  return (
    <div className="table-scroll">
      <table className="resource-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.items.map((row) => (
            <tr key={row.id}>
              <td>
                <button
                  className="table-record-link"
                  onClick={() => open(row.id)}
                >
                  {row.title}
                </button>
                <small>
                  {"version" in row
                    ? row.version
                    : "summary" in row
                      ? row.summary.slice(0, 160)
                      : ""}
                </small>
              </td>
              {section === "ideas" ? (
                <IdeaCells idea={row as ProductIdea} admin={admin} />
              ) : section === "roadmap" ? (
                <RoadmapCells item={row as RoadmapItem} admin={admin} />
              ) : (
                <ReleaseCells item={row as ProductRelease} admin={admin} />
              )}
              <td>
                <div className="resource-actions">
                  <ActionIcon
                    label={`Bekijk ${row.title}`}
                    icon={<Eye size={15} />}
                    onClick={() => open(row.id)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function IdeaCells({ idea, admin }: { idea: ProductIdea; admin: boolean }) {
  return (
    <>
      <td>{idea.category}</td>
      <td>
        <span className="resource-status">{ideaLabels[idea.state]}</span>
      </td>
      {admin && <td>{idea.tenantName}</td>}
      <td>
        {new Intl.DateTimeFormat("nl-NL", {
          dateStyle: "medium",
          timeZone: "Europe/Amsterdam",
        }).format(new Date(idea.updatedAt))}
      </td>
    </>
  );
}
function RoadmapCells({ item, admin }: { item: RoadmapItem; admin: boolean }) {
  return (
    <>
      <td>{item.category}</td>
      <td>
        <span className="resource-status">{progressLabels[item.progress]}</span>
      </td>
      <td>{item.planning || "Nog geen indicatie"}</td>
      {admin && <td>{publicationLabels[item.publication!]}</td>}
    </>
  );
}
function ReleaseCells({
  item,
  admin,
}: {
  item: ProductRelease;
  admin: boolean;
}) {
  return (
    <>
      <td>
        {item.publishedAt
          ? new Intl.DateTimeFormat("nl-NL", {
              dateStyle: "medium",
              timeZone: "Europe/Amsterdam",
            }).format(new Date(item.publishedAt))
          : "Nog niet gepubliceerd"}
      </td>
      <td>{item.changes.length}</td>
      {admin && <td>{publicationLabels[item.publication!]}</td>}
    </>
  );
}

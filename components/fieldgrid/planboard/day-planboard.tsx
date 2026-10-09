"use client";
import { cosmeticPlanningPreferences } from "@/lib/auth/browser-state";
import { useTravelDay, TravelBadge, TravelList, TravelDialog, VehicleIcon } from "../travel";
import { vehicles } from "@/lib/travel/model";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  SlidersHorizontal,
  Undo2,
  CalendarPlus,
  Eye,
  X,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  loadPlanboard,
  loadPlanboardOrder,
  savePlanning,
} from "@/app/app/planning/actions";
import type { TenantContext } from "@/lib/auth/context";
import { brandThemeStyle } from "@/lib/branding/palette";
import { createClient } from "@/lib/supabase/client";
import {
  assignmentInput,
  canPlan,
  executionStatuses,
  filterCount,
  initialProposal,
  planningViews,
  initialPlanningQuery,
  samePlanningQuery,
  type PlanboardData,
  type PlanningOrder,
  type PlanningQuery,
  type PlanningWarning,
  type Proposal,
} from "@/lib/planning/model";
import {
  clockLabel,
  localDateTime,
  visibleWindow,
  validDay,
} from "@/lib/planning/time";
import { PlanningDetail } from "./detail-panel";
import { canReleaseWorkOrder, WorkOrderReleaseDialog } from "../work-orders/release";
import { StatusLegend } from "./status-legend";
import { PageHeading } from "../page-heading";
import { EmptyState } from "../empty-state";
import { ActionIcon } from "../action-icon";
import { assignmentStatus, assignmentStatusStyle } from "@/lib/planning/assignment-status";
import {
  HEADER_HEIGHT,
  PERSONNEL_WIDTH,
  ROW_HEIGHT,
  useBoardDrag,
  type PlanningScopeChoice,
} from "./use-board-drag";

type Preferences = {
  from: string;
  to: string;
  zoom: "overview" | "wide" | "precise";
  height: number;
  collapsed: boolean;
  view: PlanningQuery["view"];
  search: string;
  status: string;
};
const defaults: Preferences = {
  from: "07:00",
  to: "19:00",
  zoom: "overview",
  height: 156,
  collapsed: false,
  view: "unassigned",
  search: "",
  status: "",
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const label = (value: string | null, tz: string) =>
  value ? localDateTime(value, tz).replace("T", " ") : "Nog niet ingepland";
function storedPreferences(key: string): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem(key) ?? "{}");
    return {
      ...defaults,
      ...Object.fromEntries(
        Object.entries(p).filter(([key]) => key in defaults),
      ),
      from: /^\d{2}:\d{2}$/.test(p.from) ? p.from : defaults.from,
      to: /^\d{2}:\d{2}$/.test(p.to) ? p.to : defaults.to,
      zoom: ["overview", "wide", "precise"].includes(p.zoom)
        ? p.zoom
        : "overview",
      height: Math.min(500, Math.max(148, Number(p.height) || 156)),
      collapsed: p.collapsed === true,
      view: p.view in planningViews ? p.view : "unassigned",
      search: "",
      status:
        typeof p.status === "string" && p.status in executionStatuses
          ? p.status
          : "",
    };
  } catch {
    return defaults;
  }
}

export function DayPlanboard({
  initial,
  userId,
  tenant,
  initialOrder,
}: {
  initial: PlanboardData;
  userId: string;
  tenant: TenantContext;
  initialOrder?: string;
}) {
  const [data, setData] = useState(initial);
  const [prefs, setPrefs] = useState(defaults);
  const [query, setQuery] = useState<PlanningQuery>(() => initialPlanningQuery(initial.day));
  const lastRequestedQuery = useRef(initialPlanningQuery(initial.day));
  const planKey = JSON.stringify(data.board.map(w=>[w.id,w.version,w.assignments.map(a=>[a.id,a.version,a.personnelId,a.start,a.end])]));
  const travel = useTravelDay(query.day, undefined, planKey, data.people.length > 0);
  const [travelSelection,setTravelSelection]=useState<{assignmentId?:string;personnelId?:string;mode?:string}|null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlanningOrder | null>(null);
  const [releasing, setReleasing] = useState<PlanningOrder | null>(null);
  const [scopeChoice, setScopeChoice] = useState<PlanningScopeChoice | null>(null);
  const scopeChoiceRef = useRef<PlanningScopeChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestNumber = useRef(0);
  const [confirmation, setConfirmation] = useState<{
    proposal: Proposal;
    warnings: PlanningWarning[];
    before: Pick<PlanningOrder, "start" | "end">;
  } | null>(null);
  const [lastError, setLastError] = useState<{
    message: string;
    proposal: Proposal;
    retry: boolean;
  } | null>(null);
  const [windowError, setWindowError] = useState("");
  const [windowRange, setWindowRange] = useState(() =>
    visibleWindow(initial.day, "07:00", "19:00", initial.timezone),
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [boardSize, setBoardSize] = useState({ width: 1000, height: 500 });
  const root = useRef<HTMLDivElement>(null),
    board = useRef<HTMLDivElement>(null),
    list = useRef<HTMLDivElement>(null);
  const storageKey = `fieldgrid:planboard:${tenant.id}:${userId}`;
  const theme = brandThemeStyle(tenant.primaryColor, tenant.accentColor);
  const queryRef = useRef(query);
  const selectedRef = useRef(selected);
  const confirmationRef = useRef(confirmation);
  const dragRef = useRef<() => boolean>(() => false);
  const deferredData = useRef<{ sequence: number; data: PlanboardData } | null>(
    null,
  );
  const loadedPreferences = useRef("");
  const resizeCleanup = useRef<() => void>(() => {});
  const detailTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => () => resizeCleanup.current(), []);
  useEffect(() => {
    queryRef.current = query;
    selectedRef.current = selected;
    confirmationRef.current = confirmation;
    scopeChoiceRef.current = scopeChoice;
  }, [query, selected, confirmation, scopeChoice]);
  const refresh = useCallback(async (q: PlanningQuery, quiet = false) => {
    lastRequestedQuery.current = q;
    const sequence = ++requestNumber.current;
    if (!quiet) setLoading(true);
    try {
      const fresh = await loadPlanboard(q);
      if (sequence === requestNumber.current) {
        if (busyRef.current || dragRef.current() || selectedRef.current || confirmationRef.current || scopeChoiceRef.current)
          deferredData.current = { sequence, data: fresh };
        else {
          setData(fresh);
          deferredData.current = null;
        }
        setMenu((id) =>
          id && fresh.board.some((w) => w.assignments.some((a) => a.id === id))
            ? id
            : null,
        );
        setLoadError("");
      }
    } catch {
      if (sequence === requestNumber.current)
        setLoadError(
          "Planning kon niet worden vernieuwd. Je laatste gegevens blijven zichtbaar.",
        );
    } finally {
      if (sequence === requestNumber.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (loadedPreferences.current === storageKey) return;
    const timer = setTimeout(() => {
      loadedPreferences.current = storageKey;
      const p = storedPreferences(storageKey);
      setPrefs(p);
      setQuery((q) => ({
        ...q,
        view: p.view,
        search: p.search,
        status: p.status,
      }));
      try {
        setWindowRange(
          visibleWindow(initial.day, p.from, p.to, initial.timezone),
        );
      } catch {
        setWindowError(
          "Het opgeslagen tijdvenster is niet geldig op deze dag. Pas Vanaf en Tot aan.",
        );
      }
      setHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey, initial.day, initial.timezone]);
  useEffect(() => {
    if (hydrated) {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(cosmeticPlanningPreferences({
            ...prefs,
            view: query.view,
            status: query.status,
          })),
        );
      } catch {
        /* The board remains usable when storage is unavailable. */
      }
    }
  }, [prefs, query.view, query.search, query.status, storageKey, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    // Cosmetic preferences do not invalidate the server-loaded day. The live
    // subscription still reconciles once connected, closing the snapshot race.
    if (samePlanningQuery(lastRequestedQuery.current, query)) return;
    const timer = setTimeout(() => refresh(query), 180);
    return () => clearTimeout(timer);
  }, [query, hydrated, refresh]);
  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setBoardSize({ width: r.width, height: r.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const open = useCallback((order: PlanningOrder) => {
    detailTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setMenu(null);
    setSelected(order);
    setLastError(null);
  }, []);
  const closeDetail = () => {
    setSelected(null);
    requestAnimationFrame(() => {
      if (detailTrigger.current?.isConnected)
        detailTrigger.current.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    if (initialOrder)
      loadPlanboardOrder(initialOrder)
        .then(setSelected)
        .catch(() => setLoadError("De gekozen werkbon is niet beschikbaar."));
  }, [initialOrder]);
  const save = useCallback(
    async (proposal: Proposal) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setLastError(null);
      try {
        const result = await savePlanning(proposal);
        if (!result.ok) {
          if (result.code === "confirmation") {
            setConfirmation({
              proposal: { ...proposal, ...result.proposed },
              warnings: result.warnings,
              before: result.before,
            });
          } else {
            setConfirmation(null);
            setLastError({
              message: result.error,
              proposal,
              retry: result.code !== "conflict",
            });
            if (result.code === "conflict") {
              await refresh(queryRef.current);
              setSelected(null);
            }
          }
        } else {
          setConfirmation(null);
          setSelected(null);
          toast.success(
            proposal.undoChange ? "Planning hersteld" : "Planning opgeslagen",
          );
          await refresh(queryRef.current);
        }
      } catch {
        setLastError({
          message:
            "Geen bevestiging ontvangen. Vernieuw of probeer dezelfde wijziging opnieuw; deze wordt niet dubbel opgeslagen.",
          proposal,
          retry: true,
        });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );
  const pxPerMinute = useMemo(() => {
    const fitting = Math.max(
      1.35,
      (boardSize.width - PERSONNEL_WIDTH) / windowRange.minutes,
    );
    return (
      fitting * (prefs.zoom === "wide" ? 1.7 : prefs.zoom === "precise" ? 3 : 1)
    );
  }, [boardSize.width, windowRange.minutes, prefs.zoom]);
  const drag = useBoardDrag({
    board,
    list,
    data,
    start: windowRange.start,
    pxPerMinute,
    onSave: save,
    onOpen: open,
    onChooseScope: setScopeChoice,
    onStart: () => {
      setFilterOpen(false);
      setMenu(null);
    },
  });
  useEffect(() => {
    dragRef.current = drag.isDragging;
  });
  useEffect(() => {
    const pending = deferredData.current;
    if (!busy && !selected && !confirmation && !scopeChoice && !drag.preview && pending) {
      deferredData.current = null;
      if (pending.sequence === requestNumber.current)
        queueMicrotask(() => setData(pending.data));
    }
  }, [busy, selected, confirmation, scopeChoice, drag.preview]);
  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleSnapshot = (delay = 180, force = false) => {
      if (!active || document.visibilityState !== "visible") return;
      if (refreshTimer && !force) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (active && document.visibilityState === "visible")
          void refresh(queryRef.current, true);
      }, delay);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`planboard-live-${tenant.id}-${userId}`, {
        config: { postgres_changes_options: { wait: true } },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "staff_workspace_revisions",
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => scheduleSnapshot(),
      );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") scheduleSnapshot(0, true);
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        scheduleSnapshot(0, true);
    });
    const update = () => scheduleSnapshot(0, true);
    const visibility = () => {
      if (document.visibilityState === "visible") scheduleSnapshot(0, true);
    };
    const interval = setInterval(update, 20000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", visibility);
      void supabase.removeChannel(channel);
    };
  }, [refresh, tenant.id, userId]);
  const setDay = (day: string) => {
    if (!validDay(day)) return;
    setQuery((q) => ({ ...q, day, page: 1 }));
    try {
      setWindowRange(visibleWindow(day, prefs.from, prefs.to, data.timezone));
      setWindowError("");
    } catch (cause) {
      setWindowRange(visibleWindow(day, "07:00", "19:00", data.timezone));
      setWindowError(
        cause instanceof Error ? cause.message : "Ongeldig tijdvenster.",
      );
    }
    const url = new URL(window.location.href);
    url.searchParams.set("day", day);
    url.searchParams.delete("order");
    window.history.pushState(null, "", url);
  };
  useEffect(() => {
    const back = () => {
      const day = new URL(location.href).searchParams.get("day") ?? initial.day;
      setQuery((q) => ({ ...q, day, page: 1 }));
      try {
        setWindowRange(
          visibleWindow(day, prefs.from, prefs.to, initial.timezone),
        );
      } catch {
        setWindowRange(visibleWindow(day, "07:00", "19:00", initial.timezone));
      }
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [initial.day, initial.timezone, prefs.from, prefs.to]);
  const changeWindow = (field: "from" | "to", value: string) => {
    const next = { ...prefs, [field]: value };
    setPrefs(next);
    try {
      setWindowRange(
        visibleWindow(query.day, next.from, next.to, data.timezone),
      );
      setWindowError("");
    } catch (cause) {
      setWindowError(
        cause instanceof Error
          ? cause.message
          : "Vul een geldig tijdvenster in.",
      );
    }
  };
  const dayStep = (amount: number) => {
    const date = new Date(`${query.day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    setDay(date.toISOString().slice(0, 10));
  };
  const clearFilters = () =>
    setQuery((q) => ({ ...q, search: "", status: "", page: 1 }));
  const undo = () => {
    if (data.undo)
      void save({
        orderId: data.undo.orderId,
        version: data.undo.version,
        mutationId: crypto.randomUUID(),
        start: null,
        end: null,
        assignments: [],
        confirmedWarnings: [],
        undoChange: data.undo.id,
      });
  };
  const resizeList = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    resizeCleanup.current();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startY = event.clientY,
      old = prefs.height;
    const move = (e: PointerEvent) =>
      setPrefs((p) => ({
        ...p,
        collapsed: false,
        height: Math.max(
          148,
          Math.min(
            500,
            (root.current?.clientHeight ?? 800) * 0.65,
            old + startY - e.clientY,
          ),
        ),
      }));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    resizeCleanup.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  const totalWidth = PERSONNEL_WIDTH + windowRange.minutes * pxPerMinute;
  const virtualStart =
    data.people.length > 80
      ? Math.max(0, Math.floor((scrollTop - HEADER_HEIGHT) / ROW_HEIGHT) - 4)
      : 0;
  const virtualEnd =
    data.people.length > 80
      ? Math.min(
          data.people.length,
          virtualStart + Math.ceil(boardSize.height / ROW_HEIGHT) + 9,
        )
      : data.people.length;
  const outside = data.board.filter(
    (w) =>
      w.assignments.length &&
      w.assignments.every(
        (a) =>
          Date.parse(a.end) <= Date.parse(windowRange.start) ||
          Date.parse(a.start) >= Date.parse(windowRange.end),
      ),
  ).length;
  const activeFilters = filterCount(query.search, query.status);
  const labelStep = pxPerMinute < 2 ? 60 : 30;
  const ticks = Array.from(
    { length: Math.ceil(windowRange.minutes / labelStep) + 1 },
    (_, i) => i * labelStep,
  ).filter((m) => m <= windowRange.minutes);
  const targetPreview = drag.preview;
  return (
    <div className="pb-root planboard-viewport" ref={root}>
      <PageHeading eyebrow="PLANNING" title="Planbord" titleAccessory={<StatusLegend/>} className="pb-page-heading" actions={<div className="pb-toolbar">
        <div className="pb-date">
          <button
            className="pb-icon"
            aria-label="Vorige dag"
            onClick={() => dayStep(-1)}
          >
            <ChevronLeft size={16} />
          </button>
          <label>
            Planningsdag
            <input
              type="date"
              value={query.day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <button
            className="pb-icon"
            aria-label="Volgende dag"
            onClick={() => dayStep(1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <label>
          Vanaf
          <input
            type="time"
            step="60"
            value={prefs.from}
            onChange={(e) => changeWindow("from", e.target.value)}
          />
        </label>
        <label>
          Tot
          <input
            type="time"
            step="60"
            value={prefs.to}
            onChange={(e) => changeWindow("to", e.target.value)}
          />
        </label>
        <label>
          Zoom
          <select
            value={prefs.zoom}
            onChange={(e) =>
              setPrefs((p) => ({
                ...p,
                zoom: e.target.value as Preferences["zoom"],
              }))
            }
          >
            <option value="overview">Overzicht</option>
            <option value="wide">Ruimer</option>
            <option value="precise">Precisie</option>
          </select>
        </label>
        <button
          className="secondary-button pb-undo"
          disabled={busy || !data.undo}
          onClick={undo}
        >
          <Undo2 size={16} />
          <span>Ongedaan maken</span>
        </button>
      </div>}/>
      {(windowError || loadError || lastError) && (
        <div className="pb-alert" role="alert">
          <span>{windowError || loadError || lastError?.message}</span>
          {loadError && (
            <button onClick={() => refresh(query)}>Opnieuw laden</button>
          )}
          {lastError?.retry && (
            <button disabled={busy} onClick={() => save(lastError.proposal)}>
              Opnieuw proberen
            </button>
          )}
        </div>
      )}
      <div className="pb-state" role="status">
        {busy
          ? "Planning opslaan…"
          : loading
            ? "Gegevens vernieuwen…"
            : `${data.people.length} medewerkers · ${outside ? `${outside} uitvoering(en) buiten het tijdvenster · ` : ""}${data.timezone}`}
      </div>
      <div
        className={`pb-board ${targetPreview ? "pb-dragging" : ""}`}
        ref={board}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        aria-label="Dagplanning"
        aria-busy={!hydrated || loading || busy || travel.loading}
        tabIndex={0}
      >
        <div
          className="pb-grid"
          style={
            {
              width: totalWidth,
              minHeight: "100%",
              "--pb-grid-step": `${30 * pxPerMinute}px`,
            } as CSSProperties
          }
        >
          <div className="pb-ruler">
            <span className="pb-avatar-head" />
            <strong>Medewerker</strong>
            <div>
              {ticks.map((minute) => (
                <time
                  key={minute}
                  style={{ left: minute * pxPerMinute }}
                  title={new Date(
                    Date.parse(windowRange.start) + minute * 60000,
                  ).toISOString()}
                >
                  {clockLabel(
                    new Date(
                      Date.parse(windowRange.start) + minute * 60000,
                    ).toISOString(),
                    data.timezone,
                  )}
                </time>
              ))}
            </div>
          </div>
          {virtualStart > 0 && (
            <div style={{ height: virtualStart * ROW_HEIGHT }} />
          )}
          {data.people.slice(virtualStart, virtualEnd).map((person) => {
            const availability = data.availability.filter(
                (a) => a.personnelId === person.id,
              ),
              hasHours = availability.some((a) => a.kind === "available");
            const assignments = data.board.flatMap((order) =>
              order.assignments
                .filter((a) => a.personnelId === person.id)
                .map((assignment) => ({ order, assignment })),
            );
            const previewAssignment = targetPreview?.proposal.assignments.find(
              (a) => a.personnelId === person.id,
            );
            return (
              <div
                className="pb-person-row"
                key={person.id}
                data-person-id={person.id}
              >
                <div className="pb-avatar-rail">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="pb-avatar"
                        title={person.name}
                        aria-label={`Personeel: ${person.name}`}
                      >
                        {initials(person.name)}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="pb-person-popover"
                      style={theme}
                      side="right"
                    >
                      <strong>{person.name}</strong>
                      <p>
                        {person.number} ·{" "}
                        {person.status === "active" ? "Actief" : "Niet actief"}
                      </p>
                      {tenant.enabledServices.includes("personeel") &&
                      tenant.roles.some((r) =>
                        ["tenant_admin", "management", "hr"].includes(r),
                      ) ? (
                        <Link
                          prefetch={false}
                          href={`/app/personeel/${person.id}?tab=inzet`}
                        >
                          Open Personeel 360
                        </Link>
                      ) : (
                        <p>
                          Operationele gegevens; het HR-dossier is afgeschermd.
                        </p>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="pb-person-name">
                  <strong>{person.name}</strong>
                  <button className="travel-day-button" onClick={()=>setTravelSelection({personnelId:person.id})}><VehicleIcon vehicle={travel.data?.people.find(p=>p.id===person.id)?.vehicle||null}/>{(()=>{const p=travel.data?.people.find(p=>p.id===person.id);return p?.vehicle?vehicles[p.vehicle]+(p.overridden?" · dagafwijking":""):"Vervoer kiezen";})()}</button>
                  <small>
                    {person.status !== "active"
                      ? "Niet actief"
                      : hasHours
                        ? "Werktijden vastgelegd"
                        : "Beschikbaarheid onbekend"}
                  </small>
                </div>
                <div className={`pb-lane ${hasHours ? "pb-has-hours" : ""}`}>
                  {travel.data?.legs.filter(l=>l.personnelId===person.id&&l.totalMinutes!==null).map(l=>{const end=l.direction==="after"?Date.parse(l.previousEnd!)+l.totalMinutes!*60000:Date.parse(l.plannedStart);const left=Math.max(0,(end-l.totalMinutes!*60000-Date.parse(windowRange.start))/60000*pxPerMinute);const right=Math.min(windowRange.minutes*pxPerMinute,(end-Date.parse(windowRange.start))/60000*pxPerMinute);return right>left?<button key={l.assignmentId+l.direction} className={`pb-travel-leg ${l.shortageMinutes?"conflict":""}`} data-travel-assignment={l.assignmentId} data-direction={l.direction} style={{left,width:right-left}} onClick={()=>setTravelSelection({assignmentId:l.assignmentId})} aria-label={`Reistijd ${l.totalMinutes} minuten${l.shortageMinutes?`, ${l.shortageMinutes} minuten tekort`:""}`}>{l.totalMinutes} min</button>:null;})}
                  {availability.map((a) => {
                    const left = Math.max(
                        0,
                        ((Date.parse(a.start) - Date.parse(windowRange.start)) /
                          60000) *
                          pxPerMinute,
                      ),
                      right = Math.min(
                        windowRange.minutes * pxPerMinute,
                        ((Date.parse(a.end) - Date.parse(windowRange.start)) /
                          60000) *
                          pxPerMinute,
                      );
                    return (
                      right > left && (
                        <div
                          key={a.id}
                          className={`pb-availability pb-${a.kind}`}
                          style={{ left, width: right - left }}
                          title={
                            a.kind === "available"
                              ? "Bekende werktijd"
                              : "Niet beschikbaar"
                          }
                        >
                          {a.kind === "unavailable" && (
                            <span>Niet beschikbaar</span>
                          )}
                        </div>
                      )
                    );
                  })}
                  {targetPreview?.order.windowStart &&
                    targetPreview.order.windowEnd &&
                    targetPreview.personnelId === person.id && (
                      <div
                        className="pb-window-preview"
                        style={{
                          left: Math.max(
                            0,
                            ((Date.parse(targetPreview.order.windowStart) -
                              Date.parse(windowRange.start)) /
                              60000) *
                              pxPerMinute,
                          ),
                          width:
                            (Math.max(
                              0,
                              Math.min(
                                Date.parse(targetPreview.order.windowEnd),
                                Date.parse(windowRange.end),
                              ) -
                                Math.max(
                                  Date.parse(targetPreview.order.windowStart),
                                  Date.parse(windowRange.start),
                                ),
                            ) /
                              60000) *
                            pxPerMinute,
                        }}
                      />
                    )}
                  {assignments.map(({ order, assignment }) => {
                    const rawLeft =
                        ((Date.parse(assignment.start) -
                          Date.parse(windowRange.start)) /
                          60000) *
                        pxPerMinute,
                      rawRight =
                        ((Date.parse(assignment.end) -
                          Date.parse(windowRange.start)) /
                          60000) *
                        pxPerMinute;
                    const left = Math.max(0, rawLeft),
                      right = Math.min(
                        windowRange.minutes * pxPerMinute,
                        rawRight,
                      );
                    if (right <= left) return null;
                    const hasTravelBefore = rawLeft > 0 && travel.data?.legs.some(leg => leg.assignmentId === assignment.id && leg.direction === "before" && leg.totalMinutes !== null && leg.totalMinutes > 0);
                    const hasTravelAfter = rawRight < windowRange.minutes * pxPerMinute && travel.data?.legs.some(leg => leg.assignmentId === assignment.id && leg.direction === "after" && leg.totalMinutes !== null && leg.totalMinutes > 0);
                    const attention = assignment.qualifications.length > 0;
                    const status = assignmentStatus(assignment.overrun ? "overrun" : assignment.status);
                    const editable = canPlan(order) && !busy;
                    return (
                      <div
                        key={assignment.id}
                        className={`pb-bon ${editable ? "" : "pb-bon-locked"} ${right - left < 80 ? "pb-bon-narrow" : ""}`}
                        style={{ ...assignmentStatusStyle(status), left, width: right - left }}
                        data-order-id={order.id}
                        data-assignment-id={assignment.id}
                        data-travel-before={Boolean(hasTravelBefore)}
                        data-travel-after={Boolean(hasTravelAfter)}
                        data-status={status.status}
                        role="button"
                        tabIndex={0}
                        aria-label={`${person.name} · ${order.number} · ${order.object} · ${clockLabel(assignment.start, data.timezone)} tot ${clockLabel(assignment.end, data.timezone)} · ${status.label}${attention ? " · Kwalificatie controleren" : ""}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            open(order);
                          }
                        }}
                        onPointerDown={(e) => {
                          if (editable) drag.begin(e, order, assignment);
                        }}
                        onClick={(e) => {
                          if (!editable || e.detail === 0) open(order);
                        }}
                        title={`${person.name} · ${order.number} · ${order.object} · ${status.label}${attention ? " · Kwalificatie controleren" : ""}`}
                      >
                        <div className="pb-bon-text">
                          <strong>
                            {rawLeft < 0 ? "‹ " : ""}
                            {clockLabel(assignment.start, data.timezone)}–
                            {clockLabel(assignment.end, data.timezone)}
                            {rawRight > windowRange.minutes * pxPerMinute
                              ? " ›"
                              : ""}
                          </strong>
                          <span>{order.object}</span>
                          <TravelBadge leg={travel.data?.legs.find(l=>l.assignmentId===assignment.id&&l.direction==="before")}/>
                          <small>
                            {attention && <AlertTriangle size={11} aria-hidden="true" />}
                            {status.label}
                            {attention && " · Vereiste controleren"}
                          </small>
                        </div>
                        <Popover
                          open={menu === assignment.id}
                          onOpenChange={(value) =>
                            setMenu(value ? assignment.id : null)
                          }
                        >
                          <PopoverTrigger asChild>
                            <button
                              data-no-drag
                              className="pb-bon-menu"
                              aria-label={`Acties voor werkbon ${order.number}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal size={13} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="pb-action-menu"
                            data-no-drag
                            onPointerDown={event => event.stopPropagation()}
                            onClick={event => event.stopPropagation()}
                            onKeyDown={event => event.stopPropagation()}
                            style={theme}
                            align="end"
                            sideOffset={6}
                          >
                            <button onClick={() => open(order)}>
                              Bekijk werkbon
                            </button>
                            {canReleaseWorkOrder(tenant, order, order.assignments) && <button disabled={busy} onClick={() => { setMenu(null); setReleasing(order); }}>Werkbon vrijgeven</button>}
                            <button onClick={()=>{setMenu(null);setTravelSelection({assignmentId:assignment.id});}}>Bekijk reistijd</button>
                            <button onClick={()=>{setMenu(null);setTravelSelection({assignmentId:assignment.id,mode:"route"});}}>Bekijk route</button>
                            <button onClick={()=>{setMenu(null);setTravelSelection({assignmentId:assignment.id,mode:"manual"});}}>Handmatige reistijd</button>
                            <button
                              disabled={!editable}
                              onClick={() => open(order)}
                            >
                              Tijd en medewerker(s) aanpassen
                            </button>
                            <Link
                              prefetch={false}
                              href={`/app/klanten?record=${order.customerId}`}
                            >
                              Open Klant 360
                            </Link>
                            <Link
                              prefetch={false}
                              href={`/app/objecten?record=${order.objectId}`}
                            >
                              Open Object 360
                            </Link>
                            <button
                              disabled={!editable}
                              onClick={() => {
                                setMenu(null);
                                void save({
                                  ...initialProposal(order),
                                  assignments: order.assignments
                                    .filter((a) => a.id !== assignment.id)
                                    .map(assignmentInput),
                                });
                              }}
                            >
                              Uit planning halen
                            </button>
                          </PopoverContent>
                        </Popover>
                        {editable &&
                          right - left > 80 &&
                          rawRight <= windowRange.minutes * pxPerMinute && (
                            <button
                              data-no-drag
                              className="pb-resize"
                              aria-label={`Eindtijd aanpassen voor ${order.number}`}
                              onPointerDown={(e) =>
                                drag.begin(e, order, assignment, true)
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                if (e.detail === 0) open(order);
                              }}
                            />
                          )}
                      </div>
                    );
                  })}
                  {targetPreview && previewAssignment && (
                    <div
                      className={`pb-drag-preview ${targetPreview.error ? "invalid" : ""}`}
                      style={{
                        left: Math.max(
                          0,
                          ((Date.parse(previewAssignment.start) -
                            Date.parse(windowRange.start)) /
                            60000) *
                            pxPerMinute,
                        ),
                        width: Math.max(
                          1,
                          ((Date.parse(previewAssignment.end) -
                            Math.max(
                              Date.parse(previewAssignment.start),
                              Date.parse(windowRange.start),
                            )) /
                            60000) *
                            pxPerMinute,
                        ),
                      }}
                    >
                      <strong>
                        {clockLabel(previewAssignment.start, data.timezone)}–
                        {clockLabel(previewAssignment.end, data.timezone)}
                      </strong>
                      <span>
                        {targetPreview.error ?? "Loslaten om te plannen"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {virtualEnd < data.people.length && (
            <div
              style={{ height: (data.people.length - virtualEnd) * ROW_HEIGHT }}
            />
          )}
          {!data.people.length && (
            <div className="pb-empty-people">
              <EmptyState title="Nog geen medewerkers" description="Voeg medewerkers toe voordat je personeel inplant.">
              <Link prefetch={false} href="/app/personeel">
                Naar personeel
              </Link>
              </EmptyState>
            </div>
          )}
        </div>
      </div>
      <div
        role="separator"
        aria-label="Hoogte bonnenlijst"
        aria-orientation="horizontal"
        aria-valuemin={148}
        aria-valuemax={500}
        aria-valuenow={Math.round(prefs.height)}
        tabIndex={0}
        className="pb-separator"
        onPointerDown={resizeList}
        onKeyDown={(e) => {
          if (["ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            setPrefs((p) => ({
              ...p,
              collapsed: false,
              height: Math.max(
                148,
                Math.min(500, p.height + (e.key === "ArrowUp" ? 24 : -24)),
              ),
            }));
          }
        }}
      >
        <span />
      </div>
      <section
        className={`pb-list ${prefs.collapsed ? "collapsed" : ""}`}
        ref={list}
        style={{ height: prefs.collapsed ? 52 : data.orders.length ? prefs.height : Math.max(220, prefs.height) }}
        aria-label={`Bonnen voor ${query.day} en nog ongedateerde uitvoeringen`}
      >
        <header className="pb-list-toolbar">
          <label>
            <span className="sr-only">Bonnenweergave</span>
            <select
              value={query.view}
              onChange={(e) =>
                setQuery((q) => ({
                  ...q,
                  view: e.target.value as PlanningQuery["view"],
                  page: 1,
                }))
              }
            >
              {Object.entries(planningViews).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <span className="pb-count" aria-live="polite">
            {data.total} {data.total === 1 ? "bon" : "bonnen"}
          </span>
          <div className="pb-list-controls">
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <button
                  className="compact-filter-trigger pb-filter-button"
                  aria-label={activeFilters > 0 ? `Zoeken en filteren, ${activeFilters} actief` : "Zoeken en filteren"}
                  title="Zoeken en filteren"
                >
                  <SlidersHorizontal size={18} />
                  {activeFilters > 0 && <span aria-hidden="true">{activeFilters}</span>}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="pb-filter-popover"
                style={theme}
                align="end"
                side="top"
              >
                <h2>Zoeken & filteren</h2>
                <label>
                  Zoeken
                  <input
                    value={query.search}
                    maxLength={200}
                    placeholder="Bonnummer, klant of object"
                    onChange={(e) =>
                      setQuery((q) => ({
                        ...q,
                        search: e.target.value,
                        page: 1,
                      }))
                    }
                  />
                </label>
                <label>
                  Uitvoeringsstatus
                  <select
                    value={query.status}
                    onChange={(e) =>
                      setQuery((q) => ({
                        ...q,
                        status: e.target.value,
                        page: 1,
                      }))
                    }
                  >
                    <option value="">Alle statussen</option>
                    {Object.entries(executionStatuses).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <button className="secondary-button" onClick={clearFilters}>
                    Wis filters
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => setFilterOpen(false)}
                  >
                    Toon {data.total} {data.total === 1 ? "bon" : "bonnen"}
                  </button>
                </div>
              </PopoverContent>
            </Popover>
            <button
              className="pb-icon"
              aria-label={
                prefs.collapsed
                  ? "Bonnenlijst uitklappen"
                  : "Bonnenlijst inklappen"
              }
              onClick={() =>
                setPrefs((p) => ({ ...p, collapsed: !p.collapsed }))
              }
            >
              {prefs.collapsed ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
            </button>
          </div>
        </header>
        {!prefs.collapsed && (
          <>
            <div className="pb-list-scroll" data-empty={!data.orders.length}>
              <table>
                <thead>
                  <tr>
                    <th aria-label="Slepen" />
                    <th>Bonnummer</th>
                    <th>Klant / object</th>
                    <th>Datum</th>
                    <th>Klantvenster</th>
                    <th>Duur</th>
                    <th>Status / bezetting</th>
                    <th>Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <button
                          className="pb-list-grip"
                          aria-label={`Sleep ${order.number}`}
                          disabled={
                            busy || !canPlan(order) || !order.durationMinutes
                          }
                          title={
                            order.durationMinutes
                              ? "Sleep naar een medewerker"
                              : "Vul eerst de uitvoeringsduur in via Plan"
                          }
                          onPointerDown={(e) => drag.begin(e, order)}
                        >
                          <GripVertical size={16} />
                        </button>
                      </td>
                      <td>
                        <strong>{order.number}</strong>
                      </td>
                      <td>
                        <strong>{order.object}</strong>
                        <small>{order.customer}</small>
                      </td>
                      <td>
                        {order.start
                          ? localDateTime(order.start, data.timezone).slice(
                              0,
                              10,
                            )
                          : (order.requestedDate ?? "Nog geen datum")}
                      </td>
                      <td>
                        {order.windowStart && order.windowEnd
                          ? `${clockLabel(order.windowStart, data.timezone)}–${clockLabel(order.windowEnd, data.timezone)}`
                          : "Niet vastgelegd"}
                        <small>
                          {
                            {
                              arrival: "Aankomst",
                              execution: "Volledige uitvoering",
                              unknown: "Type onbekend",
                            }[order.windowKind]
                          }
                        </small>
                      </td>
                      <td>
                        {order.durationMinutes
                          ? `${order.durationMinutes} min`
                          : "Nog invullen"}
                      </td>
                      <td>
                        <span
                          className={`pb-status pb-status-${order.category}`}
                        >
                          {executionStatuses[order.status]}
                        </span>
                        {order.assignments.length < order.requiredPersonnel && (
                          <small>
                            {order.requiredPersonnel - order.assignments.length}{" "}
                            medewerker(s) ontbreken
                          </small>
                        )}
                      </td>
                      <td>
                        <ActionIcon
                          label={canPlan(order) ? "Plan" : "Bekijk"}
                          icon={canPlan(order) ? <CalendarPlus size={16}/> : <Eye size={16}/>}
                          onClick={() => open(order)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.orders.length && (
                <div className="pb-list-empty">
                  <EmptyState title={activeFilters ? "Geen werkbonnen gevonden" : "Nog geen werkbonnen"} description={activeFilters ? "Pas je zoekopdracht of filters aan om andere werkbonnen te bekijken." : "Werkbonnen voor de gekozen dag verschijnen hier zodra ze beschikbaar zijn."}>
                    {activeFilters ? (
                      <button onClick={clearFilters}>Wis filters</button>
                    ) : null}
                  </EmptyState>
                </div>
              )}
            </div>
            {data.total > 50 && (
              <footer className="pb-pagination">
                <button
                  disabled={query.page <= 1}
                  onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
                >
                  Vorige
                </button>
                <span>
                  Pagina {query.page} / {Math.ceil(data.total / 50)}
                </span>
                <button
                  disabled={query.page * 50 >= data.total}
                  onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
                >
                  Volgende
                </button>
              </footer>
            )}
          </>
        )}
      </section>
      {travelSelection&&<TravelDialog travel={travel} {...travelSelection} day={query.day} theme={theme} onClose={()=>setTravelSelection(null)} onSaved={()=>{travel.refresh();void refresh(query);}}/>}
      {selected && (
        <PlanningDetail
          key={`${selected.id}:${selected.version}`}
          travel={<>{travel.error&&<p role="alert">{travel.error}</p>}<TravelList legs={travel.data?.legs.filter(l=>l.workOrderId===selected.id)||[]} people={travel.data?.people} timezone={data.timezone} canManage={travel.data?.canManage||false} onChange={travel.refresh}/></>}
          order={selected}
          onRelease={canReleaseWorkOrder(tenant, selected, selected.assignments) ? () => { setSelected(null); setReleasing(selected); } : undefined}
          people={data.people}
          timezone={data.timezone}
          day={query.day}
          busy={busy}
          theme={theme}
          saveError={lastError?.message}
          onRetry={
            lastError?.retry ? () => save(lastError.proposal) : undefined
          }
          onClose={closeDetail}
          onSave={save}
        />
      )}
      {releasing && <WorkOrderReleaseDialog order={releasing} tenant={tenant} onClose={() => setReleasing(null)} onSaved={() => { setReleasing(null); void refresh(queryRef.current); }}/>}
      <Dialog.Root
        open={Boolean(confirmation)}
        onOpenChange={(value) => {
          if (!value && !busy) setConfirmation(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="pb-confirm-overlay" />
          <Dialog.Content
            className="pb-confirm"
            style={theme}
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
          >
            <Dialog.Title>
              <AlertTriangle size={20} /> Controleer de afwijking
            </Dialog.Title>
            <Dialog.Description>
              De bestaande planning blijft behouden totdat je bevestigt.
            </Dialog.Description>
            {confirmation && (
              <>
                <div className="pb-comparison">
                  <p>
                    <strong>Was:</strong>{" "}
                    {label(confirmation.before?.start ?? null, data.timezone)} –{" "}
                    {confirmation.before?.end
                      ? clockLabel(confirmation.before.end, data.timezone)
                      : "—"}
                  </p>
                  <p>
                    <strong>Wordt:</strong>{" "}
                    {label(confirmation.proposal.start, data.timezone)} –{" "}
                    {confirmation.proposal.end
                      ? clockLabel(confirmation.proposal.end, data.timezone)
                      : "—"}
                  </p>
                  <p>
                    {confirmation.proposal.assignments
                      .map(
                        (a) =>
                          data.people.find((p) => p.id === a.personnelId)
                            ?.name ?? "Medewerker",
                      )
                      .join(", ") || "Geen personeelstoewijzingen"}
                  </p>
                </div>
                <ul>
                  {confirmation.warnings.map((w) => (
                    <li key={w.key}>{w.message}</li>
                  ))}
                </ul>
                <div className="pb-form-actions">
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setConfirmation(null)}
                  >
                    Herstel
                  </button>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      save({
                        ...confirmation.proposal,
                        confirmedWarnings: confirmation.warnings.map(
                          (w) => w.key,
                        ),
                      })
                    }
                  >
                    {busy ? "Opslaan…" : "Plan toch"}
                  </button>
                </div>
              </>
            )}
            <Dialog.Close
              className="pb-close"
              disabled={busy}
              aria-label="Bevestiging sluiten"
            >
              <X size={18} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={Boolean(scopeChoice)} onOpenChange={open => { if (!open) setScopeChoice(null); }}>
        <Dialog.Portal><Dialog.Overlay className="pb-confirm-overlay"/><Dialog.Content className="pb-confirm" style={theme}>
          <Dialog.Title>Welke inzet wil je wijzigen?</Dialog.Title>
          <Dialog.Description>Deze werkbon heeft meerdere medewerkers. Kies voor wie de nieuwe tijd geldt.</Dialog.Description>
          {scopeChoice && <><div className="pb-comparison"><p><strong>{scopeChoice.order.number}</strong> · {scopeChoice.order.object}</p><p>Geselecteerd: {data.people.find(p => p.id === scopeChoice.personnelId)?.name ?? "Medewerker"}</p><p>Nieuwe inzet: {label(scopeChoice.single.assignments.find(a => a.personnelId === scopeChoice.personnelId)?.start ?? null, data.timezone)} – {label(scopeChoice.single.assignments.find(a => a.personnelId === scopeChoice.personnelId)?.end ?? null, data.timezone)}</p></div><div className="pb-form-actions"><button className="secondary-button" onClick={() => setScopeChoice(null)}>Annuleren</button><button className="secondary-button" onClick={() => { const proposal = scopeChoice.whole; setScopeChoice(null); void save(proposal); }}>Het hele bezoek</button><button className="primary-button" onClick={() => { const proposal = scopeChoice.single; setScopeChoice(null); void save(proposal); }}>Alleen deze inzet</button></div></>}
          <Dialog.Close className="pb-close" aria-label="Keuze sluiten"><X size={18}/></Dialog.Close>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

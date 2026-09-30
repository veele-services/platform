"use client";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  assignmentInput,
  canPlan,
  clientProblems,
  initialProposal,
  pointerMinute,
  shiftedProposal,
  type PlanboardData,
  type PlanningOrder,
  type Proposal,
  type Crew,
} from "@/lib/planning/model";

export const PERSONNEL_WIDTH = 230,
  ROW_HEIGHT = 96,
  HEADER_HEIGHT = 40;
type Drag = {
  captureElement: Element;
  order: PlanningOrder;
  assignment?: Crew;
  resize: boolean;
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  grab: number;
  active: boolean;
  proposal?: Proposal;
  singleProposal?: Proposal;
  error?: string;
  targetId?: string;
  list: boolean;
};
export type DragPreview = {
  proposal: Proposal;
  personnelId: string;
  error: string | null;
  order: PlanningOrder;
};
export type PlanningScopeChoice = { order: PlanningOrder; personnelId: string; single: Proposal; whole: Proposal };
export function useBoardDrag({
  board,
  list,
  data,
  start,
  pxPerMinute,
  onSave,
  onOpen,
  onStart,
  onChooseScope,
}: {
  board: RefObject<HTMLDivElement | null>;
  list: RefObject<HTMLDivElement | null>;
  data: PlanboardData;
  start: string;
  pxPerMinute: number;
  onSave: (proposal: Proposal) => void;
  onOpen: (order: PlanningOrder) => void;
  onStart: () => void;
  onChooseScope: (choice: PlanningScopeChoice) => void;
}) {
  const state = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const callbacks = useRef({
    data,
    start,
    pxPerMinute,
    onSave,
    onOpen,
    onStart,
    onChooseScope,
  });
  useEffect(() => {
    callbacks.current = { data, start, pxPerMinute, onSave, onOpen, onStart, onChooseScope };
  }, [data, start, pxPerMinute, onSave, onOpen, onStart, onChooseScope]);
  useEffect(() => {
    let frame = 0;
    const calculate = () => {
      const drag = state.current,
        el = board.current;
      if (!drag || !el || !drag.active) return;
      const props = callbacks.current,
        r = el.getBoundingClientRect();
      const lr = list.current?.getBoundingClientRect();
      drag.list = Boolean(
        lr &&
        drag.x >= lr.left &&
        drag.x <= lr.right &&
        drag.y >= lr.top &&
        drag.y <= lr.bottom,
      );
      const index = Math.floor(
          (drag.y - r.top - el.clientTop + el.scrollTop - HEADER_HEIGHT) /
            ROW_HEIGHT,
        ),
        person = props.data.people[index];
      drag.error = undefined;
      drag.singleProposal = undefined;
      if (drag.list && drag.assignment) {
        drag.proposal = {
          ...initialProposal(drag.order),
          assignments: drag.order.assignments
            .filter((a) => a.id !== drag.assignment!.id)
            .map(assignmentInput),
        };
        drag.targetId = drag.assignment.personnelId;
      } else if (
        !person ||
        drag.y < r.top + HEADER_HEIGHT ||
        drag.y > r.bottom ||
        drag.x < r.left ||
        drag.x > r.right
      ) {
        drag.proposal = undefined;
        setPreview(null);
        return;
      } else {
        drag.targetId = person.id;
        const minute = pointerMinute(
          drag.x,
          r.left + el.clientLeft,
          el.scrollLeft,
          PERSONNEL_WIDTH,
          props.pxPerMinute,
          drag.resize ? 0 : drag.grab,
        );
        const desired = new Date(
          Date.parse(props.start) + minute * 60000,
        ).toISOString();
        if (drag.resize) {
          drag.proposal = {
            ...initialProposal(drag.order),
            end: desired,
            assignments: drag.order.assignments.map((a) => ({
              personnelId: a.personnelId,
              start: a.start,
              end: desired,
            })),
          };
          if (drag.assignment && drag.order.assignments.length > 1) {
            const assignments = drag.order.assignments.map(a => ({ ...assignmentInput(a), end: a.id === drag.assignment!.id ? desired : a.end }));
            drag.singleProposal = { ...initialProposal(drag.order), start: assignments.reduce((v, a) => a.start < v ? a.start : v, assignments[0].start), end: assignments.reduce((v, a) => a.end > v ? a.end : v, assignments[0].end), assignments };
          }
          if (
            !drag.order.start ||
            Date.parse(desired) <= Date.parse(drag.order.start)
          )
            drag.error = "Eindtijd moet na begintijd liggen.";
        } else if (
          drag.assignment &&
          person.id !== drag.assignment.personnelId
        ) {
          drag.proposal = {
            ...initialProposal(drag.order),
            assignments: drag.order.assignments.map((a) => ({
              ...assignmentInput(a),
              personnelId:
                a.id === drag.assignment!.id ? person.id : a.personnelId,
            })),
          };
          if (drag.order.assignments.some((a) => a.personnelId === person.id))
            drag.error = "Deze medewerker is al toegewezen.";
        } else if (drag.assignment) {
          const delta = Date.parse(desired) - Date.parse(drag.assignment.start);
          drag.proposal = shiftedProposal(
            drag.order,
            new Date(Date.parse(drag.order.start!) + delta).toISOString(),
          );
          if (drag.order.assignments.length > 1) {
            const assignments = drag.order.assignments.map(a => a.id === drag.assignment!.id ? { personnelId: a.personnelId, start: desired, end: new Date(Date.parse(a.end) + delta).toISOString() } : assignmentInput(a));
            drag.singleProposal = { ...initialProposal(drag.order), start: assignments.reduce((v, a) => a.start < v ? a.start : v, assignments[0].start), end: assignments.reduce((v, a) => a.end > v ? a.end : v, assignments[0].end), assignments };
          }
        } else {
          const s =
            drag.order.assignments.length && drag.order.start
              ? drag.order.start
              : desired;
          const e =
            drag.order.assignments.length && drag.order.end
              ? drag.order.end
              : new Date(
                  Date.parse(s) + drag.order.durationMinutes! * 60000,
                ).toISOString();
          drag.proposal = {
            ...initialProposal(drag.order),
            start: s,
            end: e,
            assignments: [
              ...drag.order.assignments.map(assignmentInput),
              { personnelId: person.id, start: s, end: e },
            ],
          };
          if (drag.order.assignments.some((a) => a.personnelId === person.id))
            drag.error = "Deze medewerker is al toegewezen.";
        }
        if (person.status !== "active")
          drag.error = "Deze medewerker is niet actief.";
      }
      if (drag.proposal) {
        drag.error = drag.error || clientProblems(drag.proposal, props.data)[0];
        setPreview({
          proposal: drag.proposal,
          personnelId: drag.targetId!,
          error: drag.error ?? null,
          order: drag.order,
        });
      }
    };
    const tick = () => {
      const drag = state.current,
        el = board.current;
      if (drag?.active && el && !drag.list) {
        const r = el.getBoundingClientRect();
        if (drag.y >= r.top && drag.y <= r.bottom) {
          const x = drag.x < r.left + 85 ? -12 : drag.x > r.right - 35 ? 12 : 0;
          const y = drag.y < r.top + 70 ? -8 : drag.y > r.bottom - 30 ? 8 : 0;
          if (x || y) {
            el.scrollLeft += x;
            el.scrollTop += y;
            calculate();
          }
        }
      }
      if (state.current) frame = requestAnimationFrame(tick);
    };
    const move = (event: PointerEvent) => {
      const drag = state.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (
        !drag.active &&
        Math.hypot(drag.x - drag.originX, drag.y - drag.originY) > 7
      ) {
        drag.active = true;
        callbacks.current.onStart();
        frame = requestAnimationFrame(tick);
      }
      if (drag.active) {
        event.preventDefault();
        calculate();
      }
    };
    const stop = (event?: PointerEvent) => {
      const drag = state.current;
      if (!drag || (event && event.pointerId !== drag.pointerId)) return;
      state.current = null;
      if (drag.captureElement.hasPointerCapture(drag.pointerId))
        drag.captureElement.releasePointerCapture(drag.pointerId);
      cancelAnimationFrame(frame);
      setPreview(null);
      if (!drag.active) callbacks.current.onOpen(drag.order);
      else if (drag.proposal && drag.singleProposal && drag.assignment) {
        callbacks.current.onChooseScope({ order: drag.order, personnelId: drag.assignment.personnelId, single: drag.singleProposal, whole: drag.proposal });
      } else if (drag.proposal && !drag.error) callbacks.current.onSave(drag.proposal);
    };
    const cancel = () => {
      const drag = state.current;
      if (drag?.captureElement.hasPointerCapture(drag.pointerId))
        drag.captureElement.releasePointerCapture(drag.pointerId);
      state.current = null;
      cancelAnimationFrame(frame);
      setPreview(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state.current) {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      state.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [board, list]);
  const begin = (
    event: ReactPointerEvent,
    order: PlanningOrder,
    assignment?: Crew,
    resize = false,
  ) => {
    if (
      event.button !== 0 ||
      !canPlan(order) ||
      !order.durationMinutes ||
      order.durationMinutes <= 0
    )
      return;
    if (!resize && (event.target as HTMLElement).closest("[data-no-drag]"))
      return;
    if (
      resize &&
      order.assignments.some(
        (a) => a.start !== order.start || a.end !== order.end,
      )
    ) {
      onOpen(order);
      return;
    }
    const el = board.current;
    if (!el) return;
    if (event.currentTarget instanceof HTMLElement)
      event.currentTarget.focus({ preventScroll: true });
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const r = el.getBoundingClientRect();
    const logicalLeft = assignment
      ? ((Date.parse(assignment.start) - Date.parse(start)) / 60000) *
        pxPerMinute
      : 0;
    state.current = {
      captureElement: event.currentTarget,
      order,
      assignment,
      resize,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      grab:
        assignment && !resize
          ? event.clientX -
            (r.left +
              el.clientLeft +
              PERSONNEL_WIDTH +
              logicalLeft -
              el.scrollLeft)
          : 0,
      active: false,
      list: false,
    };
  };
  return { begin, preview, isDragging: () => Boolean(state.current?.active) };
}

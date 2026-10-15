"use client";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export function confirmDiscard() {
  const forms = [...document.querySelectorAll<HTMLElement>('[data-unsaved="true"]')];
  if (!forms.length) return true;
  if (!window.confirm("Je wijzigingen zijn nog niet opgeslagen. Wil je ze niet opslaan en doorgaan?")) return false;
  forms.forEach(form => { form.dataset.unsaved = "false"; });
  return true;
}
export function useFormChanges() {
  const ref = useRef<HTMLFormElement>(null);
  useDraftLeaveEvents(ref);
  return { ref, changed: () => { if (ref.current) ref.current.dataset.unsaved = "true"; }, saved: () => { if (ref.current) ref.current.dataset.unsaved = "false"; } };
}

/** Controlled settings and permission drafts share the native navigation
 * boundary. Their button tabs keep mounted panels and therefore keep drafts. */
export function useUnsavedDraft<T extends HTMLElement>(dirty: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => { if (ref.current) ref.current.dataset.unsaved = String(dirty); }, [dirty]);
  useDraftLeaveEvents(ref, true);
  return ref;
}

function useDraftLeaveEvents(ref: RefObject<HTMLElement | null>, retainedPanels = false) {
  useEffect(() => {
    const clearAccountDraft = () => { if (ref.current) ref.current.dataset.unsaved = 'false'; };
    const before = (event: BeforeUnloadEvent) => { if (ref.current?.dataset.unsaved === "true") event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || ref.current?.dataset.unsaved !== "true" || !(event.target instanceof Element)) return;
      const target = event.target.closest('a[href], [role="tab"], [data-discard-form]');
      if (!target || retainedPanels && target.matches('button[role="tab"]')) return;
      if (target instanceof HTMLAnchorElement) {
        if (target.hasAttribute('download') || target.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const url = new URL(target.href, location.href), current = new URL(location.href);
        if (url.origin === current.origin && url.pathname === current.pathname && url.search === current.search) return;
      }
      if ((retainedPanels || !ref.current.contains(target)) && !confirmDiscard()) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", before); document.addEventListener("click", navigate, true); window.addEventListener('notifications-account-cleared', clearAccountDraft);
    return () => { window.removeEventListener("beforeunload", before); document.removeEventListener("click", navigate, true); window.removeEventListener('notifications-account-cleared', clearAccountDraft); };
  }, [ref, retainedPanels]);
}

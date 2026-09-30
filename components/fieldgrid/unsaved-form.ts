"use client";
import { useEffect, useRef } from "react";

export function confirmDiscard() {
  const forms = [...document.querySelectorAll<HTMLFormElement>('form[data-unsaved="true"]')];
  if (!forms.length) return true;
  if (!window.confirm("Je wijzigingen zijn nog niet opgeslagen. Wil je ze niet opslaan en doorgaan?")) return false;
  forms.forEach(form => { form.dataset.unsaved = "false"; });
  return true;
}
export function useFormChanges() {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => { if (ref.current?.dataset.unsaved === "true") event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      if (ref.current?.dataset.unsaved !== "true" || !(event.target instanceof Element)) return;
      const target = event.target.closest('a[href], [role="tab"], [data-discard-form]');
      if (target && !ref.current.contains(target) && !confirmDiscard()) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", before); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", before); document.removeEventListener("click", navigate, true); };
  }, []);
  return { ref, changed: () => { if (ref.current) ref.current.dataset.unsaved = "true"; }, saved: () => { if (ref.current) ref.current.dataset.unsaved = "false"; } };
}

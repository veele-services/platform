"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Search, Tags } from "lucide-react";
import type { KnowledgebaseSearchSuggestion } from "@workspace/db";

type KnowledgebaseAutocompleteSearchProps = {
  defaultValue?: string | null;
  endpoint?: string;
  placeholder?: string;
  submitLabel?: string;
};

function suggestionLabel(type: KnowledgebaseSearchSuggestion["type"]) {
  if (type === "article") return "Artikel";
  if (type === "category") return "Categorie";
  return "Zoekterm";
}

export function KnowledgebaseAutocompleteSearch({
  defaultValue,
  endpoint = "/api/help/search-suggestions",
  placeholder = "Zoeken...",
  submitLabel = "Zoek",
}: KnowledgebaseAutocompleteSearchProps) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLFormElement | null>(null);
  const [query, setQuery] = useState(defaultValue ?? "");
  const [suggestions, setSuggestions] = useState<KnowledgebaseSearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const trimmedQuery = query.trim();

  const visibleSuggestions = useMemo(() => suggestions.slice(0, 10), [suggestions]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (!trimmedQuery) {
        setSuggestions([]);
        setOpen(false);
        return;
      }

      try {
        const response = await fetch(`${endpoint}?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Suggestions failed");
        const data = await response.json() as { suggestions?: KnowledgebaseSearchSuggestion[] };
        setSuggestions(data.suggestions ?? []);
        setOpen(true);
        setActiveIndex(-1);
      } catch (error) {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setOpen(false);
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [endpoint, trimmedQuery]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function selectSuggestion(suggestion: KnowledgebaseSearchSuggestion) {
    setQuery(suggestion.value);
    setOpen(false);
    router.push(suggestion.href ?? `/help?q=${encodeURIComponent(suggestion.value)}`);
  }

  return (
    <form ref={rootRef} className="relative flex gap-2" action="/help">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => visibleSuggestions.length > 0 && setOpen(true)}
          onKeyDown={(event) => {
            if (!open || visibleSuggestions.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, visibleSuggestions.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              selectSuggestion(visibleSuggestions[activeIndex]);
            }
            if (event.key === "Escape") setOpen(false);
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          className="h-11 w-full rounded-xl border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-cyan-100"
          style={{ borderColor: "var(--color-border)" }}
        />
        {open && visibleSuggestions.length > 0 && (
          <div id={listId} role="listbox" className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-2xl border bg-white shadow-xl" style={{ borderColor: "var(--color-border)" }}>
            {visibleSuggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.value}-${suggestion.href ?? ""}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectSuggestion(suggestion)}
                className={`flex min-h-12 w-full items-start gap-3 px-3 py-2 text-left text-sm transition ${activeIndex === index ? "bg-cyan-50" : "bg-white"}`}
              >
                {suggestion.type === "article" ? <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: "var(--color-accent)" }} /> : <Tags className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />}
                <span className="min-w-0">
                  <span className="block truncate font-black" style={{ color: "var(--color-primary)" }}>{suggestion.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {suggestionLabel(suggestion.type)}
                    {suggestion.description ? ` - ${suggestion.description}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="submit" className="rounded-xl px-4 text-sm font-black text-white" style={{ backgroundColor: "var(--color-accent)" }}>
        {submitLabel}
      </button>
    </form>
  );
}

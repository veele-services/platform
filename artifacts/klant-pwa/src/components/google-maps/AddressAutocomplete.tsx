"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { GooglePlaceAddress, GooglePlacesSuggestion } from "@workspace/db/google-places";

export type AddressAutocompleteSelection = {
  suggestion: GooglePlacesSuggestion;
  place: GooglePlaceAddress;
};

type AddressAutocompleteProps = {
  label?: string;
  description?: string;
  placeholder?: string;
  endpointBase?: string;
  limit?: number;
  onSelect: (selection: AddressAutocompleteSelection) => void;
};

function createPlacesSessionToken(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function AddressAutocomplete({
  label = "Adres zoeken",
  description = "Zoek via Google Places of vul de adresvelden handmatig in.",
  placeholder = "Typ minimaal 3 tekens...",
  endpointBase = "/klant/api/google-maps/places",
  limit = 6,
  onSelect,
}: AddressAutocompleteProps) {
  const inputId = useId();
  const listId = `${inputId}-list`;
  const blurTimer = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [sessionToken, setSessionToken] = useState(createPlacesSessionToken);
  const [suggestions, setSuggestions] = useState<GooglePlacesSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    setActiveIndex(-1);
    setError(null);

    if (trimmed.length < 3) {
      setSuggestions([]);
      setLoading(false);
      setHasSearched(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`${endpointBase}/autocomplete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: trimmed, sessionToken, limit }),
          signal: controller.signal,
        });
        if (!response.ok) {
          setSuggestions([]);
          setError("Adres zoeken is tijdelijk niet beschikbaar. Handmatig invullen kan altijd.");
          return;
        }
        const payload = (await response.json()) as { suggestions?: GooglePlacesSuggestion[] };
        setSuggestions(payload.suggestions ?? []);
        setHasSearched(true);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setSuggestions([]);
          setHasSearched(true);
          setError("Adres zoeken is tijdelijk niet beschikbaar. Handmatig invullen kan altijd.");
        }
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [endpointBase, limit, query, sessionToken]);

  async function selectSuggestion(suggestion: GooglePlacesSuggestion) {
    if (!suggestion.placeId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${endpointBase}/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: suggestion.placeId, sessionToken }),
      });
      if (!response.ok) {
        setError("Adresdetails konden niet worden opgehaald. Handmatig invullen kan altijd.");
        return;
      }
      const payload = (await response.json()) as { place?: GooglePlaceAddress };
      if (!payload.place) {
        setError("Adresdetails konden niet worden opgehaald. Handmatig invullen kan altijd.");
        return;
      }
      onSelect({ suggestion, place: payload.place });
      setQuery(payload.place.formattedAddress ?? suggestion.label);
      setSuggestions([]);
      setHasSearched(false);
      setSessionToken(createPlacesSessionToken());
    } catch {
      setError("Adresdetails konden niet worden opgehaald. Handmatig invullen kan altijd.");
    } finally {
      setLoading(false);
    }
  }

  function onBlur() {
    blurTimer.current = window.setTimeout(() => {
      setSuggestions([]);
      setActiveIndex(-1);
      setHasSearched(false);
      if (query.trim().length > 0) setSessionToken(createPlacesSessionToken());
    }, 150);
  }

  function onFocus() {
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      void selectSuggestion(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setSuggestions([]);
      setActiveIndex(-1);
      setHasSearched(false);
      setSessionToken(createPlacesSessionToken());
    }
  }

  const showPanel = query.trim().length >= 3 && (loading || Boolean(error) || suggestions.length > 0 || hasSearched);

  return (
    <div className="relative">
      <label htmlFor={inputId} className="block space-y-1.5">
        <span className="text-xs font-black uppercase tracking-[0.04em]" style={{ color: "var(--color-secondary)" }}>
          {label}
        </span>
        {description ? <span className="block text-xs font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>{description}</span> : null}
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onFocus={onFocus}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-[#00B7B3] focus:ring-4 focus:ring-[#00B7B3]/10"
          style={{ color: "var(--color-primary)" }}
        />
      </label>
      {showPanel ? (
        <div id={listId} role="listbox" className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[80] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {error ? (
            <div className="px-4 py-3 text-sm font-semibold text-amber-700">{error}</div>
          ) : suggestions.length > 0 ? (
            <div className="max-h-64 overflow-y-auto p-1">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  className={`block w-full rounded-xl px-4 py-3 text-left text-sm ${activeIndex === index ? "bg-[#E8FBFA]" : "hover:bg-slate-50"}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => { void selectSuggestion(suggestion); }}
                >
                  <span className="block font-black" style={{ color: "var(--color-primary)" }}>{suggestion.mainText ?? suggestion.label}</span>
                  <span className="text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>{suggestion.secondaryText ?? "Google Places"}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>Geen adressen gevonden. Vul het adres handmatig in.</div>
          )}
        </div>
      ) : null}
      {loading ? <p className="mt-2 text-xs font-semibold text-[#00B7B3]">Adres zoeken...</p> : null}
      <p className="mt-2 text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>Geen passend resultaat? Vul de velden hieronder handmatig in.</p>
    </div>
  );
}

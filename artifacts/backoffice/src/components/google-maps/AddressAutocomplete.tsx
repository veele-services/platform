"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import type { GooglePlaceAddress, GooglePlacesSuggestion } from "@workspace/db/google-places";
import { Input } from "@/components/ui/input";
import { backofficePath } from "@/lib/backoffice-paths";

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
  disabled?: boolean;
  className?: string;
  onSelect: (selection: AddressAutocompleteSelection) => void;
};

function createPlacesSessionToken(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function AddressAutocomplete({
  label = "Adres zoeken",
  description = "Zoek via Google Places of vul de adresvelden handmatig in.",
  placeholder = "Typ minimaal 3 tekens...",
  endpointBase = "/backoffice-api/google-maps/places",
  limit = 6,
  disabled = false,
  className,
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
        const response = await fetch(`${backofficePath(endpointBase)}/autocomplete`, {
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
      const response = await fetch(`${backofficePath(endpointBase)}/details`, {
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
    <div className={className}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-900">{label}</label>
      {description ? <p className="mb-2 text-xs text-slate-500">{description}</p> : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          id={inputId}
          type="search"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onFocus={onFocus}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          placeholder={placeholder}
          className="pl-9"
        />
        {loading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-teal-600" /> : null}
        {showPanel ? (
          <div id={listId} role="listbox" className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[80] overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
            {error ? (
              <div className="px-3 py-3 text-sm text-amber-700">{error}</div>
            ) : suggestions.length > 0 ? (
              <div className="max-h-56 overflow-y-auto p-1">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.id}
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    className={`flex w-full gap-2 rounded px-3 py-2 text-left text-sm ${activeIndex === index ? "bg-teal-50" : "hover:bg-slate-50"}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => { void selectSuggestion(suggestion); }}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                    <span>
                      <span className="block font-medium text-slate-950">{suggestion.mainText ?? suggestion.label}</span>
                      <span className="text-xs text-slate-500">{suggestion.secondaryText ?? "Google Places"}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-3 text-sm text-slate-500">Geen adressen gevonden. Vul het adres handmatig in.</div>
            )}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-slate-500">Geen passend resultaat? Gebruik de handmatige velden hieronder.</p>
    </div>
  );
}

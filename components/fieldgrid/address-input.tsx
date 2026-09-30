"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, Search } from "lucide-react";
import {
  addressStatus,
  changeAddress,
  normalizeAddress,
  type Address,
} from "@/lib/addresses/model";

export function AddressInput({
  initial,
  name = "addressPayload",
  required = false,
  legacyFields = false,
  onChange,
}: {
  initial?: unknown;
  name?: string;
  required?: boolean;
  legacyFields?: boolean;
  onChange?: (address: Address) => void;
}) {
  const [value, setValue] = useState(() => normalizeAddress(initial)),
    [mode, setMode] = useState("free"),
    [query, setQuery] = useState(""),
    [postcode, setPostcode] = useState(""),
    [number, setNumber] = useState(""),
    [addition, setAddition] = useState("");
  const [options, setOptions] = useState<Array<{ id: string; label: string }>>(
      [],
    ),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0 });
  const anchor = useRef<HTMLDivElement>(null),
    serial = useRef(0),
    abort = useRef<AbortController | null>(null),
    id = useId();
  const term =
    mode === "free"
      ? query
      : [postcode, number, addition].filter(Boolean).join(" ");
  const change = (a: Address) => {
    setValue(a);
    const form = anchor.current?.closest("form");
    if (form) form.dataset.unsaved = "true";
    onChange?.(a);
  };
  useEffect(() => {
    const seq = ++serial.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    if (term.trim().length < 3) {
      const timer = setTimeout(() => {
        setOptions([]);
        setOpen(false);
        setBusy(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(async () => {
      setBusy(true);
      setMessage("");
      try {
        const r = await fetch("/api/addresses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: term }),
          signal: controller.signal,
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (seq !== serial.current) return;
        setOptions(d.suggestions);
        setActive(-1);
        setOpen(true);
        if (!d.suggestions.length)
          setMessage(
            "Geen adres gevonden. Controleer de invoer of vul handmatig in.",
          );
      } catch {
        if (seq === serial.current && !controller.signal.aborted)
          setMessage(
            "Zoeken tijdelijk niet beschikbaar. Handmatig invoeren blijft mogelijk.",
          );
      } finally {
        if (seq === serial.current) setBusy(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (r)
        setPosition({
          left: Math.max(8, r.left),
          top: r.bottom + 6,
          width: Math.min(r.width, innerWidth - 16),
        });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const outside = (e: PointerEvent) => {
      if (
        !anchor.current?.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest?.(`[data-address-list="${id}"]`)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, id]);
  async function select(key: string) {
    const seq = ++serial.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setOpen(false);
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: key }),
        signal: controller.signal,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (seq === serial.current) {
        change(d.address);
        setMessage(
          "Adres geselecteerd. Controleer of dit het juiste adres is; dit is geen bewijs van woonplaats of eigendom.",
        );
      }
    } catch {
      if (seq === serial.current && !controller.signal.aborted)
        setMessage(
          "Selecteren is niet gelukt. Probeer opnieuw of voer handmatig in.",
        );
    } finally {
      if (seq === serial.current) setBusy(false);
    }
  }
  function edit(field: keyof Address, text: string) {
    ++serial.current;
    abort.current?.abort();
    setBusy(false);
    setOpen(false);
    change(changeAddress(value, { [field]: text }));
  }
  const keyboard = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((n) =>
        Math.max(
          0,
          Math.min(options.length - 1, n + (e.key === "ArrowDown" ? 1 : -1)),
        ),
      );
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (options[active]) void select(options[active].id);
    } else if (e.key === "Escape") setOpen(false);
  };
  return (
    <div className="address-input wide">
      <input type="hidden" name={name} value={JSON.stringify(value)} />
      {legacyFields && (
        <>
          <input type="hidden" name="street" value={value.street} />
          <input type="hidden" name="postalCode" value={value.postal_code} />
          <input type="hidden" name="city" value={value.city} />
        </>
      )}
      <div className="address-search" ref={anchor}>
        <label>
          Adres zoeken
          <select
            aria-label="Zoekmethode"
            value={mode}
            onChange={(e) => {
              ++serial.current;
              setOpen(false);
              setMode(e.target.value);
            }}
          >
            <option value="free">Vrij zoeken</option>
            <option value="postcode">Postcode en huisnummer</option>
          </select>
        </label>
        {mode === "free" ? (
          <label className="wide">
            <Search size={15} />
            Zoek een adres
            <input
              value={query}
              onChange={(e) => {
                ++serial.current;
                setQuery(e.target.value);
              }}
              onKeyDown={keyboard}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={id}
              aria-activedescendant={
                active >= 0 ? `${id}-${active}` : undefined
              }
              placeholder="Straat, huisnummer of plaats…"
              autoComplete="off"
            />
          </label>
        ) : (
          <div className="address-fields">
            <label>
              Zoekpostcode
              <input
                value={postcode}
                onChange={(e) => {
                  ++serial.current;
                  setPostcode(e.target.value);
                }}
                placeholder="1234 AB"
                autoComplete="off"
                onKeyDown={keyboard}
                role="combobox"
                aria-expanded={open}
                aria-controls={id}
              />
            </label>
            <label>
              Zoekhuisnummer
              <input
                value={number}
                onChange={(e) => {
                  ++serial.current;
                  setNumber(e.target.value);
                }}
                inputMode="numeric"
                onKeyDown={keyboard}
                role="combobox"
                aria-expanded={open}
                aria-controls={id}
              />
            </label>
            <label>
              Zoektoevoeging
              <input
                value={addition}
                onChange={(e) => {
                  ++serial.current;
                  setAddition(e.target.value);
                }}
                onKeyDown={keyboard}
                role="combobox"
                aria-expanded={open}
                aria-controls={id}
                aria-autocomplete="list"
                aria-activedescendant={
                  active >= 0 ? `${id}-${active}` : undefined
                }
              />
            </label>
          </div>
        )}
      </div>
      <p className="address-feedback" role="status">
        {busy ? "Adresgegevens ophalen…" : message}
      </p>
      <div className="address-fields">
        {(
          [
            ["street_name", "Straatnaam"],
            ["house_number", "Huisnummer"],
            ["house_letter", "Huisletter"],
            ["house_addition", "Toevoeging"],
            ["postal_code", "Postcode"],
            ["city", "Woonplaats"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              value={value[key]}
              required={
                required &&
                ["street_name", "house_number", "postal_code", "city"].includes(
                  key,
                ) &&
                (key !== "house_number" || value.source !== "legacy")
              }
              onChange={(e) => edit(key, e.target.value)}
              inputMode={key === "house_number" ? "numeric" : undefined}
              maxLength={
                key === "house_letter" ? 4 : key === "house_number" ? 8 : 200
              }
            />
          </label>
        ))}
        <label>
          Landcode
          <input
            value={value.country}
            maxLength={2}
            onChange={(e) => edit("country", e.target.value.toUpperCase())}
          />
        </label>
      </div>
      <p className={`address-location address-${value.status}`}>
        <MapPin size={16} />
        {addressStatus[value.status]}
      </p>
      {open &&
        options.length > 0 &&
        createPortal(
          <div
            id={id}
            role="listbox"
            aria-label="Adresresultaten"
            data-address-list={id}
            className="address-suggestions"
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: Math.max(
                120,
                Math.min(300, window.innerHeight - position.top - 12),
              ),
            }}
          >
            {options.map((o, i) => (
              <button
                id={`${id}-${i}`}
                role="option"
                aria-selected={active === i}
                key={o.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void select(o.id)}
                onMouseEnter={() => setActive(i)}
              >
                <MapPin size={15} />
                {o.label}
              </button>
            ))}
            <small>Adresgegevens: Kadaster / PDOK (CC BY 4.0)</small>
          </div>,
          document.body,
        )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { RegionOption } from "@/app/actions/regions";

function normalizeRegionName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanRegionName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

function uniqueRegionNames(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const value of values) {
    const name = cleanRegionName(value);
    const normalized = normalizeRegionName(name);
    if (!name || seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(name);
  }

  return names;
}

interface RegionMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: RegionOption[];
  label?: string;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}

export function RegionMultiSelect({
  value,
  onChange,
  options,
  label = "Regio's",
  placeholder = "Selecteer of maak regio...",
  emptyLabel = "Geen regio's gevonden.",
  className,
  disabled = false,
}: RegionMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => uniqueRegionNames(value), [value]);
  const selectedKeys = useMemo(
    () => new Set(selected.map(normalizeRegionName)),
    [selected],
  );
  const optionNames = useMemo(
    () => uniqueRegionNames(options.map((option) => option.name)),
    [options],
  );

  const cleanQuery = cleanRegionName(query);
  const queryKey = normalizeRegionName(cleanQuery);
  const canCreate = Boolean(cleanQuery) && !selectedKeys.has(queryKey);

  function commit(next: string[]) {
    onChange(uniqueRegionNames(next));
  }

  function toggle(name: string) {
    const cleaned = cleanRegionName(name);
    if (!cleaned) return;
    const normalized = normalizeRegionName(cleaned);
    if (selectedKeys.has(normalized)) {
      commit(selected.filter((item) => normalizeRegionName(item) !== normalized));
    } else {
      commit([...selected, cleaned]);
    }
    setQuery("");
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="min-h-9 w-full justify-between px-3 py-2 text-left font-normal"
          >
            <span className={cn("truncate", !selected.length && "text-muted-foreground")}>
              {selected.length ? `${selected.length} regio${selected.length === 1 ? "" : "'s"} geselecteerd` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-0" align="start">
          <Command>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Zoek of typ nieuwe regio..."
            />
            <CommandList>
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              <CommandGroup heading={label}>
                {optionNames.map((name) => {
                  const checked = selectedKeys.has(normalizeRegionName(name));
                  return (
                    <CommandItem key={name} value={name} onSelect={() => toggle(name)}>
                      <Check className={cn("h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{name}</span>
                    </CommandItem>
                  );
                })}
                {canCreate && (
                  <CommandItem value={cleanQuery} onSelect={() => toggle(cleanQuery)}>
                    <Plus className="h-4 w-4" />
                    <span className="truncate">Nieuwe regio: {cleanQuery}</span>
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <Badge key={name} variant="secondary" className="gap-1 rounded-md pr-1">
              <span className="max-w-[180px] truncate">{name}</span>
              <button
                type="button"
                className="inline-flex h-4 w-4 items-center justify-center rounded-sm hover:bg-background/80"
                aria-label={`${name} verwijderen`}
                onClick={() => toggle(name)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

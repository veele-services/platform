"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

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

export type ComboboxOption = {
  value: string;
  label: React.ReactNode;
  searchValue: string;
  description?: React.ReactNode;
  disabled?: boolean;
};

function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Selecteer een optie…",
  searchPlaceholder = "Zoeken…",
  emptyLabel = "Geen opties gevonden.",
  groupLabel,
  id,
  ariaLabel,
  disabled = false,
  invalid = false,
  className,
  contentClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: React.ReactNode;
  groupLabel?: React.ReactNode;
  id?: string;
  ariaLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className={cn(
            "min-h-10 w-full justify-between px-3 text-left font-normal",
            !selected && "text-muted-foreground",
            invalid && "border-destructive",
            className,
          )}
        >
          <span className="min-w-0 truncate">
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-[var(--radix-popover-trigger-width)] p-0", contentClassName)}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup heading={groupLabel}>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.searchValue}
                  disabled={option.disabled}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.description ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { Combobox };

"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value:        string[];
  onChange:     (tags: string[]) => void;
  id?:          string;
  ariaLabel?:   string;
  placeholder?: string;
  disabled?:    boolean;
  className?:   string;
}

export function TagInput({
  value,
  onChange,
  id,
  ariaLabel,
  placeholder = "Typ een waarde en druk op Enter…",
  disabled,
  className,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  function addTag() {
    const trimmed = inputValue.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputValue("");
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-11 flex-wrap gap-1.5 rounded-md border border-border bg-background px-3 py-2",
        "focus-within:ring-1 focus-within:ring-ring focus-within:border-ring",
        "transition-colors",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {value.map((tag, i) => (
        <span
          key={tag}
          className="inline-flex min-h-8 items-center gap-1 rounded bg-accent py-0.5 pl-2 text-xs font-medium text-accent-foreground"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-7"
              aria-label={`${tag} verwijderen`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          id={id}
          aria-label={ariaLabel}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-h-10 min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      )}
    </div>
  );
}

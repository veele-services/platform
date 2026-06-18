"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value:        string[];
  onChange:     (tags: string[]) => void;
  placeholder?: string;
  disabled?:    boolean;
  className?:   string;
}

export function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter…",
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
        "flex flex-wrap gap-1.5 min-h-[38px] px-3 py-2 rounded-md border bg-background",
        "focus-within:ring-1 focus-within:ring-ring focus-within:border-ring",
        "transition-colors",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      style={{ borderColor: "#E2E8F0" }}
    >
      {value.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: "#E0FAFB", color: "#0A7E7A" }}
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="rounded hover:bg-black/10 focus:outline-none flex-shrink-0"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      )}
    </div>
  );
}

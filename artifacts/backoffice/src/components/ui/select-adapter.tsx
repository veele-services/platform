"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EMPTY_VALUE = "__fieldgrid_empty_value__";

type SelectOption = {
  disabled: boolean;
  label: React.ReactNode;
  text: string;
  value: string;
};

export type SelectAdapterChangeEvent = {
  currentTarget: {
    selectedOptions: Array<{ value: string }>;
    value: string;
  };
  target: {
    selectedOptions: Array<{ value: string }>;
    value: string;
  };
};

type SelectAdapterProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "defaultValue" | "onChange" | "size" | "value"
> & {
  defaultValue?: string | readonly string[];
  onChange?: (event: SelectAdapterChangeEvent) => void;
  size?: number;
  value?: string | readonly string[];
};

function textContent(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  return React.Children.toArray(node).map(textContent).join(" ").trim();
}

function optionChildren(children: React.ReactNode): SelectOption[] {
  const options: SelectOption[] = [];

  function visit(nodes: React.ReactNode) {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === "option") {
        const props =
          child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
        const label = props.children ?? props.label ?? props.value ?? "";
        options.push({
          disabled: Boolean(props.disabled),
          label,
          text: textContent(label),
          value: String(props.value ?? ""),
        });
        return;
      }
      if (child.type === "optgroup") {
        const props =
          child.props as React.OptgroupHTMLAttributes<HTMLOptGroupElement>;
        visit(props.children);
      }
    });
  }

  visit(children);
  return options;
}

function normalizedValues(
  value: string | readonly string[] | undefined,
): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined ? [] : [String(value)];
}

/**
 * Compatibility composition for the remaining form-post based screens.
 *
 * It preserves the native `<option>` authoring surface while delegating the
 * released interaction to the canonical Radix Select or Popover + Checkbox
 * primitives. This keeps server-action field names and values stable during
 * the UI migration.
 */
export function SelectAdapter({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  children,
  className,
  defaultValue,
  disabled,
  form,
  id,
  multiple = false,
  name,
  onChange,
  required,
  style,
  tabIndex,
  title,
  value,
}: SelectAdapterProps) {
  const options = React.useMemo(() => optionChildren(children), [children]);
  const controlled = value !== undefined;
  const controlledValues = normalizedValues(value);
  const initialValues = normalizedValues(defaultValue);
  const [internalValues, setInternalValues] =
    React.useState<string[]>(initialValues);
  const selectedValues = controlled ? controlledValues : internalValues;

  function emit(nextValues: string[]) {
    if (!controlled) setInternalValues(nextValues);
    const selectedOptions = nextValues.map((selectedValue) => ({
      value: selectedValue,
    }));
    const event: SelectAdapterChangeEvent = {
      currentTarget: {
        selectedOptions,
        value: nextValues[0] ?? "",
      },
      target: {
        selectedOptions,
        value: nextValues[0] ?? "",
      },
    };
    onChange?.(event);
  }

  if (multiple) {
    const selectedLabels = options
      .filter((option) => selectedValues.includes(option.value))
      .map((option) => option.text);
    const summary =
      selectedLabels.length === 0
        ? "Selecteer één of meer opties"
        : selectedLabels.length <= 2
          ? selectedLabels.join(", ")
          : `${selectedLabels.length} opties geselecteerd`;

    return (
      <>
        <Popover>
          <PopoverTrigger asChild>
            <button
              id={id}
              type="button"
              disabled={disabled}
              aria-describedby={ariaDescribedBy}
              aria-invalid={ariaInvalid}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              aria-required={required || undefined}
              tabIndex={tabIndex}
              title={title}
              className={cn(
                "flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--radius-input)] border border-input bg-background px-3 py-2 text-left text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                className,
              )}
              style={style}
            >
              <span className="min-w-0 truncate">{summary}</span>
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="max-h-80 w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
          >
            <div
              role="group"
              aria-label={
                typeof ariaLabel === "string" ? ariaLabel : "Kies opties"
              }
              className="grid gap-1"
            >
              {options.map((option) => {
                const checked = selectedValues.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-sm hover:bg-accent",
                      option.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled || option.disabled}
                      onCheckedChange={(nextChecked) => {
                        emit(
                          nextChecked
                            ? [...selectedValues, option.value]
                            : selectedValues.filter(
                                (selectedValue) =>
                                  selectedValue !== option.value,
                              ),
                        );
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        {selectedValues.map((selectedValue) => (
          <input
            key={selectedValue}
            type="hidden"
            name={name}
            form={form}
            value={selectedValue}
          />
        ))}
      </>
    );
  }

  const selectedValue = selectedValues[0] ?? "";
  const radixValue = selectedValue === "" ? EMPTY_VALUE : selectedValue;

  return (
    <Select
      value={radixValue}
      disabled={disabled}
      name={name}
      required={required}
      onValueChange={(nextValue) =>
        emit([nextValue === EMPTY_VALUE ? "" : nextValue])
      }
    >
      <SelectTrigger
        id={id}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={className}
        style={style}
        tabIndex={tabIndex}
        title={title}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value || EMPTY_VALUE}
            value={option.value || EMPTY_VALUE}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

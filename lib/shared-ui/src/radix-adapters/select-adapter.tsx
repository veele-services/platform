"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as React from "react";

import { cn } from "../utils";

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

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      className="h-4 w-4 shrink-0 opacity-50"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m7 9 5-5 5 5M7 15l5 5 5-5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

/**
 * Cross-application compatibility composition for form-post based screens.
 *
 * Existing `<option>` children remain declarative, while all visible
 * interaction is delegated to Radix Select or Popover + Checkbox. Field names
 * and submitted values stay unchanged for server actions.
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
        <PopoverPrimitive.Root>
          <PopoverPrimitive.Trigger asChild>
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
                "flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-left text-sm text-foreground shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                className,
              )}
              style={style}
            >
              <span className="min-w-0 truncate">{summary}</span>
              <ChevronIcon />
            </button>
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              align="start"
              sideOffset={4}
              className="z-[var(--z-dropdown)] max-h-80 w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md motion-reduce:animate-none"
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
                      <CheckboxPrimitive.Root
                        checked={checked}
                        disabled={disabled || option.disabled}
                        className="grid size-5 shrink-0 place-content-center rounded-sm border border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
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
                      >
                        <CheckboxPrimitive.Indicator>
                          <CheckIcon />
                        </CheckboxPrimitive.Indicator>
                      </CheckboxPrimitive.Root>
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
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
    <SelectPrimitive.Root
      value={radixValue}
      disabled={disabled}
      name={name}
      required={required}
      onValueChange={(nextValue) =>
        emit([nextValue === EMPTY_VALUE ? "" : nextValue])
      }
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        style={style}
        tabIndex={tabIndex}
        title={title}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon asChild>
          <ChevronIcon />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          className="z-[var(--z-dropdown)] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md motion-reduce:animate-none"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value || EMPTY_VALUE}
                value={option.value || EMPTY_VALUE}
                disabled={option.disabled}
                className="relative flex min-h-11 cursor-default select-none items-center rounded-sm py-2 pl-2 pr-8 text-sm outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2">
                  <CheckIcon />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as React from "react";

import { cn } from "../utils";

export type CheckboxAdapterChangeEvent = {
  currentTarget: { checked: boolean; value: string };
  target: { checked: boolean; value: string };
};

type CheckboxAdapterProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "type"
> & {
  onChange?: (event: CheckboxAdapterChangeEvent) => void;
  type?: "checkbox";
};

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

/**
 * Server-action compatible Radix checkbox used while older forms retain their
 * native input-shaped prop contract.
 */
export function CheckboxAdapter({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  checked,
  className,
  defaultChecked,
  disabled,
  form,
  id,
  name,
  onChange,
  required,
  tabIndex,
  title,
  value = "on",
}: CheckboxAdapterProps) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      name={name}
      value={String(value)}
      form={form}
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      required={required}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      tabIndex={tabIndex}
      title={title}
      className={cn(
        "relative grid size-5 shrink-0 place-content-center rounded-sm border border-primary shadow before:absolute before:-inset-3 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      onCheckedChange={(nextChecked) => {
        if (nextChecked === "indeterminate") return;
        const event: CheckboxAdapterChangeEvent = {
          currentTarget: {
            checked: nextChecked,
            value: String(value),
          },
          target: {
            checked: nextChecked,
            value: String(value),
          },
        };
        onChange?.(event);
      }}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center">
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

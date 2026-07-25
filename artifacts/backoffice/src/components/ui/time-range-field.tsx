"use client"

import * as React from "react"
import {
  formatDuration,
  suggestEndTime,
  validateTimeRange,
} from "@workspace/db/form-time-range"

import { FormGrid } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function TimeRangeField({
  start,
  end,
  onStartChange,
  onEndChange,
  disabled,
  required = false,
  startLabel = "Starttijd",
  endLabel = "Eindtijd",
  error,
  startId,
  endId,
  startInputProps,
  endInputProps,
}: {
  start: string
  end: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  startLabel?: React.ReactNode
  endLabel?: React.ReactNode
  error?: React.ReactNode
  startId?: string
  endId?: string
  startInputProps?: Omit<
    React.ComponentProps<typeof Input>,
    "id" | "type" | "value" | "onChange"
  >
  endInputProps?: Omit<
    React.ComponentProps<typeof Input>,
    "id" | "type" | "value" | "onChange"
  >
}) {
  const generatedId = React.useId()
  const resolvedStartId = startId ?? `${generatedId}-start`
  const resolvedEndId = endId ?? `${generatedId}-end`
  const result = validateTimeRange(start, end)
  const feedbackId = `${generatedId}-feedback`
  const invalid = Boolean(error) || !result.valid

  function updateStart(value: string) {
    onStartChange(value)
    if (!end) {
      const suggestion = suggestEndTime(value)
      if (suggestion) onEndChange(suggestion)
    }
  }

  return (
    <div className="space-y-2">
      <FormGrid columns="two">
        <div className="space-y-1">
          <Label htmlFor={resolvedStartId}>
            {startLabel}
            {required ? <span className="ml-1 text-destructive">*</span> : null}
          </Label>
          <Input
            {...startInputProps}
            id={resolvedStartId}
            type="time"
            value={start}
            disabled={disabled}
            required={required}
            aria-describedby={feedbackId}
            aria-invalid={invalid}
            onChange={(event) => updateStart(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={resolvedEndId}>
            {endLabel}
            {required ? <span className="ml-1 text-destructive">*</span> : null}
          </Label>
          <Input
            {...endInputProps}
            id={resolvedEndId}
            type="time"
            value={end}
            disabled={disabled}
            required={required}
            aria-describedby={feedbackId}
            aria-invalid={invalid}
            onChange={(event) => onEndChange(event.target.value)}
          />
        </div>
      </FormGrid>
      <p
        id={feedbackId}
        role={invalid ? "alert" : "status"}
        className={invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
      >
        {error ??
        (result.valid && result.durationMinutes !== null
          ? `Duur: ${formatDuration(result.durationMinutes)}`
          : result.valid
            ? "Vul een start- en eindtijd in om de duur te berekenen."
            : result.message)}
      </p>
    </div>
  )
}

export { TimeRangeField }

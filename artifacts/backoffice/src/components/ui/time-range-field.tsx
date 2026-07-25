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
  startId = "start-time",
  endId = "end-time",
}: {
  start: string
  end: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  disabled?: boolean
  startId?: string
  endId?: string
}) {
  const result = validateTimeRange(start, end)
  const feedbackId = `${startId}-${endId}-feedback`

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
          <Label htmlFor={startId}>Starttijd</Label>
          <Input
            id={startId}
            type="time"
            value={start}
            disabled={disabled}
            aria-describedby={feedbackId}
            aria-invalid={!result.valid}
            onChange={(event) => updateStart(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={endId}>Eindtijd</Label>
          <Input
            id={endId}
            type="time"
            value={end}
            disabled={disabled}
            aria-describedby={feedbackId}
            aria-invalid={!result.valid}
            onChange={(event) => onEndChange(event.target.value)}
          />
        </div>
      </FormGrid>
      <p
        id={feedbackId}
        role={result.valid ? "status" : "alert"}
        className={result.valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}
      >
        {result.valid && result.durationMinutes !== null
          ? `Duur: ${formatDuration(result.durationMinutes)}`
          : result.valid
            ? "Vul een start- en eindtijd in om de duur te berekenen."
            : result.message}
      </p>
    </div>
  )
}

export { TimeRangeField }

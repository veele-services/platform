"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type PromptField = {
  name: string
  label: string
  initialValue?: string
  placeholder?: string
  required?: boolean
  type?: React.HTMLInputTypeAttribute
}

function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  confirmLabel = "Bevestigen",
  validate,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  fields: readonly PromptField[]
  confirmLabel?: React.ReactNode
  validate?: (values: Readonly<Record<string, string>>) => string | null
  onConfirm: (values: Readonly<Record<string, string>>) => void
}) {
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setValues(
      Object.fromEntries(
        fields.map((field) => [field.name, field.initialValue ?? ""]),
      ),
    )
    setError(null)
  }, [open])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validate?.(values) ?? null
    if (validationError) {
      setError(validationError)
      return
    }
    onConfirm(values)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="space-y-4">
            {fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={`prompt-${field.name}`}>{field.label}</Label>
                <Input
                  id={`prompt-${field.name}`}
                  name={field.name}
                  type={field.type ?? "text"}
                  value={values[field.name] ?? ""}
                  placeholder={field.placeholder}
                  required={field.required}
                  autoFocus={field === fields[0]}
                  aria-invalid={Boolean(error)}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuleren
            </Button>
            <Button type="submit">{confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { PromptDialog, type PromptField }

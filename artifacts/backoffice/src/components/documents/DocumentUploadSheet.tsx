"use client";

import type { FormEvent, ReactNode, Ref } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface DocumentUploadSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  name: string;
  onNameChange: (value: string) => void;
  namePlaceholder?: string;
  file: File | null;
  fileInputRef?: Ref<HTMLInputElement>;
  onFileChange: (file: File | null) => void;
  accept?: string;
  error?: string | null;
  pending?: boolean;
  submitLabel?: string;
  pendingLabel?: string;
  children?: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const DEFAULT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.svg";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentUploadSheet({
  open,
  onOpenChange,
  title,
  description = "Koppel een bestand aan deze omgeving. Downloads verlopen via tijdelijke beveiligde links.",
  name,
  onNameChange,
  namePlaceholder = "bijv. Contract, foto of keuringsbewijs",
  file,
  fileInputRef,
  onFileChange,
  accept = DEFAULT_ACCEPT,
  error,
  pending = false,
  submitLabel = "Uploaden",
  pendingLabel = "Uploaden...",
  children,
  onSubmit,
}: DocumentUploadSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-6 flex flex-1 flex-col gap-5">
          <div className="flex-1 space-y-4">
            <label className="block text-sm font-medium text-foreground">
              Naam <span className="text-destructive">*</span>
              <input
                type="text"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder={namePlaceholder}
                className="veele-input mt-1 w-full"
                disabled={pending}
                required
              />
            </label>

            {children}

            <label className="block text-sm font-medium text-foreground">
              Bestand <span className="text-destructive">*</span>
              <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                disabled={pending}
                className="mt-1 block w-full cursor-pointer text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
              {file && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {file.name} - {formatFileSize(file.size)}
                </span>
              )}
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <SheetFooter className="gap-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button type="submit" disabled={pending || !file || !name.trim()}>
              <Upload className="h-4 w-4" />
              {pending ? pendingLabel : submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

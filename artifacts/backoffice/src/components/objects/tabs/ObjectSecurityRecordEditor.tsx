"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { createObjectSecurityRecordAction } from "@/app/actions/object-security";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = [
  ["access_instructions", "Toegangsinstructies"],
  ["key_location", "Sleutellocatie"],
  ["key_code", "Sleutelcode"],
  ["alarm_procedure", "Alarmprocedure"],
  ["alarm_code", "Alarmcode"],
  ["entrance", "Ingang"],
  ["badge_instructions", "Badge-instructies"],
  ["key_management", "Sleutelbeheer"],
  ["opening_procedure", "Openingsprocedure"],
  ["closing_procedure", "Sluitprocedure"],
  ["security_contact", "Beveiligingscontact"],
  ["emergency_procedure", "Noodprocedure"],
  ["confidential_route", "Vertrouwelijke route"],
  ["temporary_access", "Tijdelijke toegang"],
] as const;

export function ObjectSecurityRecordEditor({ objectId }: { objectId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number][0]>("access_instructions");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");

  function save() {
    startTransition(async () => {
      try {
        const result = await createObjectSecurityRecordAction({
          objectId,
          category,
          title,
          value,
          changeReason: reason,
          validFrom: validFrom ? new Date(validFrom).toISOString() : undefined,
          validUntil: validUntil ? new Date(validUntil).toISOString() : null,
        });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        window.dispatchEvent(new Event("fieldgrid:object-security-changed"));
        setOpen(false);
        setTitle("");
        setValue("");
        setReason("");
        setValidFrom("");
        setValidUntil("");
      } catch {
        toast.error("Opslaan is niet gelukt. Controleer uw sessie en verbinding.");
      }
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus /> Beveiligingsinformatie toevoegen
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nieuwe beveiligingsversie</DialogTitle>
            <DialogDescription>
              De inhoud wordt direct versleuteld. Een actieve versie van hetzelfde type wordt vervangen en open ontgrendelingen vervallen.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <ShieldAlert aria-hidden="true" className="h-4 w-4" />
            <AlertTitle>Strikt vertrouwelijk</AlertTitle>
            <AlertDescription>Neem geen persoonsgegevens of informatie voor andere objecten op.</AlertDescription>
          </Alert>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="security-record-category">Type</Label>
              <Select value={category} onValueChange={(next) => setCategory(next as typeof category)}>
                <SelectTrigger id="security-record-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="security-record-title">Titel</Label>
              <Input id="security-record-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="security-record-value">Vertrouwelijke inhoud</Label>
              <Textarea id="security-record-value" value={value} onChange={(event) => setValue(event.target.value)} maxLength={10_000} autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="security-record-reason">Reden van wijziging</Label>
              <Input id="security-record-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="security-record-valid-from">Geldig vanaf</Label>
                <Input id="security-record-valid-from" type="datetime-local" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="security-record-valid-until">Geldig tot (optioneel)</Label>
                <Input id="security-record-valid-until" type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={save} disabled={pending || title.trim().length < 3 || !value.trim() || reason.trim().length < 3}>
              {pending && <Loader2 className="animate-spin" />} Versleuteld opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Save, X, Loader2, Lock, Key, Bell, BookOpen, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { updateObject, type ObjectDetail } from "@/app/actions/objects";

interface Props {
  object:   ObjectDetail;
  canWrite: boolean;
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="veele-card">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>{title}</p>
      </div>
      {children}
    </div>
  );
}

function EmptyField({ value, placeholder }: { value: string | null; placeholder: string }) {
  if (value) {
    return <p className="text-sm whitespace-pre-wrap" style={{ color: "#334155" }}>{value}</p>;
  }
  return <p className="text-sm italic" style={{ color: "#CBD5E1" }}>{placeholder}</p>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function ObjectDetailsTab({ object: obj, canWrite }: Props) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const requiredRoles = asStringArray(obj.requiredRoles);
  const requiredCertificates = asStringArray(obj.requiredCertificates);

  const [form, setForm] = useState({
    serviceType:         obj.serviceType         ?? "",
    accessInfo:          obj.accessInfo          ?? "",
    keyInfo:             obj.keyInfo             ?? "",
    alarmInfo:           obj.alarmInfo           ?? "",
    fixedInstructions:   obj.fixedInstructions   ?? "",
    specialNotes:        obj.specialNotes        ?? "",
    requiredRoles,
    requiredCertificates,
  });

  function handleCancel() {
    setForm({
      serviceType:         obj.serviceType         ?? "",
      accessInfo:          obj.accessInfo          ?? "",
      keyInfo:             obj.keyInfo             ?? "",
      alarmInfo:           obj.alarmInfo           ?? "",
      fixedInstructions:   obj.fixedInstructions   ?? "",
      specialNotes:        obj.specialNotes        ?? "",
      requiredRoles,
      requiredCertificates,
    });
    setEditing(false);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateObject(obj.id, {
        customerId:           obj.customerId,
        sectorId:             obj.sectorId    ?? undefined,
        name:                 obj.name,
        address:              obj.address     ?? undefined,
        city:                 obj.city        ?? undefined,
        postalCode:           obj.postalCode  ?? undefined,
        description:          obj.description ?? undefined,
        serviceType:          form.serviceType          || undefined,
        accessInfo:           form.accessInfo           || undefined,
        keyInfo:              form.keyInfo              || undefined,
        alarmInfo:            form.alarmInfo            || undefined,
        fixedInstructions:    form.fixedInstructions    || undefined,
        specialNotes:         form.specialNotes         || undefined,
        requiredRoles:        form.requiredRoles,
        requiredCertificates: form.requiredCertificates,
      });

      if (result.success) {
        toast.success("Details opgeslagen");
        setEditing(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Edit toggle */}
      {canWrite && (
        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
                <X className="mr-1.5 h-4 w-4" /> Annuleren
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                {isPending
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  : <Save className="mr-1.5 h-4 w-4" />}
                Opslaan
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-4 w-4" /> Bewerken
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          <SectionCard icon={Lock} title="Toegangsinformatie">
            {editing ? (
              <Textarea
                value={form.accessInfo}
                onChange={(e) => setForm((f) => ({ ...f, accessInfo: e.target.value }))}
                placeholder="Bijv. sleutelkast code, toegangspas, portiek..."
                rows={3}
                className="resize-none"
              />
            ) : (
              <EmptyField value={obj.accessInfo} placeholder="Geen toegangsinformatie ingevuld" />
            )}
          </SectionCard>

          <SectionCard icon={Key} title="Sleutelinformatie">
            {editing ? (
              <Textarea
                value={form.keyInfo}
                onChange={(e) => setForm((f) => ({ ...f, keyInfo: e.target.value }))}
                placeholder="Bijv. sleutelnummer, bewaarplaats, retourprocedure..."
                rows={3}
                className="resize-none"
              />
            ) : (
              <EmptyField value={obj.keyInfo} placeholder="Geen sleutelinformatie ingevuld" />
            )}
          </SectionCard>

          <SectionCard icon={Bell} title="Alarmgegevens">
            {editing ? (
              <Textarea
                value={form.alarmInfo}
                onChange={(e) => setForm((f) => ({ ...f, alarmInfo: e.target.value }))}
                placeholder="Bijv. alarmcode, contactpersoon bij alarm, wachttijd..."
                rows={3}
                className="resize-none"
              />
            ) : (
              <EmptyField value={obj.alarmInfo} placeholder="Geen alarmgegevens ingevuld" />
            )}
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <SectionCard icon={BookOpen} title="Vaste instructies">
            {editing ? (
              <Textarea
                value={form.fixedInstructions}
                onChange={(e) => setForm((f) => ({ ...f, fixedInstructions: e.target.value }))}
                placeholder="Vaste werkinstructies die altijd van toepassing zijn..."
                rows={4}
                className="resize-none"
              />
            ) : (
              <EmptyField value={obj.fixedInstructions} placeholder="Geen vaste instructies ingevuld" />
            )}
          </SectionCard>

          <SectionCard icon={AlertCircle} title="Bijzonderheden">
            {editing ? (
              <Textarea
                value={form.specialNotes}
                onChange={(e) => setForm((f) => ({ ...f, specialNotes: e.target.value }))}
                placeholder="Bijzondere omstandigheden, aandachtspunten, gevaren..."
                rows={4}
                className="resize-none"
              />
            ) : (
              <EmptyField value={obj.specialNotes} placeholder="Geen bijzonderheden ingevuld" />
            )}
          </SectionCard>

          {/* Qualifications in edit mode */}
          {editing && (
            <div className="veele-card space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
                Vereiste kwalificaties
              </p>
              <div className="space-y-2">
                <Label>Vereiste functies</Label>
                <TagInput
                  value={form.requiredRoles}
                  onChange={(tags) => setForm((f) => ({ ...f, requiredRoles: tags }))}
                  placeholder="Typ en druk Enter..."
                />
              </div>
              <div className="space-y-2">
                <Label>Vereiste certificaten</Label>
                <TagInput
                  value={form.requiredCertificates}
                  onChange={(tags) => setForm((f) => ({ ...f, requiredCertificates: tags }))}
                  placeholder="Bijv. VCA, BHV..."
                />
              </div>
            </div>
          )}

          {/* Diensttype in edit mode */}
          {editing && (
            <div className="veele-card space-y-2">
              <Label htmlFor="serviceType">Diensttype</Label>
              <Input
                id="serviceType"
                value={form.serviceType}
                onChange={(e) => setForm((f) => ({ ...f, serviceType: e.target.value }))}
                placeholder="Bijv. Schoonmaak, Beveiliging, Onderhoud..."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

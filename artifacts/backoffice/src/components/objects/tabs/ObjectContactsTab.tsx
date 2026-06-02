"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Star, Mail, Phone, UserCircle2, Loader2, X, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  addObjectContact,
  updateObjectContact,
  deleteObjectContact,
  type ObjectContactRow,
  type ObjectContactInput,
} from "@/app/actions/objects";

interface Props {
  objectId:  string;
  contacts:  ObjectContactRow[];
  canWrite:  boolean;
}

const EMPTY: ObjectContactInput = {
  firstName: "",
  lastName:  "",
  function:  "",
  phone:     "",
  email:     "",
  isPrimary: false,
};

export function ObjectContactsTab({ objectId, contacts: initialContacts, canWrite }: Props) {
  const [contacts,     setContacts]     = useState(initialContacts);
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [form,         setForm]         = useState<ObjectContactInput>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<ObjectContactRow | null>(null);
  const [isPending,    startTransition] = useTransition();

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setDialogOpen(true);
  }

  function openEdit(c: ObjectContactRow) {
    setEditingId(c.id);
    setForm({
      firstName: c.firstName,
      lastName:  c.lastName,
      function:  c.function  ?? "",
      phone:     c.phone     ?? "",
      email:     c.email     ?? "",
      isPrimary: c.isPrimary,
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    startTransition(async () => {
      const result = editingId
        ? await updateObjectContact(editingId, objectId, form)
        : await addObjectContact(objectId, form);

      if (result.success) {
        toast.success(editingId ? "Contact bijgewerkt" : "Contact toegevoegd");
        setDialogOpen(false);

        if (!editingId && result.data) {
          const newContact: ObjectContactRow = {
            id:        result.data.id,
            objectId,
            firstName: form.firstName,
            lastName:  form.lastName,
            function:  form.function  || null,
            phone:     form.phone     || null,
            email:     form.email     || null,
            isPrimary: form.isPrimary ?? false,
          };
          setContacts((prev) => {
            let next = prev;
            if (form.isPrimary) next = next.map((c) => ({ ...c, isPrimary: false }));
            return [newContact, ...next];
          });
        } else if (editingId) {
          setContacts((prev) => {
            let next = prev;
            if (form.isPrimary) next = next.map((c) => ({ ...c, isPrimary: false }));
            return next.map((c) =>
              c.id === editingId
                ? {
                    ...c,
                    ...form,
                    function: form.function || null,
                    phone:    form.phone    || null,
                    email:    form.email    || null,
                  }
                : c,
            );
          });
        }
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteObjectContact(deleteTarget.id, objectId);
      if (result.success) {
        toast.success("Contact verwijderd");
        setContacts((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      } else {
        toast.error(result.message);
      }
      setDeleteTarget(null);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: "#64748B" }}>
          {contacts.length} contact{contacts.length !== 1 ? "en" : ""}
        </p>
        {canWrite && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Contact toevoegen
          </Button>
        )}
      </div>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <UserCircle2 className="h-10 w-10 mb-3" style={{ color: "#CBD5E1" }} />
          <p className="text-sm font-medium" style={{ color: "#64748B" }}>Nog geen contactpersonen</p>
          <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>
            {canWrite ? "Voeg de eerste contactpersoon toe." : "Geen contactpersonen beschikbaar."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="rounded-xl p-4 relative"
              style={{
                border:          `1px solid ${c.isPrimary ? "#00B7B3" : "#E2E8F0"}`,
                backgroundColor: c.isPrimary ? "#F0FDFD" : "#FAFCFF",
              }}
            >
              {c.isPrimary && (
                <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#00B7B3" }}>
                  <Star className="h-3 w-3 fill-current" /> Primair
                </span>
              )}
              <div className="mb-2 pr-16">
                <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
                  {c.firstName} {c.lastName}
                </p>
                {c.function && (
                  <p className="text-xs" style={{ color: "#64748B" }}>{c.function}</p>
                )}
              </div>
              <div className="space-y-1">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-xs hover:underline" style={{ color: "#00B7B3" }}>
                    <Mail className="h-3 w-3" /> {c.email}
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-xs hover:underline" style={{ color: "#64748B" }}>
                    <Phone className="h-3 w-3" /> {c.phone}
                  </a>
                )}
              </div>
              {canWrite && (
                <div className="flex items-center gap-1 mt-3 pt-3" style={{ borderTop: "1px solid #E2E8F0" }}>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(c)}>
                    <Pencil className="h-3 w-3 mr-1" /> Bewerken
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(c)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Verwijderen
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Contact bewerken" : "Contact toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <Label>Voornaam <span className="text-destructive">*</span></Label>
              <Input
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                placeholder="Jan"
              />
            </div>
            <div className="space-y-1">
              <Label>Achternaam <span className="text-destructive">*</span></Label>
              <Input
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                placeholder="Jansen"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Functie</Label>
              <Input
                value={form.function ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, function: e.target.value }))}
                placeholder="Directeur"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jan@bedrijf.nl"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Telefoon</Label>
              <Input
                value={form.phone ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+31 6 00 00 00 00"
              />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.isPrimary ?? false}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isPrimary: !!v }))}
                />
                <span className="text-sm">Primair contact</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              <X className="mr-1.5 h-4 w-4" /> Annuleren
            </Button>
            <Button
              onClick={handleSave}
              disabled={isPending || !form.firstName.trim() || !form.lastName.trim()}
            >
              {isPending
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                : <Check className="mr-1.5 h-4 w-4" />}
              {editingId ? "Opslaan" : "Toevoegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contact verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Verwijder <strong>{deleteTarget?.firstName} {deleteTarget?.lastName}</strong>?{" "}
              Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

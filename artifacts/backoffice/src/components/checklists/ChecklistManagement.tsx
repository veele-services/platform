"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Archive, ArrowDown, ArrowUp, CheckCircle2, ClipboardCheck, Eye, GitMerge, Plus, Send, ShieldCheck, Trash2 } from "lucide-react";
import type { ChecklistTemplateSnapshot } from "@workspace/db";
import {
  archiveChecklistTemplateAction,
  createChecklistBindingAction,
  createChecklistTemplateAction,
  duplicateChecklistVersionAction,
  previewAssignmentChecklistsAction,
  publishChecklistVersionAction,
  retryChecklistReconciliationQueueAction,
  reviewChecklistReconciliationAction,
  saveChecklistDraftAction,
  setChecklistBindingStatusAction,
  upgradeAssignmentChecklistVersionsAction,
  waiveAssignmentChecklistAction,
  type ChecklistManagementData,
} from "@/app/actions/checklists";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type BuilderItem = ChecklistTemplateSnapshot["sections"][number]["items"][number];
type BuilderSection = ChecklistTemplateSnapshot["sections"][number];

const FIELD_TYPES = [
  ["checkbox", "Checkbox / akkoord"], ["short_text", "Korte tekst"], ["long_text", "Lange tekst"],
  ["single_choice", "Enkelvoudige keuze"], ["multiple_choice", "Meervoudige keuze"],
  ["number", "Numerieke waarde"], ["measurement", "Meting met eenheid"], ["date", "Datum"], ["datetime", "Datum en tijd"],
  ["photo", "Foto"], ["multi_photo", "Meerdere foto’s"], ["signature", "Handtekening"],
  ["information", "Instructieblok"],
] as const;

function stableId(prefix: string) {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return `${prefix}-${suffix}`;
}

function emptySchema(): ChecklistTemplateSnapshot {
  return { sections: [{ id: stableId("section"), title: "Controle", description: null, sortOrder: 0, items: [] }] };
}

function selectClass() {
  return "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

export function ChecklistManagement({ data, canWrite, canPublish, canReview }: {
  data: ChecklistManagementData;
  canWrite: boolean;
  canPublish: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<{ templateId: string; versionId: string } | null>(null);
  const [name, setName] = useState("");
  const [familyKey, setFamilyKey] = useState("");
  const [description, setDescription] = useState("");
  const [cardinality, setCardinality] = useState("per_work_order");
  const [isProtected, setProtected] = useState(false);
  const [waivable, setWaivable] = useState(false);
  const [changeSummary, setChangeSummary] = useState("");
  const [schema, setSchema] = useState<ChecklistTemplateSnapshot>(emptySchema);
  const [bindingOpen, setBindingOpen] = useState(false);
  const [previewAssignmentId, setPreviewAssignmentId] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewAssignmentChecklistsAction>> extends { success: true; data: infer T } ? T : never>(null as never);
  const [review, setReview] = useState<{ eventId: string; decision: "accept_changes" | "keep_current" } | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [snapshotAssignmentId, setSnapshotAssignmentId] = useState(data.assignmentChecklists[0]?.assignmentId ?? "");
  const [waiver, setWaiver] = useState<{ assignmentId: string; checklistId: string; kind: "waived" | "not_applicable"; name: string } | null>(null);
  const [waiverReason, setWaiverReason] = useState("");

  const publishedTemplates = useMemo(() => data.templates.filter((template) => template.versions.some((version) => version.status === "published")), [data.templates]);

  function run(action: () => Promise<{ success: boolean; error?: string }>, successText: string, close?: () => void) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setNotice({ tone: "error", text: result.error ?? "De actie is mislukt." });
        return;
      }
      setNotice({ tone: "success", text: successText });
      close?.();
      router.refresh();
    });
  }

  function openNewTemplate() {
    setEditing(null); setName(""); setFamilyKey(""); setDescription(""); setCardinality("per_work_order");
    setProtected(false); setWaivable(false); setChangeSummary(""); setSchema(emptySchema()); setBuilderOpen(true);
  }

  function openDraft(template: ChecklistManagementData["templates"][number], version: ChecklistManagementData["templates"][number]["versions"][number]) {
    setEditing({ templateId: template.id, versionId: version.id }); setName(template.name); setFamilyKey(template.familyKey);
    setDescription(template.description ?? ""); setCardinality(template.cardinality); setProtected(template.protected);
    setWaivable(template.waivable); setChangeSummary(version.changeSummary ?? ""); setSchema(version.schema); setBuilderOpen(true);
  }

  function saveBuilder() {
    if (editing) {
      run(() => saveChecklistDraftAction({ ...editing, schema, changeSummary }), "Conceptversie opgeslagen.", () => setBuilderOpen(false));
    } else {
      run(() => createChecklistTemplateAction({ familyKey, name, description, cardinality: cardinality as never, protected: isProtected, waivable, schema }), "Checklisttemplate aangemaakt.", () => setBuilderOpen(false));
    }
  }

  function updateSection(sectionId: string, patch: Partial<BuilderSection>) {
    setSchema((current) => ({ ...current, sections: current.sections.map((section) => section.id === sectionId ? { ...section, ...patch } : section) }));
  }

  function updateItem(sectionId: string, itemId: string, patch: Partial<BuilderItem>) {
    setSchema((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId
        ? { ...section, items: section.items.map((item) => item.id === itemId ? { ...item, ...patch } : item) }
        : section),
    }));
  }

  function addItem(sectionId: string) {
    setSchema((current) => ({ ...current, sections: current.sections.map((section) => section.id === sectionId
      ? { ...section, items: [...section.items, { id: stableId("item"), type: "checkbox", label: "Nieuwe controle", description: null, instruction: null, required: false, sortOrder: section.items.length, visibleWhen: null, validation: null, evidence: null }] }
      : section) }));
  }

  function removeItem(sectionId: string, itemId: string) {
    setSchema((current) => ({ ...current, sections: current.sections.map((section) => section.id === sectionId ? { ...section, items: section.items.filter((item) => item.id !== itemId).map((item, sortOrder) => ({ ...item, sortOrder })) } : section) }));
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    setSchema((current) => {
      const sections = [...current.sections];
      const index = sections.findIndex((section) => section.id === sectionId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= sections.length) return current;
      [sections[index], sections[target]] = [sections[target]!, sections[index]!];
      return { ...current, sections: sections.map((section, sortOrder) => ({ ...section, sortOrder })) };
    });
  }

  function moveItem(sectionId: string, itemId: string, direction: -1 | 1) {
    setSchema((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const items = [...section.items];
        const index = items.findIndex((item) => item.id === itemId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= items.length) return section;
        [items[index], items[target]] = [items[target]!, items[index]!];
        return { ...section, items: items.map((item, sortOrder) => ({ ...item, sortOrder })) };
      }),
    }));
  }

  return (
    <div className="space-y-4">
      {notice && (
        <Alert variant={notice.tone === "error" ? "destructive" : "default"}>
          {notice.tone === "error" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          <AlertTitle>{notice.tone === "error" ? "Niet opgeslagen" : "Opgeslagen"}</AlertTitle>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}
      {data.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{data.warnings.length} configuratiewaarschuwing(en)</AlertTitle>
          <AlertDescription>{data.warnings.slice(0, 3).map((warning) => warning.message).join(" · ")}</AlertDescription>
        </Alert>
      )}
      <Tabs defaultValue="templates">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="templates">Templates ({data.templates.length})</TabsTrigger>
          <TabsTrigger value="bindings">Koppelingen ({data.bindings.length})</TabsTrigger>
          <TabsTrigger value="preview">Waarom van toepassing?</TabsTrigger>
          <TabsTrigger value="work-orders">Werkbonchecklists ({data.assignmentChecklists.length})</TabsTrigger>
          <TabsTrigger value="review">Te beoordelen ({data.pendingReviews.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4 pt-2">
          <div className="flex justify-end">{canWrite && <Button onClick={openNewTemplate}><Plus />Nieuwe template</Button>}</div>
          {data.templates.length === 0 ? <Empty title="Nog geen checklisttemplates" text="Maak een versieerbare template en publiceer deze voordat je een koppeling toevoegt." /> : (
            <div className="grid gap-4 xl:grid-cols-2">
              {data.templates.map((template) => (
                <Card key={template.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />{template.name}</CardTitle><CardDescription>{template.familyKey} · {template.cardinality}</CardDescription></div>
                      <div className="flex gap-1"><Badge variant="outline">{template.status}</Badge>{template.protected && <Badge><ShieldCheck className="mr-1 h-3 w-3" />protected</Badge>}</div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{template.description || "Geen beschrijving."} · {template.bindingCount} actieve koppeling(en)</p>
                    <div className="space-y-2">
                      {template.versions.map((version) => (
                        <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                          <div><strong>Versie {version.versionNumber}</strong> <Badge variant="secondary">{version.status}</Badge><p className="text-xs text-muted-foreground">{version.publishedAt ? `Gepubliceerd ${formatDate(version.publishedAt)}` : version.changeSummary || "Concept"}</p></div>
                          <div className="flex flex-wrap gap-2">
                            {version.status === "draft" && canWrite && <Button size="sm" variant="outline" onClick={() => openDraft(template, version)}>Bewerken</Button>}
                            {version.status === "draft" && canPublish && (
                              <AlertDialog><AlertDialogTrigger asChild><Button size="sm"><Send />Publiceren</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Versie {version.versionNumber} publiceren?</AlertDialogTitle><AlertDialogDescription>Na publicatie zijn inhoud en stabiele item-ID’s onveranderlijk. Bestaande werkbonsnapshots schakelen niet automatisch over.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={() => run(() => publishChecklistVersionAction({ templateId: template.id, versionId: version.id }), "Versie gepubliceerd.")}>Publiceren</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                            )}
                            {version.status === "published" && canWrite && <Button size="sm" variant="outline" onClick={() => run(() => duplicateChecklistVersionAction({ templateId: template.id, sourceVersionId: version.id }), "Nieuwe conceptversie aangemaakt.")}>Nieuwe versie</Button>}
                          </div>
                        </div>
                      ))}
                    </div>
                    {canWrite && template.status !== "archived" && (
                      <AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="ghost"><Archive />Archiveren</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Template archiveren?</AlertDialogTitle><AlertDialogDescription>Nieuwe samenstellingen gebruiken deze template niet meer. Historische versies en snapshots blijven beschikbaar.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={() => run(() => archiveChecklistTemplateAction(template.id), "Template gearchiveerd.")}>Archiveren</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bindings" className="space-y-4 pt-2">
          <div className="flex justify-end">{canWrite && <Button onClick={() => setBindingOpen(true)} disabled={publishedTemplates.length === 0}><Plus />Nieuwe koppeling</Button>}</div>
          {data.bindings.length === 0 ? <Empty title="Nog geen koppelingen" text="Koppel gepubliceerde templates aan tenant, sector, klant, object(type), taakcode, combinaties of één werkbon." /> : data.bindings.map((binding) => (
            <Card key={binding.id}><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><strong>{binding.templateName || binding.targetLabel || "Onderdrukkingsregel"}</strong><Badge variant="outline">{binding.mode}</Badge><Badge variant={binding.status === "active" ? "default" : "secondary"}>{binding.status}</Badge>{binding.required && <Badge variant="destructive">verplicht</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{binding.sourceLabel}{binding.targetLabel ? ` → ${binding.targetLabel}` : ""}{binding.reason ? ` · ${binding.reason}` : ""}</p></div>{canWrite && <Button size="sm" variant="outline" onClick={() => run(() => setChecklistBindingStatusAction({ bindingId: binding.id, active: binding.status !== "active" }), binding.status === "active" ? "Koppeling gedeactiveerd." : "Koppeling geactiveerd.")}>{binding.status === "active" ? "Deactiveren" : "Activeren"}</Button>}</CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="preview" className="space-y-4 pt-2">
          <Card><CardHeader><CardTitle>Waarom is deze checklist van toepassing?</CardTitle><CardDescription>Preview gebruikt exact dezelfde resolutie-engine als runtime en wijzigt geen werkbon.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-col gap-2 sm:flex-row"><select aria-label="Werkbon voor preview" className={selectClass()} value={previewAssignmentId} onChange={(event) => setPreviewAssignmentId(event.target.value)}><option value="">Kies een werkbon…</option>{data.options.assignments.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><Button disabled={!previewAssignmentId || isPending} onClick={() => startTransition(async () => { const result = await previewAssignmentChecklistsAction(previewAssignmentId); if (result.success) setPreview(result.data as never); else setNotice({ tone: "error", text: result.error }); })}><Eye />Berekenen</Button></div>{preview && <><PreviewResult value={preview as never} />{canReview && <AlertDialog><AlertDialogTrigger asChild><Button variant="outline">Nieuwere versies bewust toepassen</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Nieuwere gepubliceerde versies toepassen?</AlertDialogTitle><AlertDialogDescription>Bekijk eerst bovenstaande impact. Vóór start worden snapshots gecontroleerd bijgewerkt; na start ontstaat uitsluitend een reviewvoorstel.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={() => run(() => upgradeAssignmentChecklistVersionsAction(previewAssignmentId), "Versie-upgrade verwerkt of ter beoordeling aangeboden.")}>Versies toepassen</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="work-orders" className="space-y-4 pt-2">
          <Card><CardHeader><CardTitle>Vastgelegde werkbonchecklists</CardTitle><CardDescription>Versie, status, voortgang en uitzonderingen op immutable snapshots.</CardDescription></CardHeader><CardContent className="space-y-4"><select aria-label="Werkbonchecklists filteren" className={selectClass()} value={snapshotAssignmentId} onChange={(event) => setSnapshotAssignmentId(event.target.value)}><option value="">Kies een werkbon…</option>{data.options.assignments.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>{data.assignmentChecklists.filter((checklist) => checklist.assignmentId === snapshotAssignmentId).map((checklist) => <div key={checklist.id} className="flex flex-col justify-between gap-3 rounded-md border p-3 md:flex-row md:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{checklist.displayName}</strong><Badge variant="outline">v{checklist.versionNumber}</Badge><Badge variant={checklist.status === "active" ? "default" : "secondary"}>{checklist.status}</Badge>{checklist.required && <Badge variant="destructive">verplicht</Badge>}{checklist.protected && <Badge><ShieldCheck className="mr-1 h-3 w-3" />protected</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{checklist.assignmentCode} · {checklist.responseCount} antwoorden · {checklist.evidenceCount} bewijsbestand(en)</p></div>{canReview && checklist.status === "active" && !checklist.protected && <div className="flex flex-wrap gap-2">{checklist.waivable && <Button size="sm" variant="outline" onClick={() => { setWaiver({ assignmentId: checklist.assignmentId, checklistId: checklist.id, kind: "waived", name: checklist.displayName }); setWaiverReason(""); }}>Waiver</Button>}{(!checklist.required || checklist.waivable) && <Button size="sm" variant="outline" onClick={() => { setWaiver({ assignmentId: checklist.assignmentId, checklistId: checklist.id, kind: "not_applicable", name: checklist.displayName }); setWaiverReason(""); }}>Niet van toepassing</Button>}</div>}</div>)}{snapshotAssignmentId && data.assignmentChecklists.every((checklist) => checklist.assignmentId !== snapshotAssignmentId) && <p className="text-sm text-muted-foreground">Deze werkbon heeft nog geen vastgelegde checklist.</p>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="review" className="space-y-4 pt-2">
          {canReview && <div className="flex justify-end"><Button variant="outline" onClick={() => run(() => retryChecklistReconciliationQueueAction(), "Herstelbatch verwerkt.")}>Vastgelopen verwerking opnieuw proberen</Button></div>}
          {data.pendingReviews.length === 0 ? <Empty title="Geen open reviewvoorstellen" text="Wijzigingen vanaf feitelijke start worden hier zichtbaar en nooit stil toegepast." /> : data.pendingReviews.map((event) => (
            <Card key={event.id}><CardHeader><CardTitle className="text-base">{event.assignmentCode} · {event.assignmentTitle}</CardTitle><CardDescription>{event.trigger} · {formatDate(event.createdAt)}</CardDescription></CardHeader><CardContent className="space-y-3"><p className="text-sm">{event.reviewReason}</p><DiffSummary diff={event.diff} />{canReview && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setReview({ eventId: event.id, decision: "keep_current" }); setReviewReason(""); }}>Huidige set behouden</Button><Button onClick={() => { setReview({ eventId: event.id, decision: "accept_changes" }); setReviewReason(""); }}><GitMerge />Wijzigingen accepteren</Button></div>}</CardContent></Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Conceptversie bewerken" : "Checklisttemplate maken"}</DialogTitle><DialogDescription>Item-ID’s blijven stabiel. Publiceren maakt deze versie onveranderlijk.</DialogDescription></DialogHeader>
          {!editing && <div className="grid gap-4 md:grid-cols-2"><Field label="Naam"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Familiesleutel"><Input value={familyKey} onChange={(event) => setFamilyKey(event.target.value)} placeholder="veiligheidscontrole" /></Field><Field label="Cardinaliteit"><select className={selectClass()} value={cardinality} onChange={(event) => setCardinality(event.target.value)}><option value="per_work_order">Eenmaal per werkbon</option><option value="per_object">Eenmaal per object</option><option value="per_task_code">Per unieke taakcode</option><option value="per_task_instance">Per concrete taakregel</option></select></Field><Field label="Beschrijving"><Input value={description} onChange={(event) => setDescription(event.target.value)} /></Field><Toggle label="Beschermd (geen suppress/waiver)" checked={isProtected} onChange={(value) => { setProtected(value); if (value) setWaivable(false); }} /><Toggle label="Vrijstelbaar met reden" checked={waivable} disabled={isProtected} onChange={setWaivable} /></div>}
          {editing && <Field label="Wijzigingssamenvatting"><Input value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} /></Field>}
          <div className="space-y-4">
            {schema.sections.map((section, sectionIndex) => (
              <Card key={section.id}><CardHeader className="pb-3"><div className="flex gap-2"><Input aria-label={`Titel sectie ${sectionIndex + 1}`} value={section.title} onChange={(event) => updateSection(section.id, { title: event.target.value })} /><Button size="icon" variant="ghost" aria-label="Sectie omhoog" disabled={sectionIndex === 0} onClick={() => moveSection(section.id, -1)}><ArrowUp /></Button><Button size="icon" variant="ghost" aria-label="Sectie omlaag" disabled={sectionIndex === schema.sections.length - 1} onClick={() => moveSection(section.id, 1)}><ArrowDown /></Button><Button size="icon" variant="ghost" aria-label="Sectie verwijderen" disabled={schema.sections.length === 1} onClick={() => setSchema((current) => ({ ...current, sections: current.sections.filter((item) => item.id !== section.id).map((item, sortOrder) => ({ ...item, sortOrder })) }))}><Trash2 /></Button></div><Input aria-label={`Beschrijving sectie ${sectionIndex + 1}`} value={section.description ?? ""} onChange={(event) => updateSection(section.id, { description: event.target.value || null })} placeholder="Optionele sectie-instructie" /><CardDescription>Stabiele ID: {section.id}</CardDescription></CardHeader><CardContent className="space-y-3">{section.items.map((item, itemIndex) => <ChecklistItemEditor key={item.id} item={item} availableItems={schema.sections.flatMap((candidate) => candidate.items).filter((candidate) => candidate.id !== item.id)} onChange={(patch) => updateItem(section.id, item.id, patch)} onRemove={() => removeItem(section.id, item.id)} onMoveUp={() => moveItem(section.id, item.id, -1)} onMoveDown={() => moveItem(section.id, item.id, 1)} canMoveUp={itemIndex > 0} canMoveDown={itemIndex < section.items.length - 1} />)}<Button variant="outline" size="sm" onClick={() => addItem(section.id)}><Plus />Vraag toevoegen</Button></CardContent></Card>
            ))}
            <Button variant="outline" onClick={() => setSchema((current) => ({ ...current, sections: [...current.sections, { id: stableId("section"), title: "Nieuwe sectie", description: null, sortOrder: current.sections.length, items: [] }] }))}><Plus />Sectie toevoegen</Button>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setBuilderOpen(false)}>Annuleren</Button><Button disabled={isPending} onClick={saveBuilder}>{isPending ? "Opslaan…" : "Concept opslaan"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <BindingDialog open={bindingOpen} onOpenChange={setBindingOpen} data={data} templates={publishedTemplates} pending={isPending} onSubmit={(input) => run(() => createChecklistBindingAction(input as never), "Koppeling aangemaakt.", () => setBindingOpen(false))} />

      <Dialog open={Boolean(review)} onOpenChange={(open) => !open && setReview(null)}><DialogContent><DialogHeader><DialogTitle>{review?.decision === "accept_changes" ? "Wijzigingen accepteren" : "Huidige checklistset behouden"}</DialogTitle><DialogDescription>Dit besluit wordt met actor, tijd en reden geaudit. Reeds ingevoerde antwoorden en media blijven behouden.</DialogDescription></DialogHeader><Field label="Reden"><Textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></Field><DialogFooter><Button variant="outline" onClick={() => setReview(null)}>Annuleren</Button><Button disabled={!reviewReason.trim() || isPending} onClick={() => review && run(() => reviewChecklistReconciliationAction({ ...review, reason: reviewReason }), "Reviewbesluit opgeslagen.", () => setReview(null))}>Besluit opslaan</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(waiver)} onOpenChange={(open) => !open && setWaiver(null)}><DialogContent><DialogHeader><DialogTitle>{waiver?.kind === "waived" ? "Checklist gemotiveerd vrijstellen" : "Checklist niet van toepassing maken"}</DialogTitle><DialogDescription>{waiver?.name}. De snapshot, bronnen, antwoorden en bewijzen blijven historisch bewaard.</DialogDescription></DialogHeader><Field label="Verplichte reden"><Textarea value={waiverReason} onChange={(event) => setWaiverReason(event.target.value)} /></Field><DialogFooter><Button variant="outline" onClick={() => setWaiver(null)}>Annuleren</Button><Button disabled={!waiverReason.trim() || isPending} onClick={() => waiver && run(() => waiveAssignmentChecklistAction({ assignmentId: waiver.assignmentId, assignmentChecklistId: waiver.checklistId, kind: waiver.kind, reason: waiverReason }), "Uitzondering geaudit en opgeslagen.", () => setWaiver(null))}>Besluit opslaan</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function ChecklistItemEditor({ item, availableItems, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: {
  item: BuilderItem;
  availableItems: BuilderItem[];
  onChange: (patch: Partial<BuilderItem>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const options = Array.isArray(item.validation?.options) ? item.validation.options.join(", ") : "";
  const min = typeof item.validation?.min === "number" ? String(item.validation.min) : "";
  const max = typeof item.validation?.max === "number" ? String(item.validation.max) : "";
  const visibleWhen = item.visibleWhen ?? null;
  const visibleItemId = typeof visibleWhen?.itemId === "string" ? visibleWhen.itemId : "";
  const visibleOperator = typeof visibleWhen?.operator === "string" ? visibleWhen.operator : "equals";
  const visibleValue = typeof visibleWhen?.value === "string" || typeof visibleWhen?.value === "number" || typeof visibleWhen?.value === "boolean" ? String(visibleWhen.value) : "";
  const visibilitySource = availableItems.find((candidate) => candidate.id === visibleItemId);
  const minimumPhotos = typeof item.evidence?.minimumPhotos === "number" ? item.evidence.minimumPhotos : 0;
  const setVisibility = (patch: Record<string, unknown>) => {
    const next = { ...(visibleWhen ?? {}), ...patch };
    onChange({ visibleWhen: typeof next.itemId === "string" && next.itemId ? next : null });
  };
  const setConditionValue = (raw: string) => {
    if (visibilitySource?.type === "checkbox") setVisibility({ value: raw === "true" });
    else if (["number", "measurement"].includes(visibilitySource?.type ?? "")) setVisibility({ value: raw === "" ? "" : Number(raw) });
    else setVisibility({ value: raw });
  };
  return <div className="space-y-3 rounded-md border bg-muted/20 p-3">
    <div className="grid gap-2 md:grid-cols-[180px_1fr_auto_auto_auto]"><select aria-label="Veldtype" className={selectClass()} value={item.type} onChange={(event) => onChange({ type: event.target.value, validation: null })}>{FIELD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Input aria-label="Vraaglabel" value={item.label} onChange={(event) => onChange({ label: event.target.value })} /><Button size="icon" variant="ghost" aria-label="Vraag omhoog" disabled={!canMoveUp} onClick={onMoveUp}><ArrowUp /></Button><Button size="icon" variant="ghost" aria-label="Vraag omlaag" disabled={!canMoveDown} onClick={onMoveDown}><ArrowDown /></Button><Button size="icon" variant="ghost" aria-label="Vraag verwijderen" onClick={onRemove}><Trash2 /></Button></div>
    <div className="grid gap-2 md:grid-cols-2"><Input aria-label="Vraagtoelichting" value={item.description ?? ""} onChange={(event) => onChange({ description: event.target.value || null })} placeholder="Toelichting bij het veld" /><Input aria-label="Medewerkerinstructie" value={item.instruction ?? ""} onChange={(event) => onChange({ instruction: event.target.value || null })} placeholder="Instructie voor medewerker" /><Toggle label="Verplicht" checked={Boolean(item.required)} onChange={(value) => onChange({ required: value })} /></div>
    {["single_choice", "multiple_choice"].includes(item.type) && <Field label="Keuzes (komma-gescheiden)"><Input value={options} onChange={(event) => onChange({ validation: { ...item.validation, options: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) } })} /></Field>}
    {["number", "measurement"].includes(item.type) && <div className="grid gap-2 md:grid-cols-3"><Input aria-label="Minimum" type="number" value={min} onChange={(event) => onChange({ validation: { ...item.validation, min: event.target.value === "" ? undefined : Number(event.target.value) } })} placeholder="Minimum" /><Input aria-label="Maximum" type="number" value={max} onChange={(event) => onChange({ validation: { ...item.validation, max: event.target.value === "" ? undefined : Number(event.target.value) } })} placeholder="Maximum" /><Input aria-label="Eenheid" value={String(item.validation?.unit ?? "")} onChange={(event) => onChange({ validation: { ...item.validation, unit: event.target.value } })} placeholder="Eenheid" /></div>}
    <div className="grid gap-2 rounded-md border bg-background p-3 md:grid-cols-3"><Field label="Alleen zichtbaar na"><select aria-label="Voorwaardelijk bronveld" className={selectClass()} value={visibleItemId} onChange={(event) => { const source = availableItems.find((candidate) => candidate.id === event.target.value); setVisibility({ itemId: event.target.value, value: source?.type === "checkbox" ? true : "" }); }}><option value="">Altijd zichtbaar</option>{availableItems.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label} ({candidate.id})</option>)}</select></Field><Field label="Voorwaarde"><select aria-label="Voorwaardelijke operator" className={selectClass()} disabled={!visibleItemId} value={visibleOperator} onChange={(event) => setVisibility({ operator: event.target.value })}><option value="equals">is gelijk aan</option><option value="not_equals">is niet gelijk aan</option><option value="answered">is ingevuld</option><option value="not_answered">is niet ingevuld</option></select></Field>{!["answered", "not_answered"].includes(visibleOperator) && <Field label="Waarde">{visibilitySource?.type === "checkbox" ? <select className={selectClass()} disabled={!visibleItemId} value={visibleValue} onChange={(event) => setConditionValue(event.target.value)}><option value="true">Ja</option><option value="false">Nee</option></select> : <Input disabled={!visibleItemId} type={["number", "measurement"].includes(visibilitySource?.type ?? "") ? "number" : "text"} value={visibleValue} onChange={(event) => setConditionValue(event.target.value)} />}</Field>}</div>
    <div className="grid gap-2 rounded-md border bg-background p-3 md:grid-cols-3"><Field label="Minimaal foto’s"><Input type="number" min={0} value={minimumPhotos} onChange={(event) => onChange({ evidence: { ...item.evidence, minimumPhotos: Math.max(0, Number(event.target.value)) } })} /></Field><Toggle label="Handtekening bij dit item" checked={item.evidence?.signatureRequired === true} onChange={(value) => onChange({ evidence: { ...item.evidence, signatureRequired: value } })} /><Toggle label="Toelichting verplicht bij afwijking" checked={item.evidence?.deviationNoteRequired === true} onChange={(value) => onChange({ evidence: { ...item.evidence, deviationNoteRequired: value } })} /></div>
    <p className="text-xs text-muted-foreground">Stabiele item-ID: {item.id}</p>
  </div>;
}

function BindingDialog({ open, onOpenChange, data, templates, pending, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; data: ChecklistManagementData; templates: ChecklistManagementData["templates"]; pending: boolean; onSubmit: (input: Record<string, unknown>) => void }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [versionStrategy, setVersionStrategy] = useState<"latest_published" | "pinned">("latest_published");
  const [templateVersionId, setTemplateVersionId] = useState("");
  const [mode, setMode] = useState("add");
  const [sectorId, setSectorId] = useState(""); const [customerId, setCustomerId] = useState(""); const [objectId, setObjectId] = useState(""); const [objectType, setObjectType] = useState(""); const [taskCodeId, setTaskCodeId] = useState(""); const [assignmentId, setAssignmentId] = useState("");
  const [targetTemplateId, setTargetTemplateId] = useState(""); const [targetFamilyKey, setTargetFamilyKey] = useState(""); const [reason, setReason] = useState("");
  const [activeFrom, setActiveFrom] = useState(""); const [activeUntil, setActiveUntil] = useState("");
  const [autoAttach, setAutoAttach] = useState(true); const [required, setRequired] = useState(false); const [skipAllowed, setSkipAllowed] = useState(true);
  const [beforeStart, setBeforeStart] = useState(false); const [beforeComplete, setBeforeComplete] = useState(false); const [beforeReport, setBeforeReport] = useState(false);
  const [minimumPhotos, setMinimumPhotos] = useState(0); const [signature, setSignature] = useState(false); const [deviationNote, setDeviationNote] = useState(false);
  const [displayName, setDisplayName] = useState(""); const [instruction, setInstruction] = useState(""); const [instructionMode, setInstructionMode] = useState<"append" | "replace">("append");
  const [sortOrder, setSortOrder] = useState(0); const [tieBreaker, setTieBreaker] = useState(0);
  const publishedVersions = templates.find((template) => template.id === templateId)?.versions.filter((version) => version.status === "published") ?? [];
  const selectedVersionId = publishedVersions.some((version) => version.id === templateVersionId) ? templateVersionId : publishedVersions[0]?.id ?? "";
  const blockingMoments = [beforeStart ? "before_start" : null, beforeComplete ? "before_complete" : null, beforeReport ? "before_report_submit" : null].filter((value): value is string => Boolean(value));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Contextuele koppeling</DialogTitle><DialogDescription>Alle ingevulde selectors moeten overeenkomen. Combinaties krijgen prioriteit 900; een handmatige werkbonoverride 1000.</DialogDescription></DialogHeader>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Modus"><select className={selectClass()} value={mode} onChange={(event) => { setMode(event.target.value); if (event.target.value === "available") setAutoAttach(false); }}><option value="add">Toevoegen</option><option value="available">Alleen beschikbaar</option><option value="replace">Expliciet vervangen</option><option value="suppress">Expliciet onderdrukken</option></select></Field>
      {mode !== "suppress" && <><Field label="Template"><select className={selectClass()} value={templateId} onChange={(event) => { setTemplateId(event.target.value); setTemplateVersionId(""); }}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field><Field label="Versiestrategie"><select className={selectClass()} value={versionStrategy} onChange={(event) => setVersionStrategy(event.target.value as "latest_published" | "pinned")}><option value="latest_published">Nieuwste gepubliceerd voor nieuwe snapshots</option><option value="pinned">Vaste gepubliceerde versie</option></select></Field>{versionStrategy === "pinned" && <Field label="Vaste versie"><select className={selectClass()} value={selectedVersionId} onChange={(event) => setTemplateVersionId(event.target.value)}>{publishedVersions.map((version) => <option key={version.id} value={version.id}>Versie {version.versionNumber}</option>)}</select></Field>}</>}
      <Option label="Sector" value={sectorId} setValue={setSectorId} options={data.options.sectors} /><Option label="Klant" value={customerId} setValue={setCustomerId} options={data.options.customers} /><Option label="Object" value={objectId} setValue={setObjectId} options={data.options.objects} /><Field label="Objecttype"><Input value={objectType} onChange={(event) => setObjectType(event.target.value)} placeholder="bijv. kantoor" /></Field><Option label="Taakcode" value={taskCodeId} setValue={setTaskCodeId} options={data.options.taskCodes} /><Option label="Handmatige werkbonoverride" value={assignmentId} setValue={setAssignmentId} options={data.options.assignments} />
      {["replace", "suppress"].includes(mode) && <><Option label="Doeltemplate" value={targetTemplateId} setValue={setTargetTemplateId} options={templates.map((template) => ({ id: template.id, label: template.name }))} /><Field label="Of family key"><Input value={targetFamilyKey} onChange={(event) => setTargetFamilyKey(event.target.value)} /></Field><Field label="Verplichte reden"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Field></>}
      <Field label="Actief vanaf"><Input type="datetime-local" value={activeFrom} onChange={(event) => setActiveFrom(event.target.value)} /></Field><Field label="Actief tot"><Input type="datetime-local" value={activeUntil} onChange={(event) => setActiveUntil(event.target.value)} /></Field>
      <Toggle label="Automatisch toevoegen" checked={mode !== "available" && autoAttach} disabled={mode === "available" || mode === "suppress"} onChange={setAutoAttach} /><Toggle label="Verplicht" checked={required} onChange={(value) => { setRequired(value); if (value) { setSkipAllowed(false); setBeforeComplete(true); } }} /><Toggle label="Overslaan toegestaan" checked={skipAllowed} disabled={required} onChange={setSkipAllowed} />
      <Toggle label="Blokkeer vóór start" checked={beforeStart} onChange={setBeforeStart} /><Toggle label="Blokkeer vóór afronden" checked={beforeComplete} onChange={setBeforeComplete} /><Toggle label="Blokkeer vóór rapport indienen" checked={beforeReport} onChange={setBeforeReport} />
      <Field label="Minimum foto’s"><Input type="number" min={0} value={minimumPhotos} onChange={(event) => setMinimumPhotos(Number(event.target.value))} /></Field><Toggle label="Handtekening vereist" checked={signature} onChange={setSignature} /><Toggle label="Toelichting bij afwijking" checked={deviationNote} onChange={setDeviationNote} />
      <Field label="Weergavenaam"><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></Field><Field label="Instructie"><Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} /></Field><Field label="Instructiemodus"><select className={selectClass()} value={instructionMode} onChange={(event) => setInstructionMode(event.target.value as "append" | "replace")}><option value="append">Aanvullen</option><option value="replace">Expliciet vervangen</option></select></Field>
      <Field label="Sortering"><Input type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></Field><Field label="Tie-breaker (alleen gelijk niveau)"><Input type="number" value={tieBreaker} onChange={(event) => setTieBreaker(Number(event.target.value))} /></Field>
    </div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button><Button disabled={pending || (versionStrategy === "pinned" && mode !== "suppress" && !selectedVersionId)} onClick={() => onSubmit({ templateId: mode === "suppress" ? null : templateId, templateVersionId: versionStrategy === "pinned" ? selectedVersionId : null, versionStrategy, mode, selectors: { sectorId: sectorId || null, customerId: customerId || null, objectId: objectId || null, objectType: objectType || null, taskCodeId: taskCodeId || null, assignmentId: assignmentId || null }, targetTemplateId: targetTemplateId || null, targetFamilyKey: targetFamilyKey || null, activeFrom: activeFrom || null, activeUntil: activeUntil || null, autoAttach: mode !== "available" && mode !== "suppress" && autoAttach, required, blockingMoments, skipAllowed, minimumPhotos, signatureRequired: signature, deviationNoteRequired: deviationNote, displayName: displayName || null, instruction: instruction || null, instructionMode, reason: reason || null, sortOrder, tieBreaker })}>Koppeling opslaan</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function PreviewResult({ value }: { value: { resolution: { instances: Array<{ identity: string; effective: { displayName: string; required: boolean; minimumPhotos: number; causedBy: Record<string, string[]> }; cardinalityKey: string; versionNumber: number; sources: Array<{ bindingId: string; priority: number; decisions: string[] }> }>; suppressed: unknown[]; replaced: unknown[]; warnings: Array<{ message: string }> }; plan: { lifecycle: string; changes: Array<{ kind: string; identity: string; reasons: string[] }> } } }) {
  return <div className="space-y-3"><div className="flex flex-wrap gap-2"><Badge>{value.resolution.instances.length} toegevoegd</Badge><Badge variant="outline">levenscyclus {value.plan.lifecycle}</Badge><Badge variant="outline">{value.plan.changes.length} verschil(len)</Badge></div>{value.resolution.instances.map((item) => <div key={item.identity} className="rounded-md border p-3"><strong>{item.effective.displayName}</strong><p className="text-sm text-muted-foreground">Versie {item.versionNumber} · {item.cardinalityKey} · {item.effective.required ? "verplicht" : "optioneel"} · min. {item.effective.minimumPhotos} foto’s</p><ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{item.sources.map((source) => <li key={`${item.identity}-${source.bindingId}`}>Bron {source.bindingId} · prioriteit {source.priority} · {source.decisions.join(", ")}</li>)}</ul></div>)}{value.resolution.warnings.map((warning, index) => <Alert key={index}><AlertTriangle className="h-4 w-4" /><AlertDescription>{warning.message}</AlertDescription></Alert>)}</div>;
}

function DiffSummary({ diff }: { diff: Record<string, unknown> }) {
  const counts = diff.counts && typeof diff.counts === "object" ? diff.counts as Record<string, unknown> : {};
  const changes = Array.isArray(diff.changes) ? diff.changes as Array<Record<string, unknown>> : [];
  return <div className="rounded-md border bg-muted/20 p-3 text-sm"><p>{Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join(" · ") || `${changes.length} wijziging(en)`}</p>{changes.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{changes.slice(0, 8).map((change, index) => <li key={index}>{String(change.kind)} · {Array.isArray(change.reasons) ? change.reasons.join(", ") : ""}</li>)}</ul>}</div>;
}

function Empty({ title, text }: { title: string; text: string }) { return <Card><CardContent className="py-10 text-center"><ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{text}</p></CardContent></Card>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) { return <label className="flex min-h-9 items-center gap-2 text-sm"><Checkbox checked={checked} disabled={disabled} onCheckedChange={(value) => onChange(value === true)} />{label}</label>; }
function Option({ label, value, setValue, options }: { label: string; value: string; setValue: (value: string) => void; options: Array<{ id: string; label: string }> }) { return <Field label={label}><select className={selectClass()} value={value} onChange={(event) => setValue(event.target.value)}><option value="">Niet ingesteld</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Field>; }

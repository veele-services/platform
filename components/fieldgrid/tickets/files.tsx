"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import Image from "next/image";
import { Camera, Download, FileText, Image as ImageIcon, Paperclip, RotateCcw, X } from "lucide-react";
import type { TicketAudience, TicketFile, TicketWorkspace } from "@/lib/tickets/model";
import { ticketBytes } from "./presentation";

export type DraftTicketFile = {
  key: string; file: File; requestId: string; id?: string; uploadUrl?: string; progress: number;
  status: "selected" | "uploading" | TicketFile["scanState"]; error?: string;
};
type UploadReply = { ok: boolean; error?: string; uploadUrl?: string; file?: { id: string; status: TicketFile["scanState"] } };
const scanLabels: Record<string, string> = { selected: "Klaar om te uploaden", uploading: "Uploaden", pending: "Wordt gecontroleerd", processing: "Wordt gecontroleerd", clean: "Beschikbaar", rejected: "Geblokkeerd", error: "Controle niet gelukt" };

function sendBytes(url: string, file: File, onProgress: (progress: number) => void): Promise<UploadReply> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type);
    request.timeout = 120000;
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    request.onerror = request.ontimeout = () => reject(new Error("De upload is niet bevestigd. Probeer dit bestand opnieuw."));
    request.onload = () => {
      try { const result = JSON.parse(request.responseText) as UploadReply; if (request.status >= 400 || !result.ok) reject(new Error(result.error || "Dit bestand kon niet worden verwerkt.")); else resolve(result); }
      catch (error) { reject(error instanceof Error ? error : new Error("De upload is niet bevestigd.")); }
    };
    request.send(file);
  });
}

export function TicketFilePicker({ workspace, tenantId, categoryId, ticketId, audience, draftId, files, setFiles, disabled = false }: {
  workspace: TicketWorkspace; tenantId: string; categoryId: string; ticketId?: string; audience: TicketAudience; draftId: string;
  files: DraftTicketFile[]; setFiles: Dispatch<SetStateAction<DraftTicketFile[]>>; disabled?: boolean;
}) {
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<string[]>([]);
  const processing = useRef(new Set<string>());
  const latest = useRef(files);
  useEffect(() => { latest.current = files; }, [files]);
  const update = (key: string, patch: Partial<DraftTicketFile>) => setFiles(current => current.map(file => file.key === key ? { ...file, ...patch } : file));
  const upload = async (item: DraftTicketFile) => {
    if (!categoryId || processing.current.has(item.key)) return;
    processing.current.add(item.key);
    update(item.key, { status: "uploading", error: undefined, progress: 0 });
    try {
      let url = item.uploadUrl;
      if (!url) {
        const response = await fetch("/api/tickets/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, tenantId, categoryId, ticketId, audience, draftId, requestId: item.requestId, name: item.file.name, mime: item.file.type, size: item.file.size }) });
        const result = await response.json() as UploadReply;
        if (!response.ok || !result.ok || !result.file?.id || !result.uploadUrl) throw new Error(result.error || "De upload kon niet worden voorbereid.");
        url = result.uploadUrl;
        update(item.key, { id: result.file.id, uploadUrl: url });
      }
      const result = await sendBytes(url, item.file, progress => update(item.key, { progress }));
      if (!result.file) throw new Error("De bestandscontrole is niet bevestigd.");
      update(item.key, { id: result.file.id, status: result.file.status, progress: 100 });
    } catch (error) { update(item.key, { status: "error", error: error instanceof Error ? error.message : "Het bestand kon niet worden geüpload." }); }
    finally { processing.current.delete(item.key); }
  };
  useEffect(() => {
    let active = true;
    const poll = async () => {
      const waiting = latest.current.filter(file => file.uploadUrl && ["pending", "processing"].includes(file.status));
      await Promise.all(waiting.map(async file => {
        try {
          const response = await fetch(`${file.uploadUrl}${file.uploadUrl!.includes("?") ? "&" : "?"}status=1`, { cache: "no-store" });
          const result = await response.json() as UploadReply;
          if (!active) return;
          if (!response.ok || !result.ok || !result.file) throw new Error(result.error || "Bestandscontrole niet beschikbaar.");
          setFiles(current => current.map(item => item.key === file.key ? { ...item, status: result.file!.status, error: undefined } : item));
        } catch { if (active) setFiles(current => current.map(item => item.key === file.key ? { ...item, error: "De controlestatus is niet beschikbaar. We proberen het opnieuw." } : item)); }
      }));
    };
    const timer = window.setInterval(() => { void poll(); }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [setFiles]);
  const add = (selected: File[]) => {
    setError("");
    if (!categoryId) { setError("Kies eerst een categorie."); return; }
    if (files.length + selected.length > 5) { setError("Je kunt maximaal vijf bestanden toevoegen."); return; }
    const invalid = selected.find(file => !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type) || file.size > 10 * 1024 * 1024 || !file.size);
    if (invalid) { setError("Gebruik JPG, PNG, WebP of PDF, maximaal 10 MB per bestand."); return; }
    const added: DraftTicketFile[] = selected.map(file => ({ key: crypto.randomUUID(), requestId: crypto.randomUUID(), file, progress: 0, status: "selected" }));
    setFiles(current => [...current, ...added]);
    added.forEach(file => { void upload(file); });
  };
  const remove = async (file: DraftTicketFile) => {
    if (processing.current.has(file.key)) return;
    processing.current.add(file.key);
    setRemoving(current => [...current, file.key]);
    try {
      if (file.uploadUrl) {
        const response = await fetch(file.uploadUrl, { method: "DELETE" });
        const result = await response.json() as UploadReply;
        if (!response.ok || !result.ok) throw new Error(result.error || "Het bestand kon niet worden verwijderd. Probeer opnieuw.");
      }
      setFiles(current => current.filter(item => item.key !== file.key));
    } catch (error) { update(file.key, { error: error instanceof Error ? error.message : "Verwijderen is niet bevestigd." }); }
    finally { processing.current.delete(file.key); setRemoving(current => current.filter(key => key !== file.key)); }
  };
  return <div>
    <div className="ticket-dropzone" data-drag={dragging} onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled) add(Array.from(event.dataTransfer.files)); }}>
      <p>Voeg zo nodig foto’s of een PDF toe. Maximaal vijf bestanden van elk 10 MB. Bestanden worden vóór verzending gecontroleerd.</p>
      <div className="ticket-upload-buttons"><label className="secondary-button"><Paperclip size={15}/>Bestand kiezen<input aria-label="Bijlagen toevoegen" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple disabled={disabled || files.length >= 5} onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = ""; }}/></label><label className="secondary-button"><Camera size={15}/>Foto maken<input aria-label="Foto maken" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={disabled || files.length >= 5} onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = ""; }}/></label></div>
    </div>
    {error && <p className="ticket-error" role="alert">{error}</p>}
    <div className="ticket-files" aria-live="polite">{files.map(file => <div className="ticket-file" key={file.key}><FileText size={20}/><div><strong>{file.file.name}</strong><small>{ticketBytes(file.file.size)} · {scanLabels[file.status]}</small>{file.status === "uploading" && <progress value={file.progress} max={100} aria-label={`Upload ${file.file.name}`}/>} {file.error && <small role="status">{file.error}</small>}</div><div className="ticket-actions">{file.status === "error" && <button type="button" className="resource-action" disabled={disabled} aria-label={`${file.file.name} opnieuw uploaden`} onClick={() => { void upload(file); }}><RotateCcw size={15}/></button>}<button type="button" className="resource-action" disabled={disabled || file.status === "uploading" || removing.includes(file.key)} onClick={() => { void remove(file); }} aria-label={`${file.file.name} verwijderen`}><X size={15}/></button></div></div>)}</div>
    {files.some(file => file.status !== "clean") && <p className="ticket-muted" role="status">Je bericht is nog niet verstuurd. Wacht tot alle gekozen bestanden beschikbaar zijn of verwijder een geblokkeerd bestand.</p>}
  </div>;
}

export function TicketFiles({ files }: { files: TicketFile[] }) {
  return <div className="ticket-files">{files.map(file => <div className="ticket-file" key={file.id}>{file.scanState === "clean" && file.previewHref && file.mime.startsWith("image/") ? <Image src={file.previewHref} alt="" width={48} height={48} unoptimized/> : file.mime.startsWith("image/") ? <ImageIcon size={20}/> : <FileText size={20}/>}<div><strong>{file.name}</strong><small>{ticketBytes(file.size)} · {scanLabels[file.scanState]}</small></div>{file.scanState === "clean" && file.downloadHref && <a href={file.downloadHref} target="_blank" rel="noreferrer" className="resource-action"><Download size={14}/>Openen</a>}</div>)}</div>;
}

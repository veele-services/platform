"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { getDocumentDownloadUrl } from "@/actions/documents";

interface Props {
  documentId: string;
  filename:   string;
}

export function DocumentDownloadButton({ documentId, filename }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDownload() {
    setError(null);
    startTransition(async () => {
      const result = await getDocumentDownloadUrl(documentId);
      if (result.success) {
        const a = document.createElement("a");
        a.href = result.url;
        a.download = filename;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-50"
        style={{ backgroundColor: "rgba(0,183,179,0.1)", color: "var(--color-accent-accessible)" }}
      >
        {pending ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Download size={12} />
        )}
        Downloaden
      </button>
      {error && (
        <p className="mt-1 text-xs" style={{ color: "var(--color-destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

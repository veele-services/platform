"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Loader2 } from "lucide-react";
import { uploadMyAvatar } from "@/actions/personnel";

export function AvatarUploadForm({
  avatarUrl,
  initials,
  fullName,
  subtitle,
}: {
  avatarUrl: string | null;
  initials: string;
  fullName: string;
  subtitle: string;
}) {
  const [state, formAction, isPending] = useActionState(
    uploadMyAvatar,
    undefined,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const feedback = useMemo(() => {
    if (state?.success) return "Foto opgeslagen";
    if (state?.error) return state.error;
    if (fileName) return fileName;
    return "JPG, PNG of WebP tot 3 MB";
  }, [fileName, state]);

  return (
    <form action={formAction} className="flex items-center gap-4">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[28px] bg-[#E8FBFA]">
        {previewUrl || avatarUrl ? (
          <img
            src={previewUrl ?? avatarUrl ?? undefined}
            alt={fullName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl font-black text-[#009E9A]">
            {initials}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-2xl font-black leading-tight text-[#081D3A]">
          {fullName}
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-[#D8E8F3] bg-white px-3 py-2 text-xs font-black text-[#081D3A] shadow-sm">
            <Camera size={16} strokeWidth={2.4} className="text-[#009E9A]" />
            Kies foto
            <input
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setFileName(file?.name ?? null);
                setPreviewUrl((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return file ? URL.createObjectURL(file) : null;
                });
              }}
            />
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-2xl bg-[#00B7B3] px-3 py-2 text-xs font-black text-white shadow-sm disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : state?.success ? (
              <CheckCircle2 size={14} />
            ) : null}
            Opslaan
          </button>
        </div>
        <p
          className={`mt-2 truncate text-xs font-semibold ${
            state?.error ? "text-red-600" : "text-slate-500"
          }`}
        >
          {feedback}
        </p>
      </div>
    </form>
  );
}
